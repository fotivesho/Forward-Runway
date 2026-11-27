import "server-only";
import { createClient as createSupabase } from "@supabase/supabase-js";
import { DB_SCHEMA, SUPABASE_URL } from "../supabase/config";
import type { AppSupabaseClient } from "../supabase/server";
import { bankApi } from "./client";
import { plaidEnv, plaidMode } from "./config";
import { decryptToken, encryptToken, tokenKey } from "./crypto";
import { accountBalanceCents, accountKind, accountName, cardFields, pendingOwedCents, settleStatement, statementRow, transactionRow } from "./map";
import { PlaidError, type BankApi, type PlaidTransaction } from "./types";

/**
 * Bank sync. Two database clients on purpose:
 *  - the signed-in user's client (row-level security) writes their accounts, transactions and statements;
 *  - the server-only admin client touches app.bank_secrets / app.bank_connections, always filtered to that user.
 */
function admin() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !key) throw new Error("Bank connections need SUPABASE_SERVICE_ROLE_KEY on the server.");
  return createSupabase(SUPABASE_URL, key, { db: { schema: DB_SCHEMA }, auth: { persistSession: false, autoRefreshToken: false } });
}

const key = () => tokenKey(plaidEnv("PLAID_TOKEN_KEY"), plaidMode() === "mock");

