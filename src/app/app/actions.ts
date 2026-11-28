"use server";

import { sameThing } from "@/lib/view/history";
import { cleanName } from "@/lib/view/recurring";
import { findRecurring } from "@/lib/view/recurring";
import { getAppSession } from "@/lib/data/session";
import { centsToInput } from "@/lib/money";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { parseDollars } from "@/lib/money";
import { disconnectAllBanks } from "@/lib/plaid/sync";
import { normalizeTitle } from "@/lib/calendar/estimate";
import { syncSource } from "@/lib/calendar/sync";
import { todayInZone } from "@/lib/dates";
import { parseImport, MAX_IMPORT_BYTES } from "@/lib/data/import-export";
import {
  accountSchema,
  balanceUpdateSchema,
  calendarSourceSchema,
  eventCorrectionSchema,
  goalSchema,
  manualEventSchema,
  overrideSchema,
  parseForm,
  profileSchema,
  ruleSchema,
  settingsSchema,
  statementSchema,
  transactionSchema,
  transferSchema,
  type FieldErrors,
} from "@/lib/data/schemas";
import { getUser } from "@/lib/supabase/server";
import { APP_NAME } from "@/lib/brand";

export type ActionState = {
  ok: boolean;
  message?: string;
  error?: string;
  fieldErrors?: FieldErrors;
  /** Changes on every submit so forms can react (reset, toast). */
  at?: number;
} | null;

type Supa = Awaited<ReturnType<typeof getUser>>["supabase"];

