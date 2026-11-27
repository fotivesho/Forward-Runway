import "server-only";
import type { AppSupabaseClient as SupabaseClient } from "../supabase/server";
import {
  mapAccount,
  mapCalendarEvent,
  mapCalendarSource,
  mapCorrection,
  mapDecision,
  mapGoal,
  mapOverride,
  mapProfile,
  mapRule,
  mapScenario,
  mapSettings,
  mapStatement,
  mapTransaction,
  mapTransfer,
} from "./mappers";
import { DEFAULT_SETTINGS, type Snapshot } from "./snapshot";
import { autoPosted } from "./match";
import { todayInZone } from "../dates";

export class LoadError extends Error {}

/**
 * Load the signed-in user's whole snapshot. Every query runs under RLS with
 * the user's session, so it can only ever return their own rows.
 */
export async function loadSnapshot(supabase: SupabaseClient, userId?: string): Promise<Snapshot> {
  // Signed in: row-level security already limits every query to you. A server job (the morning
  // notification) passes the user explicitly, and every query is filtered to them.
  const from = (table: string) => ({
    select: <Q extends string>(cols: Q) => (userId ? supabase.from(table).select(cols).eq("user_id", userId) : supabase.from(table).select(cols)),
  });
  const historyFrom = new Date(Date.now() - 760 * 86_400_000).toISOString().slice(0, 10);
  const [profile, settings, accounts, rules, overrides, txns, transfers, statements, goals, sources, events, corrections, decisions, scenarios] =
    await Promise.all([
      from("profiles").select("*").maybeSingle(),
      from("forecast_settings").select("*").maybeSingle(),
      from("accounts").select("*").order("sort_order").order("created_at"),
      from("recurring_rules").select("*").order("created_at"),
      from("occurrence_overrides").select("*"),
      from("transactions").select("*").gte("date", historyFrom).order("date", { ascending: false }).limit(5000),
      from("transfers").select("*").gte("date", historyFrom).order("date", { ascending: false }).limit(2000),
      from("card_statements").select("*").order("closing_date", { ascending: false }).limit(500),
      from("savings_goals").select("*").order("created_at"),
      // ics_url is read only to derive a host hint; the full address never leaves the server.
      from("calendar_sources").select("id,name,kind,enabled,last_status,last_synced_at,last_attempt_at,last_error,event_count,ics_url").order("created_at"),
      from("calendar_events").select("*").gte("date", historyFrom).order("date").limit(5000),
      from("corrections").select("*").order("updated_at", { ascending: false }),
      from("decisions").select("*").order("created_at", { ascending: false }).limit(200),
      from("scenarios").select("*").order("created_at"),
    ]);

  const firstError = [profile, settings, accounts, rules, overrides, txns, transfers, statements, goals, sources, events, corrections, decisions, scenarios].find(
    (r) => r.error,
  )?.error;
  if (firstError) throw new LoadError(`Couldn't load your data: ${firstError.message}`);

  // Category settings arrived in a later update: if its table isn't there yet, carry on without it.
  // Symbol and color arrived in a later update: read without them until it's applied.
  let cats = await from("category_settings").select("name, grp, monthly_budget_cents, icon, color");
  if (cats.error) cats = (await from("category_settings").select("name, grp, monthly_budget_cents")) as typeof cats;
  const categorySettings = cats.error
    ? []
    : (cats.data ?? []).map((r) => ({
        name: String(r.name),
        group: (["needs", "wants", "savings"].includes(String(r.grp)) ? r.grp : "wants") as "needs" | "wants" | "savings",
        monthlyBudgetCents: r.monthly_budget_cents == null ? null : Number(r.monthly_budget_cents),
        icon: (r as { icon?: string | null }).icon ?? null,
        color: (r as { color?: string | null }).color ?? null,
      }));

  const prof = mapProfile(profile.data);
  const ruleList = (rules.data ?? []).map(mapRule);
  const overrideList = (overrides.data ?? []).map(mapOverride);
  const txnList = (txns.data ?? []).map(mapTransaction);
  // A repeating item's real charge (any amount close enough) marks that date as done, so it's never counted twice.
  const auto = autoPosted(ruleList, txnList, overrideList, todayInZone(prof.timezone || "America/New_York"));
  return {
    categorySettings,
    profile: prof,
    settings: mapSettings(settings.data, DEFAULT_SETTINGS),
    accounts: (accounts.data ?? []).map(mapAccount),
    rules: ruleList,
    overrides: [...overrideList, ...auto],
    transactions: txnList,
    transfers: (transfers.data ?? []).map(mapTransfer),
    statements: (statements.data ?? []).map(mapStatement),
    goals: (goals.data ?? []).map(mapGoal),
    calendarSources: (sources.data ?? []).map(mapCalendarSource),
    calendarEvents: (events.data ?? []).map(mapCalendarEvent),
    corrections: (corrections.data ?? []).map(mapCorrection),
    decisions: (decisions.data ?? []).map(mapDecision),
    scenarios: (scenarios.data ?? []).map(mapScenario),
  };
}
