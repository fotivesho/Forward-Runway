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
export async function loadSnapshot(supabase: SupabaseClient): Promise<Snapshot> {
  const historyFrom = new Date(Date.now() - 760 * 86_400_000).toISOString().slice(0, 10);
  const [profile, settings, accounts, rules, overrides, txns, transfers, statements, goals, sources, events, corrections, decisions, scenarios] =
    await Promise.all([
      supabase.from("profiles").select("*").maybeSingle(),
      supabase.from("forecast_settings").select("*").maybeSingle(),
      supabase.from("accounts").select("*").order("sort_order").order("created_at"),
      supabase.from("recurring_rules").select("*").order("created_at"),
      supabase.from("occurrence_overrides").select("*"),
      supabase.from("transactions").select("*").gte("date", historyFrom).order("date", { ascending: false }).limit(5000),
      supabase.from("transfers").select("*").gte("date", historyFrom).order("date", { ascending: false }).limit(2000),
      supabase.from("card_statements").select("*").order("closing_date", { ascending: false }).limit(500),
      supabase.from("savings_goals").select("*").order("created_at"),
      // ics_url is read only to derive a host hint; the full address never leaves the server.
      supabase.from("calendar_sources").select("id,name,kind,enabled,last_status,last_synced_at,last_attempt_at,last_error,event_count,ics_url").order("created_at"),
      supabase.from("calendar_events").select("*").gte("date", historyFrom).order("date").limit(5000),
      supabase.from("corrections").select("*").order("updated_at", { ascending: false }),
      supabase.from("decisions").select("*").order("created_at", { ascending: false }).limit(200),
      supabase.from("scenarios").select("*").order("created_at"),
    ]);

  const firstError = [profile, settings, accounts, rules, overrides, txns, transfers, statements, goals, sources, events, corrections, decisions, scenarios].find(
    (r) => r.error,
  )?.error;
  if (firstError) throw new LoadError(`Couldn't load your data: ${firstError.message}`);

  // Category settings arrived in a later update: if its table isn't there yet, carry on without it.
  // Symbol and color arrived in a later update: read without them until it's applied.
  let cats = await supabase.from("category_settings").select("name, grp, monthly_budget_cents, icon, color");
  if (cats.error) cats = (await supabase.from("category_settings").select("name, grp, monthly_budget_cents")) as typeof cats;
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