async function session() {
  const { supabase, user } = await getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

async function userToday(supabase: Supa): Promise<{ today: string; timezone: string }> {
  const { data } = await supabase.from("profiles").select("timezone").maybeSingle();
  const timezone = (data?.timezone as string) || "America/New_York";
  return { today: todayInZone(timezone), timezone };
}

function ok(message: string): ActionState {
  revalidatePath("/app", "layout");
  return { ok: true, message, at: Date.now() };
}

function fail(error: string, fieldErrors?: FieldErrors): ActionState {
  return { ok: false, error, fieldErrors, at: Date.now() };
}

const invalid = (fieldErrors: FieldErrors) => fail("Please fix the highlighted fields.", fieldErrors);

/** Turn database constraint errors into something a person can act on. */
function dbError(e: { message?: string; code?: string } | null, fallback = "Something went wrong saving that. Please try again."): ActionState {
  if (!e) return fail(fallback);
  if (e.code === "23505") return fail("That already exists.");
  if (e.code === "23503") return fail("That refers to an account or item that no longer exists.");
  if (e.code === "23514") return fail("Some values aren't allowed together. Check the form and try again.");
  return fail(fallback);
}

async function logDecision(supabase: Supa, subjectType: string, subjectId: string | null, decision: string, detail: Record<string, unknown> = {}) {
  await supabase.from("decisions").insert({ subject_type: subjectType, subject_id: subjectId, decision, detail });
}

const idFrom = (form: FormData) => {
  const id = String(form.get("id") ?? "");
  return /^[0-9a-f-]{36}$/i.test(id) ? id : null;
};

/* ------------------------------------------------------------------ accounts */

export async function saveAccount(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await session();
  const parsed = parseForm(accountSchema, form);
  if (!parsed.ok) return invalid(parsed.fieldErrors);
  const { id, row } = parsed.data;
  const payload = { ...row, ...(row.balance_cents != null ? { balance_updated_at: new Date().toISOString(), balance_source: "manual" } : {}) };
  const { error } = id
    ? await supabase.from("accounts").update(payload).eq("id", id)
    : await supabase.from("accounts").insert(payload);
  if (error) return dbError(error);
  return ok(id ? "Account updated." : "Account added.");
}

export async function updateBalance(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await session();
  const parsed = parseForm(balanceUpdateSchema, form);
  if (!parsed.ok) return invalid(parsed.fieldErrors);
  const { error } = await supabase
    .from("accounts")
    .update({
      balance_cents: parsed.data.balance,
      balance_as_of: parsed.data.balanceAsOf,
      balance_source: "manual",
      balance_updated_at: new Date().toISOString(),
    })
    .eq("id", parsed.data.accountId);
  if (error) return dbError(error);
  return ok("Balance updated. The forecast now starts from it.");
}

export async function archiveAccount(form: FormData) {
  const { supabase } = await session();
  const id = idFrom(form);
  if (!id) return;
  await supabase.from("accounts").update({ archived: form.get("archived") === "true" }).eq("id", id);
  revalidatePath("/app", "layout");
}

/**
 * Replace a hand-entered account with one your bank keeps up to date: everything that points at the
 * old account (paydays, bills, card payments, goals, planned items, plans) moves to the bank account,
 * then the old one is archived so it no longer counts. Its past history stays with it.
 */
export async function replaceWithBankAccount(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await session();
  const from = String(form.get("from") ?? "");
  const to = String(form.get("to") ?? "");
  const uuidRe = /^[0-9a-f-]{36}$/i;
  if (!uuidRe.test(from) || !uuidRe.test(to) || from === to) return invalid({ to: "Choose the bank account to use instead." });
  const { data: pair } = await supabase.from("accounts").select("id, kind, bank_connection_id").in("id", [from, to]);
  const a = pair?.find((x) => x.id === from);
  const b = pair?.find((x) => x.id === to);
  if (!a || !b) return fail("Couldn't find those accounts.");
  if (!b.bank_connection_id) return invalid({ to: "Choose an account from a connected bank." });
  const family = (k: string) => (k === "credit_card" ? "card" : k === "loan" ? "loan" : "cash");
  if (family(String(a.kind)) !== family(String(b.kind))) return invalid({ to: "Choose an account of the same type (cash for cash, card for card)." });

  const steps = [
    supabase.from("recurring_rules").update({ account_id: to }).eq("account_id", from),
    supabase.from("recurring_rules").update({ to_account_id: to }).eq("to_account_id", from),
    supabase.from("accounts").update({ payment_account_id: to }).eq("payment_account_id", from),
    supabase.from("savings_goals").update({ account_id: to }).eq("account_id", from),
    supabase.from("calendar_events").update({ payment_account_id: to }).eq("payment_account_id", from),
    supabase.from("transactions").update({ account_id: to }).eq("account_id", from).eq("status", "planned"),
    supabase.from("transfers").update({ from_account_id: to }).eq("from_account_id", from).eq("status", "planned"),
    supabase.from("transfers").update({ to_account_id: to }).eq("to_account_id", from).eq("status", "planned"),
  ];
  for (const step of steps) {
    const { error } = await step;
    if (error) return dbError(error, "Couldn't move everything over, so nothing was archived. Try again, or move items by hand.");
  }
  const { error } = await supabase.from("accounts").update({ archived: true }).eq("id", from);
  if (error) return dbError(error);
  revalidatePath("/app", "layout");
  return ok("Done. Everything now uses the bank account, and the old one is archived (you can unarchive it any time).");
}

/** How a card is paid (the one thing a bank can't tell us): the statement in full, or the minimum. */
export async function setCardPayInFull(form: FormData) {
  const { supabase } = await session();
  const id = idFrom(form);
  if (!id) return;
  await supabase.from("accounts").update({ pay_in_full: form.get("payInFull") !== "false" }).eq("id", id).eq("kind", "credit_card");
  revalidatePath("/app", "layout");
}

export async function deleteAccount(form: FormData) {
  const { supabase } = await session();
  const id = idFrom(form);
  if (!id) return;
  await supabase.from("accounts").delete().eq("id", id);
  revalidatePath("/app", "layout");
}

/* --------------------------------------------------------------------- rules */

export async function saveRule(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await session();
  const parsed = parseForm(ruleSchema, form);
  if (!parsed.ok) return invalid(parsed.fieldErrors);
  const { id, row } = parsed.data;
  // Card payments must go to a card; loan payments to a loan.
  if (row.to_account_id && (row.kind === "card_payment" || row.kind === "loan_payment")) {
    const { data } = await supabase.from("accounts").select("kind").eq("id", row.to_account_id).maybeSingle();
    const want = row.kind === "card_payment" ? "credit_card" : "loan";
    if (data?.kind !== want) return invalid({ toAccountId: row.kind === "card_payment" ? "Choose a credit card." : "Choose a loan." });
  }
  const { error } = id ? await supabase.from("recurring_rules").update(row).eq("id", id) : await supabase.from("recurring_rules").insert(row);
  if (error) return dbError(error);
  return ok(id ? "Recurring item updated." : "Recurring item added.");
}

export async function toggleRule(form: FormData) {
  const { supabase } = await session();
  const id = idFrom(form);
  if (!id) return;
  await supabase.from("recurring_rules").update({ active: form.get("active") === "true" }).eq("id", id);
  revalidatePath("/app", "layout");
}

export async function deleteRule(form: FormData) {
  const { supabase } = await session();
  const id = idFrom(form);
  if (!id) return;
  await supabase.from("recurring_rules").delete().eq("id", id);
  revalidatePath("/app", "layout");
}

export async function setOverride(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await session();
  const parsed = parseForm(overrideSchema, form);
  if (!parsed.ok) return invalid(parsed.fieldErrors);
  const v = parsed.data;
  if (v.action === "reset") {
    const { error } = await supabase.from("occurrence_overrides").delete().eq("rule_id", v.ruleId).eq("original_date", v.originalDate);
    if (error) return dbError(error);
    return ok("Back to the normal schedule.");
  }
  const { error } = await supabase.from("occurrence_overrides").upsert(
    {
      rule_id: v.ruleId,
      original_date: v.originalDate,
      action: v.action,
      new_date: v.action === "modify" ? (v.newDate ?? null) : null,
      amount_cents: v.action === "modify" ? (v.amount ?? null) : null,
      note: v.note ?? null,
    },
    { onConflict: "rule_id,original_date" },
  );
  if (error) return dbError(error);
  await logDecision(supabase, "occurrence", `${v.ruleId}:${v.originalDate}`, v.action, { newDate: v.newDate, amountCents: v.amount });
  return ok(v.action === "posted" ? "Marked as already in your balance." : v.action === "skip" ? "Skipped this time." : "Changed for this date only.");
}

/* -------------------------------------------------------------- transactions */

export async function saveTransaction(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await session();
  // From the bank: its amount, date, account and status are facts; only your labels change. The bank
  // edit form only sends those labels, so it's checked on its own (not against the full schema).
  const rawId = String(form.get("id") ?? "");
  if (rawId) {
    const { data: existing } = await supabase.from("transactions").select("external_id").eq("id", rawId).maybeSingle();
    if (existing?.external_id) {
      const description = String(form.get("description") ?? "").trim().slice(0, 120);
      if (!description) return invalid({ description: "Give it a name." });
      const category = String(form.get("category") ?? "").trim().slice(0, 40) || null;
      const { error } = await supabase.from("transactions").update({ description, category, flexible: form.get("flexible") === "on" }).eq("id", rawId);
      if (error) return dbError(error);
      return ok("Saved.");
    }
  }
  const parsed = parseForm(transactionSchema, form);
  if (!parsed.ok) return invalid(parsed.fieldErrors);
  const { id, row } = parsed.data;
  // Status follows the date: anything after today is planned, anything up to today happened.
  const { today } = await userToday(supabase);
  const finalRow = { ...row, status: row.date > today ? ("planned" as const) : ("posted" as const) };
  const { error } = id ? await supabase.from("transactions").update(finalRow).eq("id", id) : await supabase.from("transactions").insert(finalRow);
  if (error) return dbError(error);
  return ok(id ? "Transaction updated." : finalRow.status === "posted" && finalRow.direction === "out" ? "Spending logged. Caps recalculated." : "Planned. It's in your forecast.");
}

/** A category of your own, with its symbol and color. */
export async function createCategory(name: string, icon: string, color: string): Promise<{ ok: boolean; error?: string }> {
  const { supabase } = await session();
  const clean = name.trim().replace(/\s+/g, " ").slice(0, 40);
  if (!clean) return { ok: false, error: "Give it a name." };
  if (!/^[a-z]{2,24}$/.test(icon) || !/^#[0-9a-fA-F]{6}$/.test(color)) return { ok: false, error: "Pick a symbol and a color." };
  const { data: existing } = await supabase.from("category_settings").select("id").eq("name", clean).maybeSingle();
  const { error } = existing
    ? await supabase.from("category_settings").update({ icon, color }).eq("id", existing.id)
    : await supabase.from("category_settings").insert({ name: clean, grp: "wants", icon, color });
  if (error) {
    if (/icon|color/.test(error.message ?? "")) return { ok: false, error: "New categories need one more database update: run supabase/migrations/20261130000000_category_style.sql in Supabase's SQL editor." };
    return { ok: false, error: "Couldn't save that. Try again." };
  }
  revalidatePath("/app", "layout");
  return { ok: true };
}

/** One tap in a transaction's pop-up: just its category (bank or hand-entered). */
export async function setTransactionCategory(id: string, category: string, scope: "one" | "all" = "one"): Promise<{ ok: boolean; error?: string; count?: number }> {
  const { supabase } = await session();
  const clean = category.trim().slice(0, 40) || null;
  if (!id) return { ok: false, error: "Couldn't find that transaction." };
  if (scope === "one") {
    const { error } = await supabase.from("transactions").update({ category: clean }).eq("id", id);
    if (error) return { ok: false, error: "Couldn't save that. Try again." };
    revalidatePath("/app", "layout");
    return { ok: true, count: 1 };
  }
  // Every transaction with this name (same direction), and new ones from your bank from now on.
  const { data: txn } = await supabase.from("transactions").select("description, direction").eq("id", id).maybeSingle();
  if (!txn) return { ok: false, error: "Couldn't find that transaction." };
  const { data: all } = await supabase.from("transactions").select("id, description").eq("direction", txn.direction).limit(20000);
  const ids = (all ?? []).filter((t) => sameThing(String(t.description), String(txn.description))).map((t) => String(t.id));
  if (!ids.includes(id)) ids.push(id);
  for (let i = 0; i < ids.length; i += 200) {
    const { error } = await supabase.from("transactions").update({ category: clean }).in("id", ids.slice(i, i + 200));
    if (error) return { ok: false, error: "Couldn't save that. Try again." };
  }
  const key = cleanName(String(txn.description)) || String(txn.description).trim().toLowerCase();
  if (key && clean) {
    await supabase.from("corrections").upsert({ kind: "preference", match_key: `category_for:${txn.direction}:${key}`.slice(0, 200), value: { category: clean } }, { onConflict: "user_id,kind,match_key" });
  }
  revalidatePath("/app", "layout");
  return { ok: true, count: ids.length };
}

/** "How did it go?": confirm a plan's matched charge, say it wasn't that one, or that nothing was spent. */
export async function checkPlan(eventId: string, ok: boolean, txnId: string | null): Promise<{ ok: boolean }> {
  const { supabase } = await session();
  if (!/^[0-9a-f-]{36}$/i.test(eventId) || (txnId && !/^[0-9a-f-]{36}$/i.test(txnId))) return { ok: false };
  const { error } = await supabase.from("corrections").upsert({ kind: "preference", match_key: `plan_check:${eventId}`, value: { ok, txnId } }, { onConflict: "user_id,kind,match_key" });
  if (error) return { ok: false };
  revalidatePath("/app", "layout");
  return { ok: true };
}

/** Add the repeating items you ticked in "We found what repeats" (and remember the review is done). */
export async function addFoundRepeats(keys: string[]): Promise<{ ok: boolean; added: number }> {
  const { supabase } = await session();
  const { snapshot, today } = await getAppSession();
  const dismissed = new Set(snapshot.corrections.filter((c) => c.kind === "preference" && c.matchKey.startsWith("recurring_dismissed:")).map((c) => c.matchKey.slice(20)));
  const found = findRecurring(snapshot.transactions, snapshot.rules, today, dismissed).filter((x) => keys.includes(x.key));
  let added = 0;
  for (const x of found) {
    const f = new FormData();
    f.set("kind", x.kind);
    f.set("name", x.name);
    f.set("amount", centsToInput(x.amountCents));
    f.set("accountId", x.accountId);
    f.set("category", x.category ?? "");
    f.set("frequency", x.frequency);
    f.set("startDate", x.nextDate);
    if (x.dayOfMonth != null) f.set("dayOfMonth", String(x.dayOfMonth));
    if (x.secondDayOfMonth != null) f.set("secondDayOfMonth", String(x.secondDayOfMonth));
    f.set("weekendAdjust", x.kind === "income" ? "before" : "none");
    if (x.varies) f.set("isEstimate", "on");
    const r = await saveRule(null, f);
    if (r?.ok) added++;
  }
  await supabase.from("corrections").upsert({ kind: "preference", match_key: "setup:repeats_reviewed", value: { at: today } }, { onConflict: "user_id,kind,match_key" });
  revalidatePath("/app", "layout");
  return { ok: true, added };
}

/** How everyday purchases are paid ("auto", "debit" or a card's id): when they leave your cash. */
export async function saveEverydayPay(value: string): Promise<{ ok: boolean }> {
  const { supabase } = await session();
  if (value !== "auto" && value !== "debit" && !/^[0-9a-f-]{36}$/i.test(value)) return { ok: false };
  const { error } = await supabase.from("corrections").upsert({ kind: "preference", match_key: "pay_everyday_with", value: { with: value } }, { onConflict: "user_id,kind,match_key" });
  revalidatePath("/app", "layout");
  return { ok: !error };
}

/** "Not repeating": stop suggesting this one (remembered, so it doesn't come back). */
export async function dismissRecurring(form: FormData) {
  const { supabase } = await session();
  const key = String(form.get("key") ?? "").slice(0, 160);
  if (!key) return;
  await supabase.from("corrections").upsert({ kind: "preference", match_key: `recurring_dismissed:${key}`, value: { dismissed: true } }, { onConflict: "user_id,kind,match_key" });
  revalidatePath("/app", "layout");
}

/**
 * Rename a category, or delete it by moving everything in it to another one. Every transaction,
 * repeating item and plan moves; your budget, symbol and "not counted" setting carry over; new
 * transactions from your bank that would land in the old one land in the new one; and the old
 * name (even a built-in one) isn't offered anymore.
 */
export async function moveCategory(fromName: string, toName: string): Promise<{ ok: boolean; error?: string; moved?: number }> {
  const { supabase } = await session();
  const from = fromName.trim().slice(0, 40);
  const to = toName.trim().slice(0, 40);
  if (!from || !to) return { ok: false, error: "Give it a name." };
  if (from === to) return { ok: true, moved: 0 };
  if (["Transfer", "Card payment"].includes(from)) return { ok: false, error: `${from} is built in: it keeps transfers and card payments out of your spending.` };
  const { data: moved, error } = await supabase.from("transactions").update({ category: to }).eq("category", from).select("id");
  if (error) return { ok: false, error: "Couldn't save that. Try again." };
  await supabase.from("recurring_rules").update({ category: to }).eq("category", from);
  await supabase.from("calendar_events").update({ category: to }).eq("category", from);
  // Budget, group, symbol: keep the new one's if it has its own, otherwise take the old one's.
  const { data: rows } = await supabase.from("category_settings").select("id, name").in("name", [from, to]);
  const oldRow = rows?.find((r) => r.name === from);
  if (oldRow) {
    if (rows?.some((r) => r.name === to)) await supabase.from("category_settings").delete().eq("id", oldRow.id);
    else await supabase.from("category_settings").update({ name: to }).eq("id", oldRow.id);
  }
  // Names you sent to the old category now go to the new one; "not counted" follows it.
  const { data: forName } = await supabase.from("corrections").select("id, match_key, value").eq("kind", "preference").like("match_key", "category_for:%");
  const { data: excl } = await supabase.from("corrections").select("id, match_key, value").eq("kind", "preference").eq("match_key", `exclude_category:${from}`);
  for (const p of [...(forName ?? []), ...(excl ?? [])]) {
    if (String(p.match_key) === `exclude_category:${from}`) {
      await supabase.from("corrections").upsert({ kind: "preference", match_key: `exclude_category:${to}`, value: p.value }, { onConflict: "user_id,kind,match_key" });
      await supabase.from("corrections").delete().eq("id", p.id);
    } else if ((p.value as { category?: string })?.category === from) {
      await supabase.from("corrections").update({ value: { category: to } }).eq("id", p.id);
    }
  }
  // The bank's own category names land in the new one from now on.
  await supabase.from("corrections").upsert({ kind: "category_rename", match_key: from, value: { to } }, { onConflict: "user_id,kind,match_key" });
  await supabase.from("corrections").update({ value: { to } }).eq("kind", "category_rename").eq("value->>to", from);
  await supabase.from("corrections").upsert({ kind: "preference", match_key: `hide_category:${from}`, value: { hidden: true } }, { onConflict: "user_id,kind,match_key" });
  await supabase.from("corrections").delete().eq("kind", "preference").eq("match_key", `hide_category:${to}`);
  revalidatePath("/app", "layout");
  return { ok: true, moved: moved?.length ?? 0 };
}

/** Offer a hidden category again (it starts empty). */
export async function showCategory(form: FormData) {
  const { supabase } = await session();
  const name = String(form.get("name") ?? "").trim().slice(0, 40);
  if (!name) return;
  await supabase.from("corrections").delete().eq("kind", "preference").eq("match_key", `hide_category:${name}`);
  await supabase.from("corrections").delete().eq("kind", "category_rename").eq("match_key", name);
  revalidatePath("/app", "layout");
}

/** Cover a shortfall: a planned move from a savings account into your main cash account by that day. */
export async function coverShortfall(fromAccountId: string, cents: number, date: string): Promise<{ ok: boolean; error?: string }> {
  const { supabase } = await session();
  if (!/^[0-9a-f-]{36}$/i.test(fromAccountId) || !Number.isInteger(cents) || cents <= 0 || cents > 100_000_000 || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, error: "Couldn't plan that." };
  const { data: accts } = await supabase.from("accounts").select("id, kind, is_spendable, archived");
  const from = accts?.find((a) => a.id === fromAccountId);
  const to = accts?.find((a) => a.is_spendable && a.kind === "checking" && !a.archived) ?? accts?.find((a) => a.is_spendable && !a.archived && a.kind !== "savings");
  if (!from || from.kind !== "savings" || !to) return { ok: false, error: "Couldn't find the accounts for that." };
  const { today } = await userToday(supabase);
  const { error } = await supabase.from("transfers").insert({ from_account_id: from.id, to_account_id: to.id, date: date >= today ? date : today, amount_cents: cents, status: "planned", note: "Cover the shortfall" });
  if (error) return { ok: false, error: "Couldn't plan that. Try again." };
  revalidatePath("/app", "layout");
  return { ok: true };
}

/** Count a category again (undo "not counted"). */
export async function includeCategory(form: FormData) {
  const { supabase } = await session();
  const name = String(form.get("name") ?? "").trim().slice(0, 40);
  if (!name) return;
  await supabase.from("corrections").delete().eq("kind", "preference").eq("match_key", `exclude_category:${name}`);
  revalidatePath("/app", "layout");
}

/** A category's group (needs / wants / savings) and, optionally, your own monthly budget (blank = smart). */
export async function saveCategorySetting(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await session();
  const name = String(form.get("name") ?? "").trim().slice(0, 40);
  const grp = String(form.get("group") ?? "");
  if (!name) return invalid({ name: "Choose a category." });
  if (!["needs", "wants", "savings", "excluded"].includes(grp)) return invalid({ group: "Choose needs, wants or savings." });
  // Not counted: kept as a preference (the category keeps its group if you count it again later).
  const exKey = `exclude_category:${name}`;
  if (grp === "excluded") {
    const { error } = await supabase.from("corrections").upsert({ kind: "preference", match_key: exKey, value: { on: true } }, { onConflict: "user_id,kind,match_key" });
    if (error) return dbError(error);
    revalidatePath("/app", "layout");
    return ok(`${name} isn't counted anymore: not in spending, budgets or income.`);
  }
  await supabase.from("corrections").delete().eq("kind", "preference").eq("match_key", exKey);
  const raw = String(form.get("budget") ?? "").trim();
  let budget: number | null = null;
  if (raw) {
    const cents = parseDollars(raw);
    if (cents == null || cents < 0) return invalid({ budget: "Enter an amount like 250, or leave it blank for a smart budget." });
    budget = cents;
  }
  // Update your row for this category if there is one, otherwise add it (the same way new
  // categories are saved), so it doesn't depend on the database's conflict handling.
  const found = await supabase.from("category_settings").select("id").eq("name", name).maybeSingle();
  const { error } = found.error
    ? found
    : found.data
      ? await supabase.from("category_settings").update({ grp, monthly_budget_cents: budget }).eq("id", found.data.id)
      : await supabase.from("category_settings").insert({ name, grp, monthly_budget_cents: budget });
  if (error) {
    // Only a missing table means the database update hasn't been run; anything else, say what it was.
    if (error.code === "42P01" || error.code === "PGRST205" || /does not exist|could not find the table/i.test(error.message ?? ""))
      return fail("Budgets need one more database update: run supabase/migrations/20261128000000_categories.sql in Supabase's SQL editor.");
    console.error("saveCategorySetting", error);
    return fail(`Couldn't save the budget (${error.code ?? "error"}: ${(error.message ?? "").slice(0, 120)}).`);
  }
  revalidatePath("/app", "layout");
  return ok(budget == null ? "Saved. Using a smart budget." : "Saved.");
}

export async function deleteTransaction(form: FormData) {
  const { supabase } = await session();
  const id = idFrom(form);
  if (!id) return;
  await supabase.from("transactions").delete().eq("id", id);
  revalidatePath("/app", "layout");
}

export async function saveTransfer(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await session();
  const parsed = parseForm(transferSchema, form);
  if (!parsed.ok) return invalid(parsed.fieldErrors);
  const { id, row } = parsed.data;
  const { error } = id ? await supabase.from("transfers").update(row).eq("id", id) : await supabase.from("transfers").insert(row);
  if (error) return dbError(error);
  return ok(id ? "Transfer updated." : "Transfer added.");
}

export async function deleteTransfer(form: FormData) {
  const { supabase } = await session();
  const id = idFrom(form);
  if (!id) return;
  await supabase.from("transfers").delete().eq("id", id);
  revalidatePath("/app", "layout");
}

/* ---------------------------------------------------------------- statements */

export async function saveStatement(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await session();
  const parsed = parseForm(statementSchema, form);
  if (!parsed.ok) return invalid(parsed.fieldErrors);
  const { id, row } = parsed.data;
  const { error } = id
    ? await supabase.from("card_statements").update(row).eq("id", id)
    : await supabase.from("card_statements").upsert(row, { onConflict: "account_id,closing_date" });
  if (error) return dbError(error);
  return ok("Statement saved.");
}

export async function markStatementPaid(form: FormData) {
  const { supabase } = await session();
  const id = idFrom(form);
  if (!id) return;
  const { data } = await supabase.from("card_statements").select("statement_balance_cents").eq("id", id).maybeSingle();
  if (!data) return;
  await supabase.from("card_statements").update({ paid_cents: data.statement_balance_cents, status: "paid" }).eq("id", id);
  await logDecision(supabase, "statement", id, "paid_in_full");
  revalidatePath("/app", "layout");
}

export async function deleteStatement(form: FormData) {
  const { supabase } = await session();
  const id = idFrom(form);
  if (!id) return;
  await supabase.from("card_statements").delete().eq("id", id);
  revalidatePath("/app", "layout");
}

/* --------------------------------------------------------------------- goals */

export async function saveGoal(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await session();
  const parsed = parseForm(goalSchema, form);
  if (!parsed.ok) return invalid(parsed.fieldErrors);
  const { id, row } = parsed.data;
  const { error } = id ? await supabase.from("savings_goals").update(row).eq("id", id) : await supabase.from("savings_goals").insert(row);
  if (error) return dbError(error);
  return ok(id ? "Goal updated." : "Goal added.");
}

export async function deleteGoal(form: FormData) {
  const { supabase } = await session();
  const id = idFrom(form);
  if (!id) return;
  await supabase.from("savings_goals").delete().eq("id", id);
  revalidatePath("/app", "layout");
}

/* ----------------------------------------------------------------- settings */

export async function saveSettings(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, user } = await session();
  const parsed = parseForm(settingsSchema, form);
  if (!parsed.ok) return invalid(parsed.fieldErrors);
  const { error } = await supabase.from("forecast_settings").upsert({ user_id: user.id, ...parsed.data });
  if (error) return dbError(error);
  return ok("Settings saved.");
}

export async function saveProfile(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, user } = await session();
  const parsed = parseForm(profileSchema, form);
  if (!parsed.ok) return invalid(parsed.fieldErrors);
  const { error } = await supabase
    .from("profiles")
    .upsert({ user_id: user.id, display_name: parsed.data.displayName ?? null, timezone: parsed.data.timezone });
  if (error) return dbError(error);
  return ok("Profile saved.");
}

