import { diffDays, type ISODate } from "../dates";
import { normalizeTitle, similarity } from "./estimate";

export interface DedupeCandidate {
  id: string;
  title: string;
  date: ISODate;
  sourceId: string | null;
  /** Events the user has already corrected are preferred as the "kept" copy. */
  userCorrected?: boolean;
}

export interface DuplicateMatch {
  id: string;
  duplicateOf: string;
  reason: string;
}

/**
 * Detect likely duplicate entries for the same event, e.g. the same dinner on
 * your calendar and a shared calendar. Same day (or ±1 day across calendars
 * when the title is identical — time-zone drift) and similar titles.
 * Pairs in `notDuplicates` (user said "these are different") are never matched.
 */
export function findDuplicates(events: DedupeCandidate[], notDuplicates: Array<[string, string]> = []): DuplicateMatch[] {
  const blocked = new Set(notDuplicates.map(([a, b]) => pairKey(a, b)));
  const sorted = [...events].sort(
    (a, b) =>
      Number(!!b.userCorrected) - Number(!!a.userCorrected) ||
      (a.date < b.date ? -1 : a.date > b.date ? 1 : 0) ||
      (a.id < b.id ? -1 : 1),
  );
  const keepers: DedupeCandidate[] = [];
  const matches: DuplicateMatch[] = [];
  for (const e of sorted) {
    const keyE = normalizeTitle(e.title);
    let found: { keeper: DedupeCandidate; reason: string } | null = null;
    for (const k of keepers) {
      if (blocked.has(pairKey(e.id, k.id))) continue;
      const gap = Math.abs(diffDays(k.date, e.date));
      const keyK = normalizeTitle(k.title);
      const sameTitle = keyE !== "" && keyE === keyK;
      const contains = keyE.length >= 4 && keyK.length >= 4 && (keyE.includes(keyK) || keyK.includes(keyE));
      const sim = similarity(e.title, k.title);
      if (gap === 0 && (sameTitle || contains || sim >= 0.6)) {
        found = { keeper: k, reason: sameTitle ? "Same title on the same day" : "Similar title on the same day" };
        break;
      }
      if (gap === 1 && sameTitle && e.sourceId !== k.sourceId) {
        found = { keeper: k, reason: "Same title one day apart on different calendars (likely a time-zone difference)" };
        break;
      }
    }
    if (found) matches.push({ id: e.id, duplicateOf: found.keeper.id, reason: found.reason });
    else keepers.push(e);
  }
  return matches;
}

export function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}
