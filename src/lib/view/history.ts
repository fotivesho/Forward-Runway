import { addDays, addMonths, daysInMonth, diffDays, parts, startOfMonth, type ISODate } from "@/lib/dates";
import { ruleOccurrences, type OccurrenceOverride, type OneTimeTransaction, type Occurrence, type RecurringRule } from "@/lib/engine";
import { cleanName } from "./recurring";

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

export interface HistoryView {
  bars: HistBar[];
  unit: "charge" | "month";
  /** How many times it showed up (charges) and the usual amount. */
  count: number;
  usualCents: number;
  /** Charges: typical gap in days, when it's regular. */
  everyDays?: number;
  /** Months: usual spend a month. */
  perMonthCents?: number;
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

/** Two transactions are "the same thing" when their cleaned names match (or, with no usable name, the exact text). */
export function sameThing(a: string, b: string): boolean {
  const ka = cleanName(a);
  const kb = cleanName(b);
  return ka && kb ? ka === kb : a.trim().toLowerCase() === b.trim().toLowerCase();
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

  if (recent.length >= 6) {
    const thisMonth = startOfMonth(today);
    const bars: HistBar[] = [];
    for (let i = 5; i >= 1; i--) {
      const from = addMonths(thisMonth, -i);
      const to = addMonths(thisMonth, -i + 1);
      const cents = same.filter((t) => t.date >= from && t.date < to).reduce((s, t) => s + t.amountCents, 0);
      bars.push({ key: from, label: MONTHS[parts(from).m - 1]!, title: MONTHS_LONG[parts(from).m - 1]!, cents, kind: "past" });
    }
    // Drop empty months before it started.
    while (bars.length && bars[0]!.cents === 0) bars.shift();
    const perDay = recent.reduce((s, t) => s + t.amountCents, 0) / 90;
    const { y, m, d } = parts(today);
    const left = daysInMonth(y, m) - d;
    const done = same.filter((t) => t.date >= thisMonth).reduce((s, t) => s + t.amountCents, 0);
    const now = done + Math.round(perDay * left);
    bars.push({ key: thisMonth, label: MONTHS[m - 1]!, title: `${MONTHS_LONG[m - 1]}`, cents: now, doneCents: done, kind: "now" });
    const next = addMonths(thisMonth, 1);
    const perMonthCents = Math.round(perDay * 30);
    bars.push({ key: next, label: MONTHS[parts(next).m - 1]!, title: MONTHS_LONG[parts(next).m - 1]!, cents: perMonthCents, kind: "ahead" });
    return { bars, unit: "month", count: recent.length, usualCents, perMonthCents };
  }

  const last = same.slice(-6);
  const bars: HistBar[] = last.map((t) => ({ key: t.id, label: short(t.date), title: short(t.date), cents: t.amountCents, kind: "past" }));
  const gaps = same.slice(1).map((t, i) => diffDays(same[i]!.date, t.date)).filter((g) => g > 0);
  const gap = median(gaps);
  const regular = same.length >= 3 && gap >= 5 && gaps.every((g) => Math.abs(g - gap) <= Math.max(3, gap * 0.35));
  if (regular) {
    let d = same[same.length - 1]!.date;
    for (let i = 0; i < 2; i++) {
      d = addDays(d, gap);
      while (d <= today) d = addDays(d, gap);
      bars.push({ key: `ahead-${d}`, label: short(d), title: `${short(d)}, expected`, cents: usualCents, kind: "ahead" });
    }
  }
  return { bars: compact(bars), unit: "charge", count: same.length, usualCents, everyDays: regular ? gap : undefined };
}

/** Under the bars, a month name only where the month changes: "Sep 7, 21, Oct 5, 19". */
function compact(bars: HistBar[]): HistBar[] {
  let prev = "";
  return bars.map((b) => {
    const [mon, day] = b.label.split(" ");
    if (!day) return b;
    const label = mon === prev ? day : b.label;
    prev = mon!;
    return { ...b, label };
  });
}

const LOOKBACK: Record<string, number> = { weekly: 42, biweekly: 84, semimonthly: 90, monthly: 180 };

/**
 * A repeating item: its last few dates (the real charge when we can find it, else the scheduled
 * amount) and the next few ahead, each one a bar you can tap to skip or change.
 */
export function ruleHistory(rule: RecurringRule, txns: OneTimeTransaction[], overrides: OccurrenceOverride[], today: ISODate, ahead: Occurrence[]): HistoryView {
  const look = LOOKBACK[rule.schedule.frequency] ?? 400;
  const from = rule.schedule.startDate > addDays(today, -look) ? rule.schedule.startDate : addDays(today, -look);
  const pastOcc = from < today ? ruleOccurrences(rule, overrides, from, addDays(today, -1)).slice(-6) : [];
  const dir = rule.kind === "income" ? "in" : "out";
  const bars: HistBar[] = pastOcc.map((o) => {
    // The real charge, if it's in your history.
    const hit = txns.find((t) => t.direction === dir && Math.abs(diffDays(o.date, t.date)) <= 4 && sameThing(t.description, rule.name));
    return { key: `p-${o.originalDate}`, label: short(o.date), title: short(o.date), cents: hit?.amountCents ?? o.amountCents, kind: "past" as const };
  });
  for (const o of ahead.filter((x) => x.date >= today).slice(0, 4)) {
    bars.push({ key: `a-${o.originalDate}`, label: short(o.date), title: short(o.date), cents: o.amountCents, kind: "ahead", occurrence: o });
  }
  const amounts = bars.map((b) => b.cents);
  return { bars: compact(bars), unit: "charge", count: pastOcc.length, usualCents: median(amounts) };
}