export async function setHideAmounts(form: FormData) {
  const { supabase, user } = await session();
  await supabase.from("profiles").upsert({ user_id: user.id, hide_amounts: form.get("hide") === "true" });
  revalidatePath("/app", "layout");
}

export async function saveTheme(form: FormData) {
  const { supabase, user } = await getUser();
  const theme = String(form.get("theme") ?? "");
  if (!user || !["system", "light", "dark"].includes(theme)) return;
  await supabase.from("profiles").upsert({ user_id: user.id, theme });
}

export async function completeOnboarding() {
  const { supabase, user } = await session();
  await supabase.from("profiles").upsert({ user_id: user.id, onboarded_at: new Date().toISOString() });
  revalidatePath("/app", "layout");
  redirect("/app");
}

/* ----------------------------------------------------------------- calendars */

export async function addCalendarSource(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await session();
  const parsed = parseForm(calendarSourceSchema, form);
  if (!parsed.ok) return invalid(parsed.fieldErrors);
  const { data, error } = await supabase
    .from("calendar_sources")
    .insert({ name: parsed.data.name, ics_url: parsed.data.url, kind: "ics_url" })
    .select("id, ics_url, event_count")
    .single();
  if (error || !data) return dbError(error);
  const { today, timezone } = await userToday(supabase);
  const outcome = await syncSource(supabase, data, { today, timezone });
  revalidatePath("/app", "layout");
  return outcome.status === "ok"
    ? { ok: true, message: `Calendar connected. ${outcome.message}`, at: Date.now() }
    : { ok: false, error: `Calendar saved, but the first sync failed: ${outcome.message}`, at: Date.now() };
}

