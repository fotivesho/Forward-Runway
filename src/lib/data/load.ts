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

export class LoadError extends Error {}

/**
 * Load the signed-in user's whole snapshot. Every query runs under RLS with
 * the user's session, so it can only ever return their own rows.
 */
export async function loadSnapshot(supabase: SupabaseClient): Promise<Snapshot> {
  const historyFrom = new Date(Date.now() - 400 * 86_400_000).toISOString().slice(0, 10);
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
  const cats = await supabase.from("category_settings").select("name, grp, monthly_budget_cents");
  const categorySettings = cats.error
    ? []
    : (cats.data ?? []).map((r) => ({
        name: String(r.name),
        group: (["needs", "wants", "savings"].includes(String(r.grp)) ? r.grp : "wants") as "needs" | "wants" | "savings",
        monthlyBudgetCents: r.monthly_budget_cents == null ? null : Number(r.monthly_budget_cents),
      }));

  return {
    categorySettings,
    profile: mapProfile(profile.data),
    settings: mapSettings(settings.data, DEFAULT_SETTINGS),
    accounts: (accounts.data ?? []).map(mapAccount),
    rules: (rules.data ?? []).map(mapRule),
    overrides: (overrides.data ?? []).map(mapOverride),
    transactions: (txns.data ?? []).map(mapTransaction),
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
