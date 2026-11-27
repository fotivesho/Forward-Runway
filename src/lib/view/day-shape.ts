/**
 * How each day ahead is likely to go, from your own habits, so daily limits follow real life:
 * busier weekdays and payday get more room, quiet days less, and a trip that's due (groceries
 * every ~6 days, last one 8 days ago) gets room on the day it's likely. Pure and deterministic.
 */
import { addDays, dayOfWeek, diffDays, eachDay, type ISODate } from "../dates";
import type { Cents } from "../money";
import { isNotSpending } from "../categories";
import type { Snapshot } from "../data/snapshot";
import { spendModel, typicalDay } from "./patterns";

export interface DueTrip {
  category: string;
  /** The day it's likely (today when it's overdue). */
  date: ISODate;
  cents: Cents;
  everyDays: number;
  lastDate: ISODate;
  overdue: boolean;
}

const ROUTINE = new Set(["Groceries", "Transport", "Car", "Personal care", "Health", "Home", "Fitness", "Services"]);

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)]! : 0;
};

/** Everyday things you do every few days (groceries, gas, a haircut), and when each is next due. */
export function dueTrips(s: Snapshot, today: ISODate, until: ISODate): DueTrip[] {
  const from = addDays(today, -120);
  const byCat = new Map<string, Map<ISODate, Cents>>();
  for (const t of s.transactions) {
    if (t.status !== "posted" || t.direction !== "out" || t.date < from || t.date >= today || t.calendarEventId || isNotSpending(t.category)) continue;
    const c = t.category ?? "Other";
    // Routine needs you restock on a rhythm; wants (shopping, dining out) aren't "due".
    if (!ROUTINE.has(c)) continue;
    const days = byCat.get(c) ?? new Map<ISODate, Cents>();
    days.set(t.date, (days.get(t.date) ?? 0) + t.amountCents);
    byCat.set(c, days);
  }
  const out: DueTrip[] = [];
  for (const [category, days] of byCat) {
    const dates = [...days.keys()].sort();
    if (dates.length < 4) continue;
    const gaps = dates.slice(1).map((d, i) => diffDays(dates[i]!, d));
    const every = median(gaps);
    // Trips, not daily habits (coffee) and not rare one-offs.
    if (every < 3 || every > 35) continue;
    const steady = gaps.filter((g) => Math.abs(g - every) <= Math.max(2, every * 0.5)).length >= gaps.length * 0.6;
    if (!steady) continue;
    const cents = median([...days.values()]);
    const last = dates[dates.length - 1]!;
    let next = addDays(last, every);
    const overdue = next < today;
    if (overdue) next = today;
    for (let d = next, first = true; d <= until; d = addDays(d, every), first = false) {
      out.push({ category, date: d, cents, everyDays: every, lastDate: last, overdue: overdue && first });
    }
  }
  return out;
}

export interface DayShape {
  /** Relative weight per day (1 = an average day). */
  weights: Record<ISODate, number>;
  /** Plain-words reasons a day is higher or lower than usual. */
  reasons: Record<ISODate, string[]>;
}