export async function syncCalendar(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await session();
  const id = idFrom(form);
  const { today, timezone } = await userToday(supabase);
  const query = supabase.from("calendar_sources").select("id, ics_url, event_count, name").eq("enabled", true).eq("kind", "ics_url");
  const { data: sources, error } = id ? await query.eq("id", id) : await query;
  if (error) return dbError(error);
  if (!sources?.length) return fail("No connected calendars to sync.");
  const results = await Promise.all(sources.map((s) => syncSource(supabase, s, { today, timezone }).then((o) => ({ name: s.name as string, o }))));
  revalidatePath("/app", "layout");
  const failed = results.filter((r) => r.o.status !== "ok");
  if (failed.length) return { ok: false, error: failed.map((f) => `${f.name}: ${f.o.message}`).join(" "), at: Date.now() };
  return { ok: true, message: results.map((r) => `${r.name}: ${r.o.message}`).join(" "), at: Date.now() };
}

export async function uploadIcs(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await session();
  const file = form.get("file");
  const name = String(form.get("name") ?? "").trim() || "Uploaded calendar";
  if (!(file instanceof File) || file.size === 0) return invalid({ file: "Choose an .ics file." });
  if (file.size > 5 * 1024 * 1024) return invalid({ file: "That file is larger than 5 MB." });
  const text = await file.text();
  const { data, error } = await supabase
    .from("calendar_sources")
    .insert({ name: name.slice(0, 60), kind: "ics_upload" })
    .select("id, ics_url, event_count")
    .single();
  if (error || !data) return dbError(error);
  const { today, timezone } = await userToday(supabase);
  const outcome = await syncSource(supabase, data, { today, timezone, icsText: text });
  revalidatePath("/app", "layout");
  if (outcome.status !== "ok") {
    await supabase.from("calendar_sources").delete().eq("id", data.id);
    return fail(`That file couldn't be read: ${outcome.message}`);
  }
  return { ok: true, message: `Imported. ${outcome.message} Uploaded calendars don't update on their own; upload again when your plans change.`, at: Date.now() };
}

