/**
 * Finding what repeats in your history (paychecks, rent, subscriptions) so you can add it in one tap.
 * Pure and deterministic: groups transactions by a cleaned-up name, then looks for a steady rhythm.
 */
import { addDays, addMonths, diffDays, parts, type ISODate } from "../dates";
import type { Cents } from "../money";
import type { Frequency, OneTimeTransaction, RecurringRule } from "../engine";
import { isNotSpending, notSpendingTxn } from "../categories";

export interface RecurringSuggestion {
  /** Stable id for dismissing it. */
  key: string;
  name: string;
  kind: RecurringRule["kind"];
  amountCents: Cents;
  /** Amounts vary (like utilities): added as an estimate. */
  varies: boolean;
  accountId: string;
  category: string | null;
  frequency: Frequency;
  dayOfMonth?: number;
  secondDayOfMonth?: number;
  nextDate: ISODate;
  seen: number;
  lastDate: ISODate;
  /** The charges it was found from, newest last (to check it really repeats). */
  charges: Array<{ id: string; date: ISODate; cents: Cents; description: string }>;
}

/** "AMAZON PRIME*2K4 Seattle WA 03/12" and "Amazon Prime 2K8" → "amazon prime". */
export function cleanName(s: string): string {
  return s
    .toLowerCase()
    .replace(/[*#].*$/, " ")
    .replace(/\b\d[\d/.-]*\b/g, " ")
    .replace(/[^a-z& ]+/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !["inc", "llc", "com", "www", "the", "pos", "ach", "debit", "credit", "purchase", "payment", "online"].includes(w))
    .slice(0, 3)
    .join(" ")
    .trim();
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : Math.round((s[m - 1]! + s[m]!) / 2);
};

function rhythm(dates: ISODate[]): { frequency: Frequency; days: number; dayOfMonth?: number; secondDayOfMonth?: number } | null {
  const gaps = dates.slice(1).map((d, i) => diffDays(dates[i]!, d));
  if (gaps.length === 0) return null;
  const g = median(gaps);
  const steady = (target: number, tol: number) => gaps.filter((x) => Math.abs(x - target) <= tol).length >= Math.ceil(gaps.length * 0.7);
  if (g >= 6 && g <= 8 && steady(7, 1)) return { frequency: "weekly", days: 7 };
  if (g >= 13 && g <= 17) {
    // Twice a month on set days (1st & 15th) vs every two weeks.
    // Split the days of the month into two groups at the widest gap (e.g. 1st vs 15th, or 15th vs month end).
    const doms = dates.map((d) => parts(d).d);
    const uniq = [...new Set(doms)].sort((a, b) => a - b);
    let cut = 0;
    let widest = -1;
    for (let i = 1; i < uniq.length; i++) {
      const gap = uniq[i]! - uniq[i - 1]!;
      if (gap > widest) {
        widest = gap;
        cut = i - 1;
      }
    }
    const split = uniq.length > 1 ? uniq[cut]! : 0;
    const early = doms.filter((d) => d <= split);
    const late = doms.filter((d) => d > split);
    const spread = (xs: number[]) => (xs.length ? Math.max(...xs) - Math.min(...xs) : 0);
    if (early.length && late.length && spread(early) <= 3 && spread(late) <= 4 && !steady(14, 0)) {
      return { frequency: "semimonthly", days: 15, dayOfMonth: median(early), secondDayOfMonth: median(late) >= 28 ? -1 : median(late) };
    }
    if (steady(14, 1)) return { frequency: "biweekly", days: 14 };
    return null;
  }
  if (g >= 27 && g <= 33 && steady(30, 4)) return { frequency: "monthly", days: 30, dayOfMonth: median(dates.map((d) => parts(d).d)) };
  return null;
}

export function findRecurring(
  transactions: OneTimeTransaction[],
  rules: RecurringRule[],
  today: ISODate,
  dismissed: Set<string> = new Set(),
): RecurringSuggestion[] {
  const from = addDays(today, -200);
  const groups = new Map<string, OneTimeTransaction[]>();
  for (const t of transactions) {
    if (t.status !== "posted" || t.pending || t.date < from || t.date > today || notSpendingTxn(t)) continue;
    const name = cleanName(t.description);
    if (!name) continue;
    const key = `${t.direction}|${name}`;
    groups.set(key, [...(groups.get(key) ?? []), t]);
  }

  const known = rules.filter((r) => r.active !== false).map((r) => ({ name: cleanName(r.name), amount: r.amountCents, income: r.kind === "income" }));
  const out: RecurringSuggestion[] = [];
  for (const [key, list] of groups) {
    if (dismissed.has(key)) continue;
    const sorted = [...list].sort((a, b) => (a.date < b.date ? -1 : 1));
    // One charge per day at most (split payments on the same day count once).
    const byDay = new Map<ISODate, number>();
    for (const t of sorted) byDay.set(t.date, (byDay.get(t.date) ?? 0) + t.amountCents);
    const dates = [...byDay.keys()];
    const amounts = [...byDay.values()];
    const r = rhythm(dates);
    if (!r) continue;
    const minSeen = r.frequency === "monthly" ? 2 : 3;
    if (dates.length < minSeen) continue;
    const last = dates[dates.length - 1]!;
    if (diffDays(last, today) > r.days * 1.6) continue; // stopped
    const amount = median(amounts);
    const varies = Math.max(...amounts) > Math.min(...amounts) * 1.15;
    const income = list[0]!.direction === "in";
    // Already set up: a repeating item with a similar name, or the same direction and a close amount.
    const name = key.split("|")[1]!;
    if (known.some((k) => k.income === income && ((k.name && (k.name.includes(name) || name.includes(k.name))) || Math.abs(k.amount - amount) <= amount * 0.05))) continue;

    let next: ISODate;
    if (r.frequency === "monthly") next = addMonths(last, 1);
    else if (r.frequency === "semimonthly") {
      const d = parts(last).d;
      const second = r.secondDayOfMonth === -1 ? 28 : (r.secondDayOfMonth ?? 15);
      next = d < second ? `${last.slice(0, 8)}${String(Math.min(second, 28)).padStart(2, "0")}` : addMonths(`${last.slice(0, 8)}${String(r.dayOfMonth ?? 1).padStart(2, "0")}`, 1);
    } else next = addDays(last, r.days);
    while (next < today) next = r.frequency === "monthly" ? addMonths(next, 1) : addDays(next, r.days);

    const sample = list[list.length - 1]!;
    const category = sample.category ?? null;
    out.push({
      key,
      name: sample.description.slice(0, 80),
      kind: income ? "income" : category === "Subscriptions" || (amount < 5_000 && r.frequency === "monthly") ? "subscription" : "bill",
      amountCents: amount,
      varies,
      accountId: sample.accountId,
      category: income ? (category === "Income" ? "Salary" : category) : category,
      frequency: r.frequency,
      dayOfMonth: r.dayOfMonth,
      secondDayOfMonth: r.secondDayOfMonth,
      nextDate: next,
      seen: dates.length,
      lastDate: last,
      charges: sorted.slice(-8).map((t) => ({ id: t.id, date: t.date, cents: t.amountCents, description: t.description })),
    });
  }
  // Income first, then the biggest bills.
  return out.sort((a, b) => (a.kind === "income" ? -1 : 0) - (b.kind === "income" ? -1 : 0) || b.amountCents - a.amountCents);
}
