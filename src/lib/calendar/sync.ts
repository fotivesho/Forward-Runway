import "server-only";
import type { AppSupabaseClient as SupabaseClient } from "../supabase/server";
import { addDays, type ISODate } from "../dates";
import { fetchIcs, FetchIcsError } from "./fetch";
import { parseIcs, type ParsedEvent } from "./ics";

export const SYNC_PAST_DAYS = 7;
export const SYNC_FUTURE_DAYS = 120;

export interface SyncOutcome {
  status: "ok" | "error" | "empty_suspicious";
  message: string;
  added: number;
  updated: number;
  removed: number;
}

/**
 * Sync one calendar source. Never treats an empty or failed result as "no plans":
 *  - a failed fetch/parse records an error and leaves existing events untouched;
 *  - an empty feed that previously had events is flagged and leaves events untouched;
 *  - events that disappear from a feed are removed only if the user hadn't corrected them
 *    (corrected ones are kept and flagged "missing from feed").
 */
export async function syncSource(
  supabase: SupabaseClient,
  source: { id: string; ics_url: string | null; event_count: number },
  opts: { timezone: string; today: ISODate; icsText?: string },
): Promise<SyncOutcome> {
  const now = new Date().toISOString();
  const from = addDays(opts.today, -SYNC_PAST_DAYS);
  const to = addDays(opts.today, SYNC_FUTURE_DAYS);

  let parsed: ParsedEvent[];
  let warnings: string[] = [];
  try {
    const text = opts.icsText ?? (source.ics_url ? await fetchIcs(source.ics_url) : null);
    if (text == null) throw new FetchIcsError("This calendar has no address to sync from.");
    const result = parseIcs(text, from, to, opts.timezone);
    parsed = result.events;
    warnings = result.warnings;
  } catch (e) {
    const message = e instanceof FetchIcsError ? e.message : "The calendar couldn't be read (it may not be an iCal feed).";
    await supabase.from("calendar_sources").update({ last_status: "error", last_error: message, last_attempt_at: now }).eq("id", source.id);
    return { status: "error", message, added: 0, updated: 0, removed: 0 };
  }

  const { data: existingRows, error: exErr } = await supabase
    .from("calendar_events")
    .select("id, external_uid, date, user_corrected")
    .eq("source_id", source.id)
    .gte("date", from);
  if (exErr) {
    await supabase.from("calendar_sources").update({ last_status: "error", last_error: "Couldn't save events.", last_attempt_at: now }).eq("id", source.id);
    return { status: "error", message: "Couldn't save events.", added: 0, updated: 0, removed: 0 };
  }
  const existing = new Map((existingRows ?? []).map((r) => [String(r.external_uid), r]));

  if (parsed.length === 0 && (source.event_count > 0 || existing.size > 0)) {
    const message = "The calendar came back empty although it had events before; keeping earlier events.";
    await supabase.from("calendar_sources").update({ last_status: "empty_suspicious", last_error: message, last_attempt_at: now }).eq("id", source.id);
    return { status: "empty_suspicious", message, added: 0, updated: 0, removed: 0 };
  }

  const fresh: Record<string, unknown>[] = [];
  const refresh: Record<string, unknown>[] = [];
  const correctedRefresh: Array<{ id: string; cancelled: boolean; location: string | null }> = [];
  const seen = new Set<string>();
  for (const e of parsed) {
    const uid = e.uid.slice(0, 500);
    if (seen.has(uid)) continue;
    seen.add(uid);
    const prior = existing.get(uid);
    const base = { title: e.title.slice(0, 200) || "Untitled event", date: e.date, location: e.location?.slice(0, 200) ?? null, cancelled: e.cancelled, missing_from_feed: false };
    if (!prior) fresh.push({ source_id: source.id, external_uid: uid, ...base });
    else if (prior.user_corrected) correctedRefresh.push({ id: String(prior.id), cancelled: e.cancelled, location: base.location });
    else refresh.push({ source_id: source.id, external_uid: uid, ...base });
  }

  const writes: PromiseLike<{ error: unknown }>[] = [];
  if (fresh.length) writes.push(supabase.from("calendar_events").upsert(fresh, { onConflict: "source_id,external_uid" }));
  if (refresh.length) writes.push(supabase.from("calendar_events").upsert(refresh, { onConflict: "source_id,external_uid" }));
  for (const c of correctedRefresh) {
    writes.push(supabase.from("calendar_events").update({ cancelled: c.cancelled, missing_from_feed: false }).eq("id", c.id));
  }
  // Gone from the feed (future only): delete if untouched, keep + flag if corrected.
  const gone = [...existing.entries()].filter(([uid, r]) => !seen.has(uid) && String(r.date) >= opts.today);
  const goneDelete = gone.filter(([, r]) => !r.user_corrected).map(([, r]) => String(r.id));
  const goneFlag = gone.filter(([, r]) => r.user_corrected).map(([, r]) => String(r.id));
  if (goneDelete.length) writes.push(supabase.from("calendar_events").delete().in("id", goneDelete));
  if (goneFlag.length) writes.push(supabase.from("calendar_events").update({ missing_from_feed: true }).in("id", goneFlag));

  const results = await Promise.all(writes);
  if (results.some((r) => r.error)) {
    await supabase.from("calendar_sources").update({ last_status: "error", last_error: "Some events couldn't be saved.", last_attempt_at: now }).eq("id", source.id);
    return { status: "error", message: "Some events couldn't be saved.", added: 0, updated: 0, removed: 0 };
  }
  await supabase
    .from("calendar_sources")
    .update({ last_status: "ok", last_error: warnings[0] ?? null, last_synced_at: now, last_attempt_at: now, event_count: seen.size })
    .eq("id", source.id);
  return {
    status: "ok",
    message: `Synced ${seen.size} event${seen.size === 1 ? "" : "s"}.`,
    added: fresh.length,
    updated: refresh.length + correctedRefresh.length,
    removed: goneDelete.length,
  };
}