export async function toggleCalendarSource(form: FormData) {
  const { supabase } = await session();
  const id = idFrom(form);
  if (!id) return;
  await supabase.from("calendar_sources").update({ enabled: form.get("enabled") === "true" }).eq("id", id);
  revalidatePath("/app", "layout");
}

export async function deleteCalendarSource(form: FormData) {
  const { supabase } = await session();
  const id = idFrom(form);
  if (!id) return;
  await supabase.from("calendar_sources").delete().eq("id", id);
  revalidatePath("/app", "layout");
}

export async function addManualEvent(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await session();
  const parsed = parseForm(manualEventSchema, form);
  if (!parsed.ok) return invalid(parsed.fieldErrors);
  const v = parsed.data;
  const { error } = await supabase.from("calendar_events").insert({
    title: v.title,
    date: v.date,
    estimate_cents: v.estimate ?? null,
    estimate_source: v.estimate != null ? "user" : null,
    estimate_confirmed: v.estimate != null,
    payment_account_id: v.paymentAccountId ?? null,
    category: v.category ?? null,
    user_corrected: true,
  });
  if (error) return dbError(error);
  if (v.estimate != null) await rememberEstimate(supabase, v.title, { estimateCents: v.estimate });
  return ok("Plan added.");
}

async function rememberEstimate(supabase: Supa, title: string, value: Record<string, unknown>) {
  const key = normalizeTitle(title);
  if (!key) return;
  await supabase.from("corrections").upsert({ kind: "event_estimate", match_key: key, value }, { onConflict: "user_id,kind,match_key" });
}

