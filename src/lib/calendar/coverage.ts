export type SyncStatus = "never" | "ok" | "error" | "empty_suspicious";

export interface CalendarSourceState {
  id: string;
  name: string;
  enabled: boolean;
  lastStatus: SyncStatus;
  lastSyncedAt: string | null; // ISO timestamp of last successful sync
  lastAttemptAt: string | null;
  lastError: string | null;
  eventCount: number;
}

export interface Coverage {
  status: "none" | "partial" | "complete";
  /** true when the advisor must assume there may be plans it can't see. */
  incomplete: boolean;
  notes: string[];
}

const STALE_HOURS = 24;

/**
 * How much of the user's calendar we can actually see. An empty or failed
 * result is NEVER treated as "no plans": no calendars, failed syncs, stale
 * syncs and suspiciously empty feeds all make coverage incomplete.
 */
export function calendarCoverage(sources: CalendarSourceState[], now: Date = new Date()): Coverage {
  const enabled = sources.filter((s) => s.enabled);
  if (enabled.length === 0) {
    return {
      status: "none",
      incomplete: true,
      notes: ["No calendars connected, so upcoming plans are unknown. Daily limits include a buffer for plans we can't see."],
    };
  }
  const notes: string[] = [];
  for (const s of enabled) {
    if (s.lastStatus === "never") notes.push(`${s.name} hasn't synced yet.`);
    else if (s.lastStatus === "error") notes.push(`${s.name} failed to sync${s.lastError ? ` (${s.lastError})` : ""}. Its plans may be missing.`);
    else if (s.lastStatus === "empty_suspicious")
      notes.push(`${s.name} came back empty although it had events before. Earlier events are kept until it syncs normally.`);
    else if (!s.lastSyncedAt || (now.getTime() - Date.parse(s.lastSyncedAt)) / 3_600_000 > STALE_HOURS)
      notes.push(`${s.name} was last synced over ${STALE_HOURS} hours ago.`);
  }
  if (notes.length) return { status: "partial", incomplete: true, notes };
  return {
    status: "complete",
    incomplete: false,
    notes: ["Plans come only from the calendars you've connected; anything not on them isn't included."],
  };
}
