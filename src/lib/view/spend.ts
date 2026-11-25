/**
 * Spend insights: a category's spending over time, and money in vs out by month or pay period.
 * Card purchases count once, when you buy; card payments and one-time transfers between your
 * own accounts are never counted (that would count the same money twice).
 */
import { addDays, addMonths, endOfMonth, formatShort, parts, startOfMonth, type ISODate } from "../dates";
import type { Cents } from "../money";
import { ruleOccurrences, type RecurringRule } from "../engine";
import type { Snapshot } from "../data/snapshot";
import { monthlyEquivalent } from "./dashboard";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthLabel = (d: ISODate, today: ISODate) => (parts(d).y === parts(today).y ? MONTHS[parts(d).m - 1]! : `${MONTHS[parts(d).m - 1]} ’${String(parts(d).y).slice(2)}`);
const rangeLabel = (a: ISODate, b: ISODate) => (a.slice(0, 7) === b.slice(0, 7) ? `${formatShort(a)}–${Number(b.slice(8))}` : `${formatShort(a)}–${formatShort(b)}`);

export interface Bucket {
  label: string;
  start: ISODate;
  end: ISODate;
  /** Contains today: the rest of it is still to come. */
  current: boolean;
}

export function monthBuckets(today: ISODate, count = 6): Bucket[] {
  const out: Bucket[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const start = startOfMonth(addMonths(startOfMonth(today), -i));
    const end = endOfMonth(start);
    out.push({ label: monthLabel(start, today), start, end, current: today >= start && today <= end });
  }
  return out;
}

export function weekBuckets(today: ISODate, count = 12): Bucket[] {
  // Weeks end today, so the last bar is the last seven days.
  const out: Bucket[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const end = addDays(today, -7 * i);
    const start = addDays(end, -6);
    out.push({ label: formatShort(start), start, end, current: i === 0 });
  }
  return out;
}

/** The main paycheck: the active income with the most money per month. */
export function mainIncome(s: Snapshot): RecurringRule | null {
  const income = s.rules.filter((r) => r.kind === "income" && r.active !== false && r.schedule.frequency !== "once");
  return income.sort((a, b) => monthlyEquivalent(b) - monthlyEquivalent(a))[0] ?? null;
}

/** Pay periods (payday to the day before the next payday), the last `count` that have started. */
export function payPeriodBuckets(s: Snapshot, today: ISODate, count = 6): Bucket[] | null {
  const rule = mainIncome(s);
  if (!rule) return null;
  const days = ruleOccurrences(rule, s.overrides, addDays(today, -40 * count), addDays(today, 45)).map((o) => o.date);
  const out: Bucket[] = [];
  for (let i = 0; i + 1 < days.length; i++) {
    const start = days[i]!;
    const end = addDays(days[i + 1]!, -1);
    if (start > today) break;
    out.push({ label: rangeLabel(start, end), start, end, current: today >= start && today <= end });
  }
  return out.length ? out.slice(-count) : null;
}

export interface FlowBucket extends Bucket {
  inCents: Cents;
  outCents: Cents;
  /** Part of `outCents` that went to savings: still yours, just set aside. */
  savingsCents: Cents;
}

/** Money in vs money out per bucket. Past: what happened. Current bucket: so far plus what's scheduled. */
export function cashFlow(s: Snapshot, today: ISODate, buckets: Bucket[]): FlowBucket[] {
  return buckets.map((b) => {
    let inC = 0;
    let outC = 0;
    let saved = 0;
    for (const r of s.rules) {
      if (r.active === false || r.kind === "card_payment" || r.kind === "transfer") continue;
      // A planned spending estimate (like weekly groceries) is replaced by what you actually logged once it's past.
      const pastSkipsEstimate = r.kind === "expense";
      for (const o of ruleOccurrences(r, s.overrides, b.start, b.end)) {
        if (o.date < b.start || o.date > b.end) continue;
        if (pastSkipsEstimate && o.date < today) continue;
        if (r.kind === "income") inC += o.amountCents;
        else {
          outC += o.amountCents;
          if (r.kind === "savings_transfer") saved += o.amountCents;
        }
      }
    }
    for (const t of s.transactions) {
      if (t.date < b.start || t.date > b.end) continue;
      if (t.status === "planned" && t.date < today) continue;
      if (t.status !== "planned" && t.date > today) continue;
      if (t.direction === "in") inC += t.amountCents;
      else outC += t.amountCents;
    }
    return { ...b, inCents: inC, outCents: outC, savingsCents: saved };
  });
}

export interface CategoryBucket extends Bucket {
  cents: Cents;
}

/** How much went to one category in each bucket (logged spending only). */
export function categoryHistory(s: Snapshot, category: string, buckets: Bucket[], today: ISODate): CategoryBucket[] {
  return buckets.map((b) => ({
    ...b,
    cents: s.transactions
      .filter((t) => t.direction === "out" && t.status === "posted" && (t.category ?? "Other") === category && t.date >= b.start && t.date <= b.end && t.date <= today)
      .reduce((sum, t) => sum + t.amountCents, 0),
  }));
}
