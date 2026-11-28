/**
 * Spending, sliced three ways and then some: by category, by weekday, by month, and by days since
 * payday. Each profile starts from the past and ends with what's likely ahead (and what a small
 * change would do), because the point is the next month, not the last one. Pure and deterministic.
 */
import { addDays, addMonths, dayOfWeek, diffDays, endOfMonth, startOfMonth, type ISODate } from "../dates";
import type { Cents } from "../money";
import { isNotSpending, notSpendingTxn } from "../categories";
import type { Snapshot } from "../data/snapshot";
import { mainIncome } from "./spend";
import { ruleOccurrences } from "../engine";

export interface Txn {
  d: ISODate;
  c: Cents;
  cat: string;
  desc: string;
}

export interface ExploreData {
  today: ISODate;
  /** Spending (money out, not transfers or card payments), last ~6 months. */
  txns: Txn[];
  /** Paydays from ~6 months back to ~2 months ahead. */
  paydays: ISODate[];
  /** First day with any data. */
  from: ISODate;
}

const DOW = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const DOW_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const pct = (xs: number[], p: number) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.round((s.length - 1) * p)))]!;
};
const round5 = (c: Cents) => Math.max(500, Math.round(c / 500) * 500);

export function exploreData(s: Snapshot, today: ISODate): ExploreData {
  const from = addDays(today, -183);
  const txns: Txn[] = s.transactions
    .filter((t) => t.status === "posted" && t.direction === "out" && t.date >= from && t.date < today && !notSpendingTxn(t))
    .map((t) => ({ d: t.date, c: t.amountCents, cat: t.category ?? "Other", desc: t.description }))
    .sort((a, b) => (a.d < b.d ? -1 : 1));
  const rule = mainIncome(s);
  const paydays = rule ? ruleOccurrences(rule, s.overrides, addDays(from, -20), addDays(today, 62)).map((o) => o.date) : [];
  return { today, txns, paydays, from: txns[0]?.d ?? today };
}

/** Days of history actually covered (at least 1). */
const span = (x: ExploreData) => Math.max(1, diffDays(x.from, addDays(x.today, -1)) + 1);
const weeksOf = (x: ExploreData) => span(x) / 7;

/** Every category, biggest first, with its weekly average. */
export function categoryList(x: ExploreData): Array<{ cat: string; perWeekCents: Cents; count: number }> {
  const by = new Map<string, { c: number; n: number }>();
  for (const t of x.txns) {
    const e = by.get(t.cat) ?? { c: 0, n: 0 };
    e.c += t.c;
    e.n += 1;
    by.set(t.cat, e);
  }
  const w = weeksOf(x);
  return [...by.entries()].map(([cat, e]) => ({ cat, perWeekCents: Math.round(e.c / w), count: e.n })).sort((a, b) => b.perWeekCents - a.perWeekCents);
}

function monthsBack(today: ISODate, n: number): ISODate[] {
  const m = startOfMonth(today);
  return Array.from({ length: n }, (_, i) => addMonths(m, i - n + 1));
}

export interface CategoryProfile {
  cat: string;
  count: number;
  perWeek: number;
  perWeekCents: Cents;
  avgCents: Cents;
  /** Typical range: the middle half of purchases. */
  lowCents: Cents;
  highCents: Cents;
  treatCents: Cents;
  months: Array<{ month: ISODate; cents: Cents; current: boolean }>;
  /** Change over the last three full months. */
  trendPct: number | null;
  weekday: Cents[];
  busiestDow: number | null;
  /** Share of this category spent in the 3 days after payday (vs 3/14 ≈ 21% if even). */
  paydayShare: number | null;
  /** Likely next 30 days at your usual pace. */
  next30Cents: Cents;
  /** What one fewer purchase a week would free up per month. */
  oneLessPerMonthCents: Cents;
  top: Array<{ desc: string; cents: Cents; n: number }>;
}