/** "12 minutes ago", "3 hours ago", "2 days ago". */
function agoText(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins} minutes ago`;
  const h = Math.round(mins / 60);
  if (h < 36) return `${h} hour${h === 1 ? "" : "s"} ago`;
  return `${Math.round(h / 24)} days ago`;
}

function api(): BankApi {
  const b = bankApi();
  if (!b) throw new Error("Bank connections aren't set up on this server.");
  return b;
}

/** A friendly, safe message for anything that goes wrong talking to the bank. */
export function bankErrorMessage(e: unknown): { status: "needs_reauth" | "error"; message: string } {
  if (e instanceof PlaidError && ["ITEM_LOGIN_REQUIRED", "PENDING_EXPIRATION", "ACCESS_NOT_GRANTED", "INVALID_ACCESS_TOKEN"].includes(e.code)) {
    return { status: "needs_reauth", message: "Your bank needs you to sign in again." };
  }
  if (e instanceof PlaidError) return { status: "error", message: e.message.slice(0, 280) };
  return { status: "error", message: "Couldn't reach your bank just now. Try again in a little while." };
}

export async function linkToken(userId: string, connectionId?: string): Promise<string> {
  if (!connectionId) return api().createLinkToken(userId);
  const { data } = await admin().from("bank_secrets").select("access_token_enc").eq("connection_id", connectionId).eq("user_id", userId).maybeSingle();
  if (!data) throw new Error("That bank connection no longer exists.");
  return api().createLinkToken(userId, decryptToken(String(data.access_token_enc), key()));
}

/** After Plaid Link: keep the (encrypted) token, record the connection, and pull everything in. */
export async function connectBank(supabase: AppSupabaseClient, userId: string, publicToken: string, institutionName: string | null, today: string) {
  const { accessToken, itemId } = await api().exchangePublicToken(publicToken);
  const db = admin();
  // Same bank and accounts as a connection you already have? Move it onto those accounts instead of adding copies.
  const same = await sameAccountsAs(userId, accessToken, itemId);
  if (same) return adoptConnection(supabase, userId, same, accessToken, itemId, today);
  const { data: existing } = await db.from("bank_secrets").select("connection_id").eq("item_id", itemId).eq("user_id", userId).maybeSingle();
  let connectionId = existing?.connection_id as string | undefined;
  if (!connectionId) {
    const { data: conn, error } = await db
      .from("bank_connections")
      .insert({ user_id: userId, institution_name: institutionName?.slice(0, 100) ?? null })
      .select("id")
      .single();
    if (error || !conn) throw new Error("Couldn't save the bank connection.");
    connectionId = String(conn.id);
    const { error: secretError } = await db.from("bank_secrets").insert({ connection_id: connectionId, user_id: userId, item_id: itemId, access_token_enc: encryptToken(accessToken, key()) });
    if (secretError) {
      await db.from("bank_connections").delete().eq("id", connectionId).eq("user_id", userId);
      await api().removeItem(accessToken).catch(() => {});
      throw new Error("Couldn't save the bank connection.");
    }
  } else {
    await db.from("bank_secrets").update({ access_token_enc: encryptToken(accessToken, key()) }).eq("connection_id", connectionId).eq("user_id", userId);
  }
  return syncBank(supabase, userId, connectionId, today);
}

export interface SyncResult {
  ok: boolean;
  message: string;
  /** The bank was asked for fresh activity: worth checking again in a little while. */
  refreshed?: boolean;
  accounts: number;
  added: number;
  /** When the sync read the bank's full list (no cursor): every transaction id it sent. */
  seen?: Set<string>;
}

/** Balances, card statements and new transactions for one connection. Safe to run any time. */
export async function syncBank(supabase: AppSupabaseClient, userId: string, connectionId: string, today: string, opts: { refresh?: boolean } = {}): Promise<SyncResult> {
  const db = admin();
  const { data: secret } = await db.from("bank_secrets").select("access_token_enc, sync_cursor").eq("connection_id", connectionId).eq("user_id", userId).maybeSingle();
  if (!secret) return { ok: false, message: "That bank connection no longer exists.", accounts: 0, added: 0 };
  try {
    const token = decryptToken(String(secret.access_token_enc), key());
    const bank = api();
    // Asked for by you (Sync now): have the bank send its newest activity, pending included.
    const refreshed = opts.refresh && bank.refreshTransactions ? await bank.refreshTransactions(token) : false;
    const { accounts: bankAccounts, institutionName } = await bank.getAccounts(token);
    const liabilities = bankAccounts.some((a) => a.type === "credit") ? await bank.getLiabilities(token) : [];
    const now = new Date().toISOString();

    // Accounts: update the ones we know, add the new ones. Names you've changed are kept.
    const { data: known } = await supabase.from("accounts").select("id, external_id, kind, payment_account_id").not("external_id", "is", null);
    const byExternal = new Map((known ?? []).map((a) => [String(a.external_id), a]));
    const idFor = new Map<string, { id: string; kind: ReturnType<typeof accountKind> }>();
    /** Each card's owed balance as the bank reports it, before pending purchases are added. */
    const cardBase = new Map<string, number>();
    for (const a of bankAccounts) {
      const kind = accountKind(a);
      if (!kind) continue;
      const liability = liabilities.find((l) => l.account_id === a.account_id);
      if (kind === "credit_card") cardBase.set(a.account_id, accountBalanceCents(a) ?? 0);
      const common = {
        balance_cents: accountBalanceCents(a),
        balance_as_of: today,
        balance_source: "bank",
        balance_updated_at: now,
        bank_connection_id: connectionId,
        ...(kind === "credit_card" ? { credit_limit_cents: a.balances.limit != null ? Math.round(a.balances.limit * 100) : null, ...(liability ? cardFields(liability) : {}) } : {}),
      };
      const current = byExternal.get(a.account_id);
      if (current) {
        const { error } = await supabase.from("accounts").update(common).eq("id", current.id);
        if (error) throw new Error("Couldn't update an account.");
        idFor.set(a.account_id, { id: String(current.id), kind });
      } else {
        const { data, error } = await supabase
          .from("accounts")
          .insert({ ...common, user_id: userId, external_id: a.account_id, name: accountName(a), kind, is_spendable: kind === "checking" })
          .select("id")
          .single();
        if (error || !data) throw new Error("Couldn't add an account.");
        idFor.set(a.account_id, { id: String(data.id), kind });
      }
    }

    // Cards are paid from checking: link them if you haven't chosen already.
    const checking = [...idFor.values()].find((v) => v.kind === "checking");
    if (checking) {
      for (const [ext, v] of idFor) {
        if (v.kind !== "credit_card") continue;
        const before = byExternal.get(ext);
        if (!before?.payment_account_id) await supabase.from("accounts").update({ payment_account_id: checking.id }).eq("id", v.id).is("payment_account_id", null);
      }
    }

    // Transactions, page by page from the last cursor.
    let cursor = (secret.sync_cursor as string | null) ?? null;
    const seen = cursor ? undefined : new Set<string>();
    let added = 0;
    for (let page = 0; page < 50; page++) {
      const r = await bank.syncTransactions(token, cursor);
      const rows = [...r.added, ...r.modified]
        .map((t: PlaidTransaction) => {
          const target = idFor.get(t.account_id);
          return target ? transactionRow(t, target.id, target.kind) : null;
        })
        .filter((x): x is NonNullable<typeof x> => !!x)
        .map((x) => ({ ...x, user_id: userId }));
      for (let i = 0; i < rows.length; i += 500) {
        const { error } = await supabase.from("transactions").upsert(rows.slice(i, i + 500), { onConflict: "user_id,external_id" });
        if (error) throw new Error("Couldn't save transactions.");
      }
      const removed = r.removed.map((x) => x.transaction_id);
      if (removed.length) await supabase.from("transactions").delete().in("external_id", removed);
      added += r.added.length;
      if (seen) for (const t of [...r.added, ...r.modified]) seen.add(t.transaction_id);
      cursor = r.next_cursor;
      if (!r.has_more) break;
    }

    await foldOldCopies(supabase, [...idFor.values()].map((v) => v.id));

    // Cards: what you owe includes pending purchases (the bank's "current" balance doesn't).
    for (const [ext, v] of idFor) {
      if (v.kind !== "credit_card") continue;
      const base = cardBase.get(ext);
      if (base == null) continue;
      const { data: pending } = await supabase.from("transactions").select("amount_cents, direction").eq("account_id", v.id).eq("pending", true);
      const owed = base + pendingOwedCents((pending ?? []).map((r) => ({ amount_cents: Number(r.amount_cents), direction: r.direction as "in" | "out" })));
      if (owed !== base) await supabase.from("accounts").update({ balance_cents: Math.max(0, owed) }).eq("id", v.id);
    }

    // Card statements: the latest from the bank, counting every payment made since it closed.
    // Earlier statements are settled: anything unpaid on them rolled into the latest one's balance.
    for (const l of liabilities) {
      const target = l.account_id ? idFor.get(l.account_id) : undefined;
      const row = target ? statementRow(l, target.id) : null;
      if (!target || !row) continue;
      const { data: pays } = await supabase
        .from("transactions")
        .select("date, amount_cents")
        .eq("account_id", target.id)
        .eq("direction", "in")
        .eq("category", "Card payment")
        .gt("date", row.closing_date);
      const settled = settleStatement(row, (pays ?? []).map((r) => ({ date: String(r.date), cents: Number(r.amount_cents) })));
      await supabase.from("card_statements").upsert({ ...settled, user_id: userId }, { onConflict: "account_id,closing_date" });
      await supabase
        .from("card_statements")
        .update({ status: "paid" })
        .eq("account_id", target.id)
        .lt("closing_date", row.closing_date)
        .neq("status", "paid");
    }

    await db.from("bank_secrets").update({ sync_cursor: cursor }).eq("connection_id", connectionId).eq("user_id", userId);
    await db
      .from("bank_connections")
      .update({ status: "ok", last_synced_at: now, last_error: null, ...(institutionName ? { institution_name: institutionName } : {}) })
      .eq("id", connectionId)
      .eq("user_id", userId);
    // Say how fresh the bank's own data is, so "nothing new" is easy to read.
    const st = bank.itemStatus ? await bank.itemStatus(token) : null;
    const bankName = institutionName ?? "Your bank";
    const fresh = st?.lastSuccess ? ` ${bankName} last sent new activity ${agoText(st.lastSuccess)}.` : "";
    const problem = st?.error ? ` ${bankName} reports: ${st.error}` : "";
    return {
      ok: true,
      message: `Synced ${idFor.size} account${idFor.size === 1 ? "" : "s"}${added ? ` and ${added} new transaction${added === 1 ? "" : "s"}` : ", nothing new yet"}.${fresh}${problem}`,
      accounts: idFor.size,
      added,
      seen,
      refreshed,
    };
  } catch (e) {
    const { status, message } = bankErrorMessage(e);
    await db.from("bank_connections").update({ status, last_error: message }).eq("id", connectionId).eq("user_id", userId);
    return { ok: false, message, accounts: 0, added: 0 };
  }
}

/**
 * After a history refresh, old copies of transactions wait (external id "old:…") until the new
 * connection sends the same one; then your labels move onto it and the old copy goes.
 */
async function foldOldCopies(supabase: AppSupabaseClient, accountIds: string[]) {
  if (!accountIds.length) return;
  const { data: olds } = await supabase.from("transactions").select("id, account_id, date, amount_cents, direction, description, category, flexible").in("account_id", accountIds).like("external_id", "old:%");
  if (!olds?.length) return;
  const { data: fresh } = await supabase.from("transactions").select("id, account_id, date, amount_cents, direction").in("account_id", accountIds).not("external_id", "is", null).not("external_id", "like", "old:%");
  const near = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) <= 2 * 86_400_000;
  const earliest = new Map<string, string>();
  for (const t of fresh ?? []) if (!earliest.has(t.account_id) || t.date < earliest.get(t.account_id)!) earliest.set(t.account_id, t.date);
  const used = new Set<string>();
  const drop: string[] = [];
  // Exact day first, then a day or two apart (banks sometimes date the same charge differently).
  for (const pass of [0, 1]) {
    for (const o of olds) {
      if (drop.includes(String(o.id))) continue;
      const twin = (fresh ?? []).find((t) => !used.has(String(t.id)) && t.account_id === o.account_id && Number(t.amount_cents) === Number(o.amount_cents) && t.direction === o.direction && (pass === 0 ? t.date === o.date : near(t.date, o.date)));
      if (!twin) continue;
      used.add(String(twin.id));
      await supabase.from("transactions").update({ description: o.description, category: o.category, flexible: o.flexible }).eq("id", twin.id);
      drop.push(String(o.id));
    }
  }
  // Anything left that's well inside what the new connection already covers is a duplicate too.
  for (const o of olds) {
    const from = earliest.get(o.account_id);
    if (!drop.includes(String(o.id)) && from && Date.parse(o.date) >= Date.parse(from) + 3 * 86_400_000) drop.push(String(o.id));
  }
  for (let i = 0; i < drop.length; i += 200) await supabase.from("transactions").delete().in("id", drop.slice(i, i + 200));
}

/**
 * Refresh history: a brand-new Plaid connection to the same bank (Plaid only sets how far back it
 * reaches when a connection is made), moved onto your existing accounts so nothing else changes.
 * Accounts are matched by their last four digits and type; your categories and names carry over to
 * the re-imported transactions; then the old connection is closed.
 */
export async function refreshBankHistory(supabase: AppSupabaseClient, userId: string, connectionId: string, publicToken: string, today: string): Promise<SyncResult> {
  const { accessToken, itemId } = await api().exchangePublicToken(publicToken);
  return adoptConnection(supabase, userId, connectionId, accessToken, itemId, today);
}

/** Which of your connections (if any) has the same accounts as this new one: same type and last four digits. */
async function sameAccountsAs(userId: string, newToken: string, newItemId: string): Promise<string | null> {
  const db = admin();
  const { data: secrets } = await db.from("bank_secrets").select("connection_id, item_id, access_token_enc").eq("user_id", userId);
  if (!secrets?.length) return null;
  const bank = api();
  const sig = (a: { mask?: string | null; subtype?: string | null; type?: string | null }) => `${a.type ?? ""}|${a.subtype ?? ""}|${a.mask ?? ""}`;
  const fresh = new Set((await bank.getAccounts(newToken)).accounts.filter((a) => a.mask).map(sig));
  for (const sec of secrets) {
    if (sec.item_id === newItemId) continue;
    try {
      const theirs = (await bank.getAccounts(decryptToken(String(sec.access_token_enc), key()))).accounts;
      if (theirs.some((a) => a.mask && fresh.has(sig(a)))) return String(sec.connection_id);
    } catch {
      // A connection that needs signing in again can't be compared; skip it.
    }
  }
  return null;
}

async function adoptConnection(supabase: AppSupabaseClient, userId: string, connectionId: string, newToken: string, itemId: string, today: string): Promise<SyncResult> {
  const db = admin();
  const bank = api();
  const { data: secret } = await db.from("bank_secrets").select("access_token_enc").eq("connection_id", connectionId).eq("user_id", userId).maybeSingle();
  if (!secret) {
    await bank.removeItem(newToken).catch(() => {});
    return { ok: false, message: "That bank connection no longer exists.", accounts: 0, added: 0 };
  }
  const oldToken = decryptToken(String(secret.access_token_enc), key());
  const giveUp = async (message: string): Promise<SyncResult> => {
    await bank.removeItem(newToken).catch(() => {});
    return { ok: false, message, accounts: 0, added: 0 };
  };
  try {
    const [oldAccts, newAccts] = await Promise.all([bank.getAccounts(oldToken), bank.getAccounts(newToken)]);
    const sig = (a: { mask?: string | null; subtype?: string | null; type?: string | null }) => `${a.type ?? ""}|${a.subtype ?? ""}|${a.mask ?? ""}`;
    const newBySig = new Map(newAccts.accounts.map((a) => [sig(a), a.account_id]));
    const { data: ours } = await supabase.from("accounts").select("id, external_id").eq("bank_connection_id", connectionId);
    const moves: Array<{ id: string; from: string; to: string }> = [];
    for (const o of oldAccts.accounts) {
      const mine = (ours ?? []).find((a) => a.external_id === o.account_id);
      const to = newBySig.get(sig(o));
      if (mine && to) moves.push({ id: String(mine.id), from: o.account_id, to });
    }
    if (moves.length === 0) return giveUp("That looks like a different bank or login: none of its accounts matched these ones. Nothing was changed.");

    // What you'd set on the old copies (category, name, day-to-day), to carry over.
    const ids = moves.map((m) => m.id);

    // Point the accounts at the new connection's ids and swap the token; start the transaction feed from scratch.
    for (const m of moves) await supabase.from("accounts").update({ external_id: m.to }).eq("id", m.id);
    await db.from("bank_secrets").update({ access_token_enc: encryptToken(newToken, key()), item_id: itemId, sync_cursor: null }).eq("connection_id", connectionId).eq("user_id", userId);
    const r = await syncBank(supabase, userId, connectionId, today);
    if (!r.ok) return r;

    // Old copies: everything on these accounts the new connection didn't send. Pending ones are simply
    // replaced; the rest are set aside and folded into their re-imported twins (now, or on a later sync).
    const { data: onAccts } = await supabase.from("transactions").select("id, external_id, pending").in("account_id", ids).not("external_id", "is", null).not("external_id", "like", "old:%");
    const old = (onAccts ?? []).filter((t) => r.seen && !r.seen.has(String(t.external_id)));
    const pendingOld = old.filter((t) => t.pending);
    if (pendingOld.length) await supabase.from("transactions").delete().in("id", pendingOld.map((t) => t.id));
    const keep = old.filter((t) => !t.pending);
    for (let i = 0; i < keep.length; i += 25) {
      const res = await Promise.all(keep.slice(i, i + 25).map((t) => supabase.from("transactions").update({ external_id: `old:${t.id}` }).eq("id", t.id)));
      if (res.some((x) => x.error)) throw new Error("Couldn't tidy up the old copies. Nothing was lost: try Refresh history again.");
    }
    await foldOldCopies(supabase, ids);
    await bank.removeItem(oldToken).catch(() => {});
    const { count } = await supabase.from("transactions").select("id", { count: "exact", head: true }).in("account_id", ids);
    return { ok: true, message: `History refreshed: ${count ?? "all"} transactions, as far back as your bank allows (up to 2 years). Your categories carried over.`, accounts: moves.length, added: r.added };
  } catch (e) {
    return giveUp(bankErrorMessage(e).message);
  }
}

/**
 * Disconnect: tell Plaid to forget it, then delete our copy of the token. By default its accounts and
 * history stay, as manual accounts; with `removeAccounts` they're deleted too (e.g. test banks).
 */
export async function disconnectBank(supabase: AppSupabaseClient, userId: string, connectionId: string, removeAccounts = false) {
  const db = admin();
  const { data: secret } = await db.from("bank_secrets").select("access_token_enc").eq("connection_id", connectionId).eq("user_id", userId).maybeSingle();
  if (secret) {
    try {
      await api().removeItem(decryptToken(String(secret.access_token_enc), key()));
    } catch {
      // Still forget it on our side; a token we no longer hold can't be used.
    }
  }
  if (removeAccounts) await supabase.from("accounts").delete().eq("bank_connection_id", connectionId);
  else await supabase.from("accounts").update({ balance_source: "manual" }).eq("bank_connection_id", connectionId);
  await db.from("bank_connections").delete().eq("id", connectionId).eq("user_id", userId);
}

/** Before wiping a user's data or account: disconnect every bank at Plaid too. */
export async function disconnectAllBanks(supabase: AppSupabaseClient, userId: string) {
  if (plaidMode() === "off") return;
  const db = admin();
  const { data } = await db.from("bank_connections").select("id").eq("user_id", userId);
  for (const c of data ?? []) await disconnectBank(supabase, userId, String(c.id));
}
