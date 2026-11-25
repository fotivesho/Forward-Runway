import {
  addDays,
  adjustForWeekend,
  clampedDay,
  diffDays,
  parts,
  type ISODate,
} from "../dates";
import type { OccurrenceOverride, RecurringRule, Schedule } from "./types";

/**
 * Expand a schedule into raw (un-adjusted) occurrence dates within [from, to].
 * Month-end handling: a monthly rule on the 31st lands on the last day of
 * shorter months (Feb 28/29, Apr 30) and returns to the 31st afterwards —
 * it never drifts.
 */
export function rawOccurrences(schedule: Schedule, from: ISODate, to: ISODate): ISODate[] {
  const start = schedule.startDate;
  const end = schedule.endDate && schedule.endDate < to ? schedule.endDate : to;
  const lo = from > start ? from : start;
  if (lo > end) return [];
  const out: ISODate[] = [];

  switch (schedule.frequency) {
    case "once": {
      if (start >= from && start <= end) out.push(start);
      break;
    }
    case "weekly":
    case "biweekly": {
      const step = schedule.frequency === "weekly" ? 7 : 14;
      const offset = diffDays(start, lo);
      const k = Math.max(0, Math.ceil(offset / step));
      for (let d = addDays(start, k * step); d <= end; d = addDays(d, step)) out.push(d);
      break;
    }
    case "monthly": {
      const day = schedule.dayOfMonth ?? parts(start).d;
      forEachMonth(lo, end, (y, m) => {
        const d = clampedDay(y, m, day);
        if (d >= lo && d <= end) out.push(d);
      });
      break;
    }
    case "semimonthly": {
      const a = schedule.dayOfMonth ?? 1;
      const b = schedule.secondDayOfMonth ?? 15;
      forEachMonth(lo, end, (y, m) => {
        const days = [clampedDay(y, m, a), clampedDay(y, m, b)];
        days.sort();
        // If both clamp to the same day (e.g. 30 and 31 in February) keep one.
        if (days[0] === days[1]) days.pop();
        for (const d of days) if (d >= lo && d <= end) out.push(d);
      });
      break;
    }
  }
  return out;
}

function forEachMonth(from: ISODate, to: ISODate, fn: (y: number, m: number) => void) {
  let { y, m } = parts(from);
  const last = parts(to);
  while (y < last.y || (y === last.y && m <= last.m)) {
    fn(y, m);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
}

export interface Occurrence {
  ruleId: string;
  /** Scheduled date before weekend adjustment / override: the occurrence's identity. */
  originalDate: ISODate;
  date: ISODate;
  amountCents: number;
  overridden: boolean;
  posted: boolean;
  movedFrom?: ISODate;
  note?: string | null;
}

/**
 * Occurrences of a rule whose effective date falls within [from, to], after
 * weekend adjustment and per-occurrence overrides. Overrides are keyed by
 * the original (pre-adjustment) scheduled date. "posted" occurrences are
 * returned with posted=true so callers can show them but leave them out of
 * cash math.
 */
export function ruleOccurrences(
  rule: RecurringRule,
  overrides: OccurrenceOverride[],
  from: ISODate,
  to: ISODate,
): Occurrence[] {
  if (rule.active === false) return [];
  const mine = new Map<string, OccurrenceOverride>();
  for (const o of overrides) if (o.ruleId === rule.id) mine.set(o.originalDate, o);

  // Look a little outside the window: weekend adjustment or a moved
  // override can pull an occurrence across the boundary.
  let maxShift = 3;
  for (const o of mine.values()) {
    if (o.newDate) maxShift = Math.max(maxShift, Math.abs(diffDays(o.originalDate, o.newDate)) + 3);
  }
  const raw = rawOccurrences(rule.schedule, addDays(from, -maxShift), addDays(to, maxShift));
  const adjust = rule.schedule.weekendAdjust ?? "none";
  const out: Occurrence[] = [];
  for (const original of raw) {
    const o = mine.get(original);
    if (o?.action === "skip") continue;
    let date = adjustForWeekend(original, adjust);
    let amount = rule.amountCents;
    let movedFrom: ISODate | undefined;
    if (o?.action === "modify") {
      if (o.newDate) {
        if (o.newDate !== date) movedFrom = date;
        date = o.newDate;
      }
      if (o.amountCents != null) amount = o.amountCents;
    }
    if (date < from || date > to) continue;
    out.push({
      ruleId: rule.id,
      originalDate: original,
      date,
      amountCents: amount,
      overridden: !!o,
      posted: o?.action === "posted",
      movedFrom,
      note: o?.note ?? null,
    });
  }
  return out;
}

/** Next occurrence on or after `from` (searches up to ~400 days). */
export function nextOccurrence(
  rule: RecurringRule,
  overrides: OccurrenceOverride[],
  from: ISODate,
): Occurrence | null {
  const list = ruleOccurrences(rule, overrides, from, addDays(from, 400)).filter((o) => !o.posted);
  return list[0] ?? null;
}

export function describeSchedule(s: Schedule): string {
  const dayName = (d: number | null | undefined) =>
    d == null ? "" : d === -1 ? "last day" : `${d}${ordinal(d)}`;
  switch (s.frequency) {
    case "once":
      return `Once on ${s.startDate}`;
    case "weekly":
      return "Every week";
    case "biweekly":
      return "Every 2 weeks";
    case "monthly":
      return `Monthly on the ${dayName(s.dayOfMonth ?? parts(s.startDate).d)}`;
    case "semimonthly":
      return `Twice monthly (${dayName(s.dayOfMonth ?? 1)} & ${dayName(s.secondDayOfMonth ?? 15)})`;
  }
}

function ordinal(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return "th";
  return ["th", "st", "nd", "rd"][n % 10] ?? "th";
}
