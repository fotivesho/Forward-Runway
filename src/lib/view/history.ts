import { addDays, addMonths, daysInMonth, diffDays, parts, startOfMonth, type ISODate } from "@/lib/dates";
import { ruleOccurrences, type OccurrenceOverride, type OneTimeTransaction, type Occurrence, type RecurringRule } from "@/lib/engine";
import { cleanName } from "./recurring";
import { looksLike } from "@/lib/data/match";

/** One bar: what happened (past), this month so far plus the rest (now), or what's expected (ahead). */
export interface HistBar {
  key: string;
  /** Short label under the bar ("Nov 30", "Nov"). */
  label: string;
  /** Longer label for the readout ("Nov 30", "November so far"). */
  title: string;
  cents: number;
  kind: "past" | "now" | "ahead";
  /** For "now": the part already spent. */
  doneCents?: number;
  /** For a repeating item's future date: which occurrence it is. */
  occurrence?: Occurrence;
}

export interface HistItem { id: string; date: ISODate; cents: number; accountId: string; description: string }

export interface HistoryView {
  /** Every matching transaction, oldest first. */
  items?: HistItem[];
  bars: HistBar[];
  unit: "charge" | "month";
  /** How many times it showed up (charges) and the usual amount. */
  count: number;
  usualCents: number;
  /** Charges: typical gap in days, when it's regular. */
  everyDays?: number;
  /** Months: usual spend a month. */
  perMonthCents?: number;
  /** In plain words: "Weekly", "Twice a week", "Monthly". */
  often?: string;
  /** Charges: when the next one is likely. */
  nextDate?: ISODate;
  /** Total of every time it showed up. */
  totalCents: number;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const short = (d: ISODate) => `${MONTHS[parts(d).m - 1]} ${parts(d).d}`;
const median = (xs: number[]) => {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : Math.round((s[m - 1]! + s[m]!) / 2);
};

/** A gap in days, the way a person would say it. */
export function howOften(days: number): string {
  if (days <= 1.5) return "Daily";
  if (days <= 2.6) return "Every other day";
  if (days <= 4.5) return "Twice a week";
  if (days <= 8.5) return days >= 6 ? "Weekly" : `Every ~${Math.round(days)} days`;
  if (days >= 12 && days <= 17) return "Every 2 weeks";
  if (days >= 26 && days <= 35) return "Monthly";
  if (days >= 80 && days <= 100) return "Every 3 months";
  if (days >= 340 && days <= 390) return "Yearly";
  return `Every ~${Math.round(days)} days`;
}

/** Two transactions are "the same thing" when their cleaned names match (or, with no usable name, the exact text). */
export function sameThing(a: string, b: string): boolean {
  const ka = cleanName(a);
  const kb = cleanName(b);
  return ka && kb ? ka === kb : a.trim().toLowerCase() === b.trim().toLowerCase();
}

const item = (t: OneTimeTransaction): HistItem => ({ id: t.id, date: t.date, cents: t.amountCents, accountId: t.accountId, description: t.description });

export type StatPeriod = "all" | "90d" | "year" | "lastYear";
export const PERIOD_LABEL: Record<StatPeriod, string> = { all: "All time", "90d": "Last 90 days", year: "This year", lastYear: "Last year" };

export function inPeriod(date: ISODate, period: StatPeriod, today: ISODate): boolean {
  const y = parts(today).y;
  if (period === "90d") return date > addDays(today, -90);
  if (period === "year") return date >= `${y}-01-01`;
  if (period === "lastYear") return date >= `${y - 1}-01-01` && date < `${y}-01-01`;
  return true;
}

const ORD = (d: number) => `${d}${d % 10 === 1 && d !== 11 ? "st" : d % 10 === 2 && d !== 12 ? "nd" : d % 10 === 3 && d !== 13 ? "rd" : "th"}`;
const WEEKDAYS = ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"];

/** Over a chosen period: the average, the total, which way it's heading, and one or two plain-words findings. */
export function itemStats(items: HistItem[], period: StatPeriod, today: ISODate) {
  const list = items.filter((i) => inPeriod(i.date, period, today));
  const count = list.length;
  const totalCents = list.reduce((s, i) => s + i.cents, 0);
  const avgCents = count ? Math.round(totalCents / count) : 0;
  // Trend: the last three times against the ones before.
  let trendPct: number | null = null;
  if (list.length >= 5) {
    const recent = list.slice(-3);
    const before = list.slice(0, -3);
    const a = recent.reduce((s, i) => s + i.cents, 0) / recent.length;
    const b = before.reduce((s, i) => s + i.cents, 0) / before.length;
    if (b > 0) trendPct = Math.round(((a - b) / b) * 100);
  }
  const findings: string[] = [];
  if (count >= 3) {
    // When it tends to land: a day of the month for monthly things, a weekday for frequent ones.
    const span = diffDays(list[0]!.date, list[list.length - 1]!.date) || 1;
    if (count / (span / 30.4) <= 1.5) {
      const days = list.map((i) => parts(i.date).d).sort((x, y) => x - y);
      const mid = days[Math.floor(days.length / 2)]!;
      if (days.filter((d) => Math.abs(d - mid) <= 4).length >= Math.ceil(count * 0.6)) findings.push(`Usually around the ${ORD(mid)} of the month.`);
    } else {
      const byDay = [0, 0, 0, 0, 0, 0, 0];
      for (const i of list) byDay[new Date(`${i.date}T12:00:00Z`).getUTCDay()]! += 1;
      const top = byDay.indexOf(Math.max(...byDay));
      if (byDay[top]! / count >= 0.3) findings.push(`Most often on ${WEEKDAYS[top]}.`);
    }
  }
  if (trendPct != null && Math.abs(trendPct) >= 10) findings.push(`${trendPct > 0 ? "Up" : "Down"} ${Math.abs(trendPct)}% over the last 3 times.`);
  else if (trendPct != null) findings.push("Steady lately.");
  const biggest = list.reduce<HistItem | null>((m, i) => (!m || i.cents > m.cents ? i : m), null);
  return { count, totalCents, avgCents, trendPct, findings: findings.slice(0, 2), biggest };
}

/**
 * Everything with this transaction's name: frequent things (lunch, coffee) by month, with this
 * month's rest and next month predicted; occasional ones charge by charge, with the next ones
 * projected when they come regularly.
 */
export function txnHistory(txn: OneTimeTransaction, txns: OneTimeTransaction[], today: ISODate): HistoryView | null {
  const same = txns
    .filter((t) => t.direction === txn.direction && t.date <= today && t.status === "posted" && sameThing(t.description, txn.description))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  if (same.length < 2) return null;
  const usualCents = median(same.map((t) => t.amountCents));
  const recent = same.filter((t) => t.date > addDays(today, -90));

  // How regular is it? Bills and subscriptions (about once a period, steady) show each charge;
  // anything else (several a month, or on and off) shows months added up.
  const gaps = same.slice(1).map((t, i) => diffDays(same[i]!.date, t.date)).filter((g) => g > 0);
  const gap = median(gaps);
  // Two on the same day (a bet, then another) isn't a steady bill.
  const sameDay = gaps.length < same.length - 1;
  const steady = !sameDay && same.length >= 3 && gap >= 5 && gaps.every((g) => Math.abs(g - gap) <= Math.max(3, gap * 0.35));
  // Bills that come about once a month but on a wandering day (utilities, a parking app) count as monthly too.
  const span = diffDays(same[0]!.date, same[same.length - 1]!.date);
  const perMonth = span > 0 ? (same.length - 1) / (span / 30.4) : 0;
  const roughlyMonthly = !steady && !sameDay && same.length >= 3 && span >= 55 && perMonth >= 0.75 && perMonth <= 1.4;
  const regular = steady || roughlyMonthly;
  const twoInAMonth = same.some((t, i) => i > 0 && t.date.slice(0, 7) === same[i - 1]!.date.slice(0, 7));

  if (recent.length >= 6 || !regular || (twoInAMonth && !steady)) {
    const frequent = recent.length >= 6;
    const thisMonth = startOfMonth(today);
    const bars: HistBar[] = [];
    for (let i = 5; i >= 1; i--) {
      const from = addMonths(thisMonth, -i);
      const to = addMonths(thisMonth, -i + 1);
      const cents = same.filter((t) => t.date >= from && t.date < to).reduce((s, t) => s + t.amountCents, 0);
      bars.push({ key: from, label: MONTHS[parts(from).m - 1]!, title: MONTHS_LONG[parts(from).m - 1]!, cents, kind: "past" });
    }
    // Drop empty months before it started, and the month it started in if that was partway through.
    while (bars.length && (bars[0]!.cents === 0 || (frequent && (bars[0]!.key < startOfMonth(addDays(same[0]!.date, -3)) || (bars[0]!.key === startOfMonth(same[0]!.date) && parts(same[0]!.date).d > 7))))) bars.shift();
    // What it usually comes to a day: the last 90 days when it's frequent, else since it started.
    const since = Math.max(30, diffDays(same[0]!.date, today));
    const perDay = frequent ? recent.reduce((s, t) => s + t.amountCents, 0) / 90 : same.reduce((s, t) => s + t.amountCents, 0) / since;
    const { y, m, d } = parts(today);
    const left = daysInMonth(y, m) - d;
    const done = same.filter((t) => t.date >= thisMonth).reduce((s, t) => s + t.amountCents, 0);
    const now = done + Math.round(perDay * left);
    bars.push({ key: thisMonth, label: MONTHS[m - 1]!, title: `${MONTHS_LONG[m - 1]}`, cents: now, doneCents: done, kind: "now" });
    const next = addMonths(thisMonth, 1);
    const perMonthCents = Math.round(perDay * 30);
    bars.push({ key: next, label: MONTHS[parts(next).m - 1]!, title: MONTHS_LONG[parts(next).m - 1]!, cents: perMonthCents, kind: "ahead" });
    return { items: same.map(item), bars, unit: "month", count: frequent ? recent.length : same.length, usualCents, perMonthCents, often: frequent ? howOften(90 / recent.length) : undefined, totalCents: same.reduce((s, t) => s + t.amountCents, 0) };
  }


  const last = same.slice(-6);
  const bars: HistBar[] = last.map((t) => ({ key: t.id, label: short(t.date), title: short(t.date), cents: t.amountCents, kind: "past" }));
  const every = roughlyMonthly ? 30 : gap;
  if (regular) {
    let d = same[same.length - 1]!.date;
    // Monthly things land on the same day of the month, not every 30 or 31 days.
    const step = (x: ISODate) => (every >= 26 && every <= 35 ? addMonths(x, 1) : addDays(x, every));
    for (let i = 0; i < 2; i++) {
      d = step(d);
      while (d <= today) d = step(d);
      bars.push({ key: `ahead-${d}`, label: short(d), title: `${short(d)}, expected`, cents: usualCents, kind: "ahead" });
    }
  }
  return {
    items: same.map(item),
    bars: compact(bars),
    unit: "charge",
    count: same.length,
    usualCents,
    everyDays: regular ? every : undefined,
    often: regular ? (roughlyMonthly ? "About monthly" : howOften(gap)) : undefined,
    nextDate: regular ? bars.find((b) => b.kind === "ahead")?.key.slice(6) : undefined,
    totalCents: same.reduce((s, t) => s + t.amountCents, 0),
  };
}

/** Under the bars: "9/7", "9/21", "10/5": the month is always there, and short. */
function compact(bars: HistBar[]): HistBar[] {
  return bars.map((b) => {
    const [mon, day] = b.label.split(" ");
    if (!day) return b;
    return { ...b, label: `${MONTHS.indexOf(mon!) + 1}/${day}` };
  });
}

const LOOKBACK: Record<string, number> = { weekly: 42, biweekly: 84, semimonthly: 90, monthly: 180 };

/**
 * A repeating item: its last few dates (the real charge when we can find it, else the scheduled
 * amount) and the next few ahead, each one a bar you can tap to skip or change.
 */
export function ruleHistory(rule: RecurringRule, txns: OneTimeTransaction[], overrides: OccurrenceOverride[], today: ISODate, ahead: Occurrence[]): HistoryView {
  const look = LOOKBACK[rule.schedule.frequency] ?? 400;
  // The real charges first, from before you even set it up, whatever they came to.
  const real = txns
    .filter((t) => t.date <= today && t.date > addDays(today, -look) && looksLike(rule, t))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .slice(-6);
  let bars: HistBar[];
  let count: number;
  if (real.length > 0) {
    bars = real.map((t) => ({ key: `p-${t.id}`, label: short(t.date), title: short(t.date), cents: t.amountCents, kind: "past" as const }));
    count = real.length;
  } else {
    // Nothing found yet: show the schedule's own past dates.
    const from = rule.schedule.startDate > addDays(today, -look) ? rule.schedule.startDate : addDays(today, -look);
    const pastOcc = from < today ? ruleOccurrences(rule, overrides, from, addDays(today, -1)).slice(-6) : [];
    bars = pastOcc.map((o) => ({ key: `p-${o.originalDate}`, label: short(o.date), title: short(o.date), cents: o.amountCents, kind: "past" as const }));
    count = pastOcc.length;
  }
  // Coming up: the dates not already paid (a charge that came early already counts above).
  for (const o of ahead.filter((x) => x.date >= today && !x.posted).slice(0, 4)) {
    bars.push({ key: `a-${o.originalDate}`, label: short(o.date), title: short(o.date), cents: o.amountCents, kind: "ahead", occurrence: o });
  }
  const amounts = bars.map((b) => b.cents);
  return { items: real.map(item), bars: compact(bars), unit: "charge", count, usualCents: median(amounts), totalCents: amounts.reduce((s, c) => s + c, 0) };
}