export async function correctEvent(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await session();
  const parsed = parseForm(eventCorrectionSchema, form);
  if (!parsed.ok) return invalid(parsed.fieldErrors);
  const v = parsed.data;
  const { data: current } = await supabase.from("calendar_events").select("title").eq("id", v.eventId).maybeSingle();
  if (!current) return fail("That event no longer exists.");
  const title = v.title ?? (current.title as string);
  const estimate = v.notSpending ? 0 : v.estimate;
  const patch: Record<string, unknown> = {
    title,
    user_corrected: true,
    essential: v.essential,
    decision: v.decision ?? null,
    cap_cents: v.notSpending ? 0 : (v.cap ?? null),
    payment_account_id: v.paymentAccountId ?? null,
  };
  if (v.date) patch.date = v.date;
  if (estimate != null) {
    patch.estimate_cents = estimate;
    patch.estimate_source = "user";
    patch.estimate_confirmed = true;
  }
  const { error } = await supabase.from("calendar_events").update(patch).eq("id", v.eventId);
  if (error) return dbError(error);
  if (v.rememberForSimilar && (estimate != null || v.notSpending)) {
    await rememberEstimate(supabase, title, { estimateCents: estimate ?? null, notSpending: v.notSpending, capCents: v.cap ?? null });
  }
  if (v.decision) await logDecision(supabase, "event", v.eventId, v.decision, { title, capCents: v.cap ?? null, estimateCents: estimate ?? null });
  return ok(v.rememberForSimilar ? "Saved, and remembered for similar events." : "Saved.");
}

