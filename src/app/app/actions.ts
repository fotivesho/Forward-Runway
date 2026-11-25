"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient as createAdminClient } from "@supabase/supabase-js";
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
  const parsed = parseForm(transactionSchema, form);
  if (!parsed.ok) return invalid(parsed.fieldErrors);
  const { id, row } = parsed.data;
  const { error } = id ? await supabase.from("transactions").update(row).eq("id", id) : await supabase.from("transactions").insert(row);
  if (error) return dbError(error);
  return ok(id ? "Transaction updated." : row.status === "posted" && row.direction === "out" ? "Spending logged. Caps recalculated." : "Transaction added.");
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
  if (!(file instanceof File) || file.size === 0) return invalid({ file: "Choose a Forward Runway export (.json)." });
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
  const { supabase } = await session();
  if (form.get("confirm") !== "DELETE") return invalid({ confirm: "Type DELETE to confirm." });
  const { error } = await supabase.rpc("delete_my_data");
  if (error) return dbError(error);
  revalidatePath("/app", "layout");
  redirect("/app/onboarding");
}

export async function deleteMyAccount(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, user } = await session();
  if (form.get("confirm") !== "DELETE MY ACCOUNT") return invalid({ confirm: "Type DELETE MY ACCOUNT to confirm." });
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