export function dayShape(s: Snapshot, today: ISODate, until: ISODate): DayShape | null {
  const m = spendModel(s, today);
  if (!m || m.perDayCents <= 0) return null;
  const trips = dueTrips(s, today, until);
  // The usual daily amount already includes these trips spread out; take them out, then put them on their day.
  const tripCats = new Set(trips.map((t) => t.category));
  const tripShare = Math.min(0.8, m.byCategory.filter((c) => tripCats.has(c.category)).reduce((a, c) => a + c.perDayCents, 0) / m.perDayCents);
  const expected: Record<ISODate, number> = {};
  const reasons: Record<ISODate, string[]> = {};
  for (const d of eachDay(today, until)) {
    const t = typicalDay(m, d);
    const onDay = trips.filter((x) => x.date === d);
    expected[d] = t.cents * (1 - tripShare) + onDay.reduce((a, x) => a + x.cents, 0);
    const why: string[] = [];
    if (t.why) why.push(t.why[0]!.toUpperCase() + t.why.slice(1));
    for (const x of onDay) {
      const ago = diffDays(x.lastDate, today);
      why.push(x.overdue ? `${x.category} likely: last time was ${ago} days ago, usually every ${x.everyDays}` : `${x.category} likely (about every ${x.everyDays} days)`);
    }
    if (why.length) reasons[d] = why;
  }
  const vals = Object.values(expected);
  const avg = vals.reduce((a, b) => a + b, 0) / Math.max(1, vals.length) || 1;
  // Mostly your pattern (weekends and payday where you really spend), a little even so a quiet day isn't zero.
  const weights: Record<ISODate, number> = {};
  for (const [d, v] of Object.entries(expected)) weights[d] = 0.2 + 0.8 * (v / avg);
  return { weights, reasons };
}

/** Needs you keep buying even on a lean day. Dining out, coffee, shopping and fun are left out. */
const LEAN_NEEDS = new Set(["Groceries", "Transport", "Car", "Health", "Home", "Personal care", "Fitness", "Services"]);
const WD = ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"];

/**
 * Lean days: what each day ahead needs, and nothing else. Routine trips (groceries every ~6 days)
 * land on the day they're due; everyday needs (transit on workdays) follow the weekday they happen.
 */
export function leanDays(s: Snapshot, today: ISODate, until: ISODate): Record<ISODate, { cents: Cents; reasons: string[] }> {
  const from = addDays(today, -84);
  const needs = s.transactions.filter(
    (t) => t.status === "posted" && t.direction === "out" && t.date >= from && t.date < today && !t.calendarEventId && t.flexible !== false && !isNotSpending(t.category) && LEAN_NEEDS.has(t.category ?? ""),
  );
  const trips = dueTrips(s, today, until).filter((t) => LEAN_NEEDS.has(t.category));
  const tripCats = new Set(trips.map((t) => t.category));
  // Everyday needs by weekday, habits only: a category counts on a weekday when it happened on that
  // weekday in at least 4 of the last 12 weeks. Its amount is your typical (median) day for it,
  // scaled by how often it happens.
  const days: Record<string, Map<ISODate, number>> = {};
  for (const t of needs) {
    if (tripCats.has(t.category ?? "")) continue;
    const k = `${t.category}|${dayOfWeek(t.date)}`;
    const m = (days[k] ??= new Map());
    m.set(t.date, (m.get(t.date) ?? 0) + t.amountCents);
  }
  const weeks = 12;
  const habits: Array<{ cat: string; wd: number; cents: number; seen: number }> = [];
  for (const [k, m] of Object.entries(days)) {
    const seen = m.size;
    if (seen < 4) continue;
    const [cat, wd] = k.split("|");
    const cents = median([...m.values()]) * Math.min(1, seen / weeks);
    if (cents >= 100) habits.push({ cat: cat!, wd: Number(wd), cents, seen });
  }
  const usd = (c: number) => "$" + Math.round(c / 100);
  const out: Record<ISODate, { cents: Cents; reasons: string[] }> = {};
  for (const d of eachDay(today, until)) {
    const w = dayOfWeek(d);
    let cents = 0;
    const reasons: string[] = [];
    for (const h of habits.filter((x) => x.wd === w)) {
      cents += h.cents;
      reasons.push(`${h.cat} ${usd(h.cents)} · ${h.seen} of the last ${weeks} ${WD[w]}`);
    }
    for (const t of trips.filter((x) => x.date === d)) {
      cents += t.cents;
      reasons.push(`${t.category} ${usd(t.cents)} · due, usually every ${t.everyDays} days`);
    }
    out[d] = { cents: Math.round(cents / 100) * 100, reasons: reasons.length ? ["Lean: needs only", ...reasons] : ["Lean: needs only. Nothing routine today"] };
  }
  return out;
}