export function profileCategory(x: ExploreData, cat: string): CategoryProfile | null {
  const list = x.txns.filter((t) => t.cat === cat);
  if (!list.length) return null;
  const amounts = list.map((t) => t.c);
  const total = amounts.reduce((a, b) => a + b, 0);
  const w = weeksOf(x);
  const months = monthsBack(x.today, 6).map((m) => ({
    month: m,
    cents: list.filter((t) => t.d >= m && t.d <= endOfMonth(m)).reduce((a, t) => a + t.c, 0),
    current: m === startOfMonth(x.today),
  }));
  const full = months.filter((m) => !m.current).slice(-3);
  const trendPct = full.length === 3 && full[0]!.cents > 0 ? (full[2]!.cents - full[0]!.cents) / full[0]!.cents : null;
  const weekday = [0, 1, 2, 3, 4, 5, 6].map((d) => list.filter((t) => dayOfWeek(t.d) === d).reduce((a, t) => a + t.c, 0));
  const max = Math.max(...weekday);
  const inPaydayWindow = (d: ISODate) => x.paydays.some((p) => d >= p && diffDays(p, d) < 3);
  const paydayShare = x.paydays.length >= 3 ? list.filter((t) => inPaydayWindow(t.d)).reduce((a, t) => a + t.c, 0) / total : null;
  const tops = new Map<string, { c: number; n: number }>();
  for (const t of list) {
    const k = t.desc.trim() || cat;
    const e = tops.get(k) ?? { c: 0, n: 0 };
    e.c += t.c;
    e.n += 1;
    tops.set(k, e);
  }
  const avg = Math.round(total / list.length);
  const perWeek = list.length / w;
  return {
    cat,
    count: list.length,
    perWeek,
    perWeekCents: Math.round(total / w),
    avgCents: avg,
    lowCents: pct(amounts, 0.25),
    highCents: pct(amounts, 0.75),
    treatCents: pct(amounts, 0.92),
    months,
    trendPct,
    weekday,
    busiestDow: max > 0 ? weekday.indexOf(max) : null,
    paydayShare,
    next30Cents: Math.round((total / span(x)) * 30),
    oneLessPerMonthCents: perWeek >= 1 ? Math.round(avg * 4.3) : 0,
    top: [...tops.entries()].map(([desc, e]) => ({ desc, cents: e.c, n: e.n })).sort((a, b) => b.cents - a.cents).slice(0, 3),
  };
}

/** Suggested amounts for a new plan in this category: usual, a bigger one, a treat. */
export function suggestAmounts(p: CategoryProfile | null, cat: string): Array<{ label: string; cents: Cents }> {
  if (p && p.count >= 3) {
    const out = [
      { label: "Usual", cents: round5(p.avgCents) },
      { label: "Bigger", cents: round5(p.highCents * 1.25) },
      { label: "Treat", cents: round5(Math.max(p.treatCents, p.highCents * 1.8)) },
    ];
    return out.filter((o, i) => i === 0 || o.cents > out[i - 1]!.cents);
  }
  const DEFAULTS: Record<string, number[]> = {
    Dining: [40, 80, 150], Entertainment: [30, 80, 180], Travel: [250, 600, 1200], Celebrations: [50, 120, 300], Gifts: [30, 75, 150],
    Shopping: [50, 120, 300], "Personal care": [30, 60, 120], Health: [30, 80, 200], Home: [50, 150, 400], Car: [80, 250, 600], Other: [25, 75, 150],
  };
  const d = DEFAULTS[cat] ?? DEFAULTS.Other!;
  return [
    { label: "Small", cents: d[0]! * 100 },
    { label: "Medium", cents: d[1]! * 100 },
    { label: "Big", cents: d[2]! * 100 },
  ];
}

export interface WeekdayProfile {
  dow: number;
  name: string;
  avgCents: Cents;
  /** vs. an average day. */
  ratio: number;
  cats: Array<{ cat: string; cents: Cents; share: number }>;
  /** Likely spend over the next 4 of these days. */
  next4Cents: Cents;
}

export function weekdayTotals(x: ExploreData): Cents[] {
  const days = Array.from({ length: span(x) }, (_, i) => addDays(x.from, i));
  return [0, 1, 2, 3, 4, 5, 6].map((d) => {
    const ds = days.filter((day) => dayOfWeek(day) === d);
    const sum = x.txns.filter((t) => dayOfWeek(t.d) === d).reduce((a, t) => a + t.c, 0);
    return ds.length ? Math.round(sum / ds.length) : 0;
  });
}

export function profileWeekday(x: ExploreData, dow: number): WeekdayProfile {
  const per = weekdayTotals(x);
  const avgDay = per.reduce((a, b) => a + b, 0) / 7 || 1;
  const list = x.txns.filter((t) => dayOfWeek(t.d) === dow);
  const total = list.reduce((a, t) => a + t.c, 0) || 1;
  const by = new Map<string, number>();
  for (const t of list) by.set(t.cat, (by.get(t.cat) ?? 0) + t.c);
  return {
    dow,
    name: DOW[dow]!,
    avgCents: per[dow]!,
    ratio: per[dow]! / avgDay,
    cats: [...by.entries()].map(([cat, cents]) => ({ cat, cents, share: cents / total })).sort((a, b) => b.cents - a.cents).slice(0, 5),
    next4Cents: per[dow]! * 4,
  };
}