/**
 * One tap on a plan: do an option ("Do this") or skip the plan. Doing an option carries it out
 * (planned transfer from savings, other plans skipped, a lower cap, or a new date) and marks the
 * plan as going ahead.
 */
export async function applyPlanOption(form: FormData) {
  const { supabase } = await session();
  const eventId = String(form.get("eventId") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(eventId)) return;
  const { data: ev } = await supabase.from("calendar_events").select("id, title, date, payment_account_id").eq("id", eventId).maybeSingle();
  if (!ev) return;
  const kind = String(form.get("kind") ?? "");

  if (kind === "undo") {
    // Back to the app's suggestion: forget your call and remove savings moves planned for it.
    await supabase.from("transfers").delete().eq("status", "planned").eq("note", `For ${String(ev.title).slice(0, 100)}`);
    await supabase.from("calendar_events").update({ decision: null }).eq("id", eventId);
    await logDecision(supabase, "event", eventId, "undo", { title: ev.title, via: "plan card" });
    revalidatePath("/app", "layout");
    return;
  }

  if (kind === "decline") {
    await supabase.from("calendar_events").update({ decision: "skip", user_corrected: true }).eq("id", eventId);
    await logDecision(supabase, "event", eventId, "skip", { title: ev.title, via: "plan card" });
    revalidatePath("/app", "layout");
    return;
  }

  let apply: { moves?: Array<{ fromAccountId: string; cents: number }>; date?: string; skipEventIds?: string[]; capCents?: number; newDate?: string; paymentAccountId?: string | null } = {};
  try {
    apply = JSON.parse(String(form.get("apply") ?? "{}"));
  } catch {
    return;
  }
  const isId = (x: unknown): x is string => typeof x === "string" && /^[0-9a-f-]{36}$/i.test(x);
  const isDate = (x: unknown): x is string => typeof x === "string" && /^\d{4}-\d{2}-\d{2}$/.test(x);

  // Savings moves land in the account that pays for it: the card's payment account, or your main cash account.
  if (apply.moves?.length) {
    const { data: accts } = await supabase.from("accounts").select("id, kind, is_spendable, payment_account_id, archived");
    const payId = apply.paymentAccountId === undefined ? ev.payment_account_id : apply.paymentAccountId;
    const pay = accts?.find((a) => a.id === payId);
    const target =
      (pay?.kind === "credit_card" ? accts?.find((a) => a.id === pay.payment_account_id) : pay?.is_spendable ? pay : null) ??
      accts?.find((a) => a.is_spendable && a.kind === "checking" && !a.archived) ??
      accts?.find((a) => a.is_spendable && !a.archived);
    if (!target) return;
    const { today } = await userToday(supabase);
    const date = isDate(apply.date) && apply.date >= today ? apply.date : today;
    for (const m of apply.moves) {
      if (!isId(m.fromAccountId) || m.fromAccountId === target.id || !Number.isInteger(m.cents) || m.cents <= 0 || m.cents > 100_000_000) continue;
      const from = accts?.find((a) => a.id === m.fromAccountId);
      if (!from || from.kind !== "savings") continue;
      await supabase.from("transfers").insert({
        from_account_id: m.fromAccountId,
        to_account_id: target.id,
        date,
        amount_cents: m.cents,
        status: "planned",
        note: `For ${String(ev.title).slice(0, 100)}`,
      });
    }
  }
  for (const id of (apply.skipEventIds ?? []).filter(isId).slice(0, 5)) {
    if (id === eventId) continue;
    await supabase.from("calendar_events").update({ decision: "skip", user_corrected: true }).eq("id", id);
  }
  const patch: Record<string, unknown> = { decision: "proceed", user_corrected: true };
  if (Number.isInteger(apply.capCents) && apply.capCents! > 0) {
    patch.decision = "cheaper";
    patch.cap_cents = apply.capCents;
  }
  if (isDate(apply.newDate)) patch.date = apply.newDate;
  if (apply.paymentAccountId === null || isId(apply.paymentAccountId)) patch.payment_account_id = apply.paymentAccountId;
  await supabase.from("calendar_events").update(patch).eq("id", eventId);
  await logDecision(supabase, "event", eventId, String(patch.decision), { title: ev.title, option: kind, via: "plan card" });
  revalidatePath("/app", "layout");
}

export async function setEventDuplicate(form: FormData) {
  const { supabase } = await session();
  const id = idFrom(form);
  const other = String(form.get("other") ?? "");
  if (!id || !/^[0-9a-f-]{36}$/i.test(other)) return;
  if (form.get("verdict") === "duplicate") {
    await supabase.from("calendar_events").update({ duplicate_of: other, duplicate_confirmed: true }).eq("id", id);
  } else {
    const { data } = await supabase.from("calendar_events").select("not_duplicate_of").eq("id", id).maybeSingle();
    const list = new Set<string>((data?.not_duplicate_of as string[]) ?? []);
    list.add(other);
    await supabase.from("calendar_events").update({ not_duplicate_of: [...list], duplicate_of: null, duplicate_confirmed: false }).eq("id", id);
  }
  revalidatePath("/app", "layout");
}

