import "server-only";
import { createClient as createSupabase } from "@supabase/supabase-js";
import { DB_SCHEMA, SUPABASE_URL } from "../supabase/config";
import type { AppSupabaseClient } from "../supabase/server";
import { bankApi } from "./client";
import { plaidEnv, plaidMode } from "./config";
import { decryptToken, encryptToken, tokenKey } from "./crypto";
import { accountBalanceCents, accountKind, accountName, cardFields, statementRow, transactionRow } from "./map";
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
  accounts: number;
  added: number;
}

/** Balances, card statements and new transactions for one connection. Safe to run any time. */
export async function syncBank(supabase: AppSupabaseClient, userId: string, connectionId: string, today: string): Promise<SyncResult> {
  const db = admin();
  const { data: secret } = await db.from("bank_secrets").select("access_token_enc, sync_cursor").eq("connection_id", connectionId).eq("user_id", userId).maybeSingle();
  if (!secret) return { ok: false, message: "That bank connection no longer exists.", accounts: 0, added: 0 };
  try {
    const token = decryptToken(String(secret.access_token_enc), key());
    const bank = api();
    const { accounts: bankAccounts, institutionName } = await bank.getAccounts(token);
    const liabilities = bankAccounts.some((a) => a.type === "credit") ? await bank.getLiabilities(token) : [];
    const now = new Date().toISOString();

    // Accounts: update the ones we know, add the new ones. Names you've changed are kept.
    const { data: known } = await supabase.from("accounts").select("id, external_id, kind, payment_account_id").not("external_id", "is", null);
    const byExternal = new Map((known ?? []).map((a) => [String(a.external_id), a]));
    const idFor = new Map<string, { id: string; kind: ReturnType<typeof accountKind> }>();
    for (const a of bankAccounts) {
      const kind = accountKind(a);
      if (!kind) continue;
      const liability = liabilities.find((l) => l.account_id === a.account_id);
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

    // Card statements.
    for (const l of liabilities) {
      const target = l.account_id ? idFor.get(l.account_id) : undefined;
      const row = target ? statementRow(l, target.id) : null;
      if (row) await supabase.from("card_statements").upsert({ ...row, user_id: userId }, { onConflict: "account_id,closing_date" });
    }

    // Transactions, page by page from the last cursor.
    let cursor = (secret.sync_cursor as string | null) ?? null;
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
      cursor = r.next_cursor;
      if (!r.has_more) break;
    }

    await db.from("bank_secrets").update({ sync_cursor: cursor }).eq("connection_id", connectionId).eq("user_id", userId);
    await db
      .from("bank_connections")
      .update({ status: "ok", last_synced_at: now, last_error: null, ...(institutionName ? { institution_name: institutionName } : {}) })
      .eq("id", connectionId)
      .eq("user_id", userId);
    return { ok: true, message: `Synced ${idFor.size} account${idFor.size === 1 ? "" : "s"}${added ? ` and ${added} transaction${added === 1 ? "" : "s"}` : ""}.`, accounts: idFor.size, added };
  } catch (e) {
    const { status, message } = bankErrorMessage(e);
    await db.from("bank_connections").update({ status, last_error: message }).eq("id", connectionId).eq("user_id", userId);
    return { ok: false, message, accounts: 0, added: 0 };
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