export interface MonthProfile {
  month: ISODate;
  totalCents: Cents;
  typicalCents: Cents;
  cats: Array<{ cat: string; cents: Cents; typicalCents: Cents }>;
  bigDays: Array<{ d: ISODate; cents: Cents; what: string }>;
}

export function monthTotals(x: ExploreData): Array<{ month: ISODate; cents: Cents; current: boolean }> {
  return monthsBack(x.today, 6).map((m) => ({
    month: m,
    cents: x.txns.filter((t) => t.d >= m && t.d <= endOfMonth(m)).reduce((a, t) => a + t.c, 0),
    current: m === startOfMonth(x.today),
  }));
}

export function profileMonth(x: ExploreData, month: ISODate): MonthProfile {
  const months = monthTotals(x).filter((m) => !m.current && m.cents > 0);
  const inMonth = (t: Txn, m: ISODate) => t.d >= m && t.d <= endOfMonth(m);
  const list = x.txns.filter((t) => inMonth(t, month));
  const by = new Map<string, number>();
  for (const t of list) by.set(t.cat, (by.get(t.cat) ?? 0) + t.c);
  const typicalFor = (cat: string) =>
    months.length ? Math.round(months.reduce((a, m) => a + x.txns.filter((t) => t.cat === cat && inMonth(t, m.month)).reduce((s, t) => s + t.c, 0), 0) / months.length) : 0;
  const days = new Map<string, { c: number; what: Map<string, number> }>();
  for (const t of list) {
    const e = days.get(t.d) ?? { c: 0, what: new Map() };
    e.c += t.c;
    e.what.set(t.cat, (e.what.get(t.cat) ?? 0) + t.c);
    days.set(t.d, e);
  }
  return {
    month,
    totalCents: list.reduce((a, t) => a + t.c, 0),
    typicalCents: months.length ? Math.round(months.reduce((a, m) => a + m.cents, 0) / months.length) : 0,
    cats: [...by.entries()].map(([cat, cents]) => ({ cat, cents, typicalCents: typicalFor(cat) })).sort((a, b) => b.cents - a.cents).slice(0, 6),
    bigDays: [...days.entries()]
      .map(([d, e]) => ({ d, cents: e.c, what: [...e.what.entries()].sort((a, b) => b[1] - a[1])[0]![0] }))
      .sort((a, b) => b.cents - a.cents)
      .slice(0, 3),
  };
}

export interface PaydayCurve {
  /** Average spend on day 0 (payday), 1, 2, … of a pay period. */
  byDay: Cents[];
  /** Share of a pay period's spending in its first 3 days. */
  firstThreeShare: number;
  /** Categories that lean hardest toward right after payday. */
  skew: Array<{ cat: string; share: number }>;
  /** Next payday, and what the 3 days after it usually cost. */
  next: { date: ISODate; cents: Cents } | null;
}

export function paydayCurve(x: ExploreData): PaydayCurve | null {
  const past = x.paydays.filter((p) => p >= x.from && p < x.today);
  if (past.length < 2) return null;
  const len = Math.max(7, Math.min(16, Math.round(diffDays(past[0]!, past[past.length - 1]!) / Math.max(1, past.length - 1))));
  const sums = Array(len).fill(0) as number[];
  const counts = Array(len).fill(0) as number[];
  for (let i = 0; i < past.length; i++) {
    const start = past[i]!;
    const end = x.paydays.find((p) => p > start) ?? addDays(start, len);
    for (let k = 0; k < len; k++) {
      const d = addDays(start, k);
      if (d >= end || d >= x.today) break;
      counts[k]! += 1;
      sums[k]! += x.txns.filter((t) => t.d === d).reduce((a, t) => a + t.c, 0);
    }
  }
  const byDay = sums.map((s, k) => (counts[k] ? Math.round(s / counts[k]!) : 0));
  const total = byDay.reduce((a, b) => a + b, 0) || 1;
  const inWindow = (d: ISODate) => past.some((p) => d >= p && diffDays(p, d) < 3);
  const cats = new Map<string, { w: number; all: number }>();
  for (const t of x.txns) {
    const e = cats.get(t.cat) ?? { w: 0, all: 0 };
    e.all += t.c;
    if (inWindow(t.d)) e.w += t.c;
    cats.set(t.cat, e);
  }
  const nextDate = x.paydays.find((p) => p >= x.today) ?? null;
  return {
    byDay,
    firstThreeShare: (byDay[0]! + byDay[1]! + byDay[2]!) / total,
    skew: [...cats.entries()].filter(([, e]) => e.all > 5_000).map(([cat, e]) => ({ cat, share: e.w / e.all })).sort((a, b) => b.share - a.share).slice(0, 3),
    next: nextDate ? { date: nextDate, cents: byDay[0]! + byDay[1]! + byDay[2]! } : null,
  };
}