export async function deleteEvent(form: FormData) {
  const { supabase } = await session();
  const id = idFrom(form);
  if (!id) return;
  await supabase.from("calendar_events").delete().eq("id", id);
  revalidatePath("/app", "layout");
}

/* ---------------------------------------------------- decisions & scenarios */

export async function recordDecision(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await session();
  const subjectType = String(form.get("subjectType") ?? "");
  const decision = String(form.get("decision") ?? "").slice(0, 60);
  if (!["purchase", "question", "scenario"].includes(subjectType) || !decision) return fail("Nothing to save.");
  let detail: Record<string, unknown> = {};
  try {
    detail = JSON.parse(String(form.get("detail") ?? "{}"));
  } catch {
    /* ignore */
  }
  await logDecision(supabase, subjectType, String(form.get("subjectId") ?? "").slice(0, 200) || null, decision, detail);
  return ok("Decision saved. It'll be here next time.");
}

export async function saveScenario(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await session();
  const name = String(form.get("name") ?? "").trim();
  if (!name || name.length > 60) return invalid({ name: "Give the scenario a name (up to 60 characters)." });
  let adjustments: unknown;
  try {
    adjustments = JSON.parse(String(form.get("adjustments") ?? "[]"));
  } catch {
    return fail("The scenario couldn't be read.");
  }
  if (!Array.isArray(adjustments) || adjustments.length === 0 || adjustments.length > 50) return fail("Add at least one change to the scenario.");
  const { error } = await supabase.from("scenarios").insert({ name, adjustments });
  if (error) return dbError(error);
  return ok("Scenario saved.");
}

export async function deleteScenario(form: FormData) {
  const { supabase } = await session();
  const id = idFrom(form);
  if (!id) return;
  await supabase.from("scenarios").delete().eq("id", id);
  revalidatePath("/app", "layout");
}

export async function deleteCorrection(form: FormData) {
  const { supabase } = await session();
  const id = idFrom(form);
  if (!id) return;
  await supabase.from("corrections").delete().eq("id", id);
  revalidatePath("/app", "layout");
}

export async function clearDecisions() {
  const { supabase, user } = await session();
  await supabase.from("decisions").delete().eq("user_id", user.id);
  revalidatePath("/app", "layout");
}

/* ------------------------------------------------------------------ privacy */

export async function importData(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, user } = await session();
  if (form.get("confirm") !== "REPLACE") return invalid({ confirm: 'Type REPLACE to confirm. Importing replaces all of your current data.' });
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return invalid({ file: `Choose a ${APP_NAME} export (.json).` });
  if (file.size > MAX_IMPORT_BYTES) return invalid({ file: "That file is larger than 5 MB." });
  const parsed = parseImport(await file.text(), () => crypto.randomUUID());
  if (!parsed.ok) return invalid({ file: parsed.error });
  const r = parsed.rows;

  const wipe = await supabase.rpc("delete_my_data");
  if (wipe.error) return dbError(wipe.error, "Couldn't clear existing data, so nothing was imported.");

  const steps: Array<[string, Record<string, unknown>[]]> = [
    ["accounts", r.accounts],
    ["recurring_rules", r.rules],
    ["occurrence_overrides", r.overrides],
    ["transactions", r.transactions],
    ["transfers", r.transfers],
    ["card_statements", r.statements],
    ["savings_goals", r.goals],
    ["calendar_events", r.calendarEvents],
    ["corrections", r.corrections],
    ["decisions", r.decisions],
    ["scenarios", r.scenarios],
  ];
  for (const [table, rows] of steps) {
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await supabase.from(table).insert(rows.slice(i, i + 500));
      if (error) {
        await supabase.rpc("delete_my_data");
        return fail(`Import stopped at ${table.replace(/_/g, " ")} (${error.message}). Your data was cleared so it isn't half-imported; import again or restore another export.`);
      }
    }
  }
  for (const link of r.accountPaymentLinks) {
    await supabase.from("accounts").update({ payment_account_id: link.payment_account_id }).eq("id", link.id);
  }
  if (r.profile) await supabase.from("profiles").upsert({ user_id: user.id, ...r.profile, onboarded_at: new Date().toISOString() });
  if (r.settings) await supabase.from("forecast_settings").upsert({ user_id: user.id, ...r.settings });
  return ok(`Imported ${parsed.counts.accounts} accounts, ${parsed.counts.rules} recurring items and ${parsed.counts.transactions} transactions.`);
}

export async function deleteAllData(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, user } = await session();
  if (form.get("confirm") !== "DELETE") return invalid({ confirm: "Type DELETE to confirm." });
  // Disconnect banks at Plaid first, so nothing keeps access after your data is gone.
  await disconnectAllBanks(supabase, user.id).catch(() => {});
  const { error } = await supabase.rpc("delete_my_data");
  if (error) return dbError(error);
  revalidatePath("/app", "layout");
  redirect("/app/onboarding");
}

export async function deleteMyAccount(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, user } = await session();
  if (form.get("confirm") !== "DELETE MY ACCOUNT") return invalid({ confirm: "Type DELETE MY ACCOUNT to confirm." });
  await disconnectAllBanks(supabase, user.id).catch(() => {});
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  // Always wipe financial data first, under the user's own RLS session.
  const { error } = await supabase.rpc("delete_my_data");
  if (error) return dbError(error);
  if (!serviceKey || !url) {
    return fail("Your financial data was deleted. Removing the login itself isn't enabled on this server; contact the site owner to finish.");
  }
  // The service role is used for exactly one call: deleting this user's own auth record (cascades to all rows).
  const admin = createAdminClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const del = await admin.auth.admin.deleteUser(user.id);
  if (del.error) return fail("Your financial data was deleted, but the login couldn't be removed. Please try again.");
  await supabase.auth.signOut();
  redirect("/?deleted=1");
}

export async function signOut() {
  const { supabase } = await getUser();
  await supabase.auth.signOut();
  redirect("/");
}
