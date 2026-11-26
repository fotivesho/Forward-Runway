/**
 * Patterns and predictions. Pure and deterministic.
 *
 * Your money has two sides:
 *  - organized life: paychecks, bills and the plans on your calendar (the forecast already knows these);
 *  - everyday life: groceries, coffee, a Saturday dinner, the shopping after payday. Nobody puts that
 *    on a calendar, but it has a rhythm.
 *
 * This file learns that rhythm from your history (how much a day, which weekdays cost more, how much
 * more you spend right after payday, the big costs that come every few months) and uses it to
 * predict everyday life ahead, so budgets come from your real life, not a static last-month copy.
 */
import { addDays, addMonths, dayOfWeek, diffDays, eachDay, endOfMonth, formatShort, startOfMonth, type ISODate } from "../dates";
import type { Cents } from "../money";
import { ruleOccurrences, type OneTimeTransaction } from "../engine";
import { isNotSpending } from "../categories";
import type { Snapshot } from "../data/snapshot";
import { mainIncome } from "./spend";
import { cleanName } from "./recurring";
import { monthlyEquivalent } from "./dashboard";

const DOW = ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"];
/** Days counted as "right after payday": payday and the two days after it. */
const PAYDAY_WINDOW = 3;
const SCHEDULED_KINDS = new Set(["bill", "subscription", "loan_payment", "expense"]);

export interface LumpyCost {
  category: string;
  /** Typical amount each time. */
  avgCents: Cents;
  /** Typical days between them. */
  everyDays: number;
  lastDate: ISODate;
  /** When the next one is likely. */
  nextAround: ISODate;
  /** What to set aside each month so it never surprises you. */
  monthlyCents: Cents;
}

export interface SpendModel {
  from: ISODate;
  /** Days of history learned from. */
  days: number;
  /** Everyday spending per day on an average day. */
  perDayCents: Cents;
  byCategory: Array<{ category: string; perDayCents: Cents }>;
  /** Multiplier per weekday (0 = Sunday). 1 = an average day. */
  weekday: number[];
  /** Multiplier for payday and the two days after. 1 = no payday effect. */
  payday: number;
  paydays: ISODate[];
  lumpy: LumpyCost[];
  /** Categories left to the forecast (bills, repeating items) or to lumpy costs. */
  excluded: string[];
}

/** Spending that the forecast doesn't already know about: not bills, not plans, not transfers. */
function everyday(s: Snapshot, from: ISODate, to: ISODate): OneTimeTransaction[] {
  const scheduled = scheduledCategories(s);
  return s.transactions.filter(
    (t) =>
      t.status === "posted" &&
      t.direction === "out" &&
      t.date >= from &&
      t.date <= to &&
      !t.calendarEventId &&
      !isNotSpending(t.category) &&
      !scheduled.has(t.category ?? "Other"),
  );
}

function scheduledCategories(s: Snapshot): Set<string> {
  const out = new Set<string>();
  for (const r of s.rules) if (r.active !== false && SCHEDULED_KINDS.has(r.kind) && !r.toAccountId) out.add(r.kind === "loan_payment" ? "Debt" : (r.category ?? r.name));
  return out;
}

const shrink = (raw: number, n: number, k = 6) => Math.min(3, Math.max(0.3, (raw * n + k) / (n + k)));

function paydayList(s: Snapshot, from: ISODate, to: ISODate): ISODate[] {
  const rule = mainIncome(s);
  if (!rule) return [];
  return ruleOccurrences(rule, s.overrides, from, to).map((o) => o.date);
}

/** Learn your everyday rhythm from up to the last 90 days. Null with under three weeks of history. */
export function spendModel(s: Snapshot, today: ISODate, windowDays = 90): SpendModel | null {
  const end = addDays(today, -1);
  const earliest = everyday(s, addDays(today, -400), end).reduce<ISODate | null>((m, t) => (!m || t.date < m ? t.date : m), null);
  if (!earliest) return null;
  const from = earliest > addDays(end, -(windowDays - 1)) ? earliest : addDays(end, -(windowDays - 1));
  const days = diffDays(from, end) + 1;
  if (days < 21) return null;

  // Big, rare costs (car repairs, a vet bill): kept out of the daily rate, predicted on their own.
  const longFrom = addDays(today, -365);
  const byCatLong = new Map<string, OneTimeTransaction[]>();
  for (const t of everyday(s, longFrom, end)) {
    const c = t.category ?? "Other";
    byCatLong.set(c, [...(byCatLong.get(c) ?? []), t]);
  }
  const lumpy: LumpyCost[] = [];
  const rare = new Set<string>();
  for (const [category, list] of byCatLong) {
    const amounts = list.map((t) => t.amountCents).sort((a, b) => a - b);
    const median = amounts[Math.floor(amounts.length / 2)]!;
    if (list.length > 8 || median < 10_000) continue;
    rare.add(category);
    if (list.length < 2) continue;
    const dates = [...new Set(list.map((t) => t.date))].sort();
    const gaps = dates.slice(1).map((d, i) => diffDays(dates[i]!, d));
    const everyDays = Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length);
    if (everyDays < 40) continue; // roughly monthly: that's a repeating bill, not a surprise
    const avgCents = Math.round(amounts.reduce((a, b) => a + b, 0) / amounts.length);
    const lastDate = dates[dates.length - 1]!;
    let nextAround = addDays(lastDate, everyDays);
    if (nextAround < today) nextAround = addDays(today, 7);
    lumpy.push({ category, avgCents, everyDays, lastDate, nextAround, monthlyCents: Math.round((avgCents * 30.4) / everyDays) });
  }

  const txns = everyday(s, from, end).filter((t) => !rare.has(t.category ?? "Other"));
  const total = txns.reduce((a, t) => a + t.amountCents, 0);
  const daily = new Map<ISODate, Cents>();
  const cats = new Map<string, Cents>();
  for (const t of txns) {
    daily.set(t.date, (daily.get(t.date) ?? 0) + t.amountCents);
    const c = t.category ?? "Other";
    cats.set(c, (cats.get(c) ?? 0) + t.amountCents);
  }

  const paydays = paydayList(s, addDays(from, -20), addDays(today, 400));
  const inWindow = (d: ISODate) => paydays.some((p) => d >= p && diffDays(p, d) < PAYDAY_WINDOW);
  const all = eachDay(from, end);
  const normal = all.filter((d) => !inWindow(d));
  const mean = (ds: ISODate[]) => (ds.length ? ds.reduce((a, d) => a + (daily.get(d) ?? 0), 0) / ds.length : 0);
  const base = mean(normal) || total / days || 1;
  const weekday = [0, 1, 2, 3, 4, 5, 6].map((w) => {
    const ds = normal.filter((d) => dayOfWeek(d) === w);
    return shrink(mean(ds) / base, ds.length);
  });
  const pdDays = all.filter(inWindow);
  const payday = pdDays.length >= PAYDAY_WINDOW ? shrink(mean(pdDays) / base, pdDays.length) : 1;

  return {
    from,
    days,
    perDayCents: Math.round(total / days),
    byCategory: [...cats.entries()].map(([category, c]) => ({ category, perDayCents: c / days })).sort((a, b) => b.perDayCents - a.perDayCents),
    weekday,
    payday,
    paydays,
    lumpy: lumpy.sort((a, b) => (a.nextAround < b.nextAround ? -1 : 1)),
    excluded: [...new Set([...scheduledCategories(s), ...rare])],
  };
}

function weightOf(m: SpendModel, d: ISODate): number {
  return m.paydays.some((p) => d >= p && diffDays(p, d) < PAYDAY_WINDOW) ? m.payday : m.weekday[dayOfWeek(d)]!;
}

/** The average weight over the history, so predictions add up to the same total as the past. */
function norm(m: SpendModel): number {
  const ds = eachDay(m.from, addDays(m.from, m.days - 1));
  return ds.reduce((a, d) => a + weightOf(m, d), 0) / ds.length || 1;
}

export interface Prediction {
  totalCents: Cents;
  byCategory: Array<{ category: string; cents: Cents }>;
  byDay: Record<ISODate, Cents>;
  /** Big rare costs likely in this range. */
  lumpy: LumpyCost[];
}

/** Everyday spending you'll likely have from `start` to `end`, day by day and by category. */
export function predict(m: SpendModel, start: ISODate, end: ISODate): Prediction {
  const n = norm(m);
  const byDay: Record<ISODate, Cents> = {};
  let weights = 0;
  for (const d of eachDay(start, end)) {
    const w = weightOf(m, d) / n;
    weights += w;
    byDay[d] = Math.round(m.perDayCents * w);
  }
  const byCategory = m.byCategory.map((c) => ({ category: c.category, cents: Math.round(c.perDayCents * weights) })).filter((c) => c.cents >= 100);
  const lumpy = m.lumpy.filter((l) => l.nextAround >= start && l.nextAround <= end);
  return { totalCents: Object.values(byDay).reduce((a, b) => a + b, 0), byCategory, byDay, lumpy };
}

/** A typical amount for one day, with the reason it's higher or lower. */
export function typicalDay(m: SpendModel, d: ISODate): { cents: Cents; why: string | null } {
  const n = norm(m);
  const pd = m.paydays.some((p) => d >= p && diffDays(p, d) < PAYDAY_WINDOW);
  const w = weightOf(m, d);
  return {
    cents: Math.round((m.perDayCents * w) / n),
    why: pd && m.payday >= 1.25 ? "right after payday" : w >= 1.25 ? `${DOW[dayOfWeek(d)]} run high` : w <= 0.75 ? `${DOW[dayOfWeek(d)]} run quiet` : null,
  };
}

export interface Insight {
  id: string;
  icon: string;
  /** One short line. */
  title: string;
  /** The number that matters, shown big. */
  stat: string;
  /** The rest, behind ⓘ. */
  detail: string;
  tone: "good" | "warn" | "info";
}

const usd = (c: Cents) => `$${Math.round(c / 100).toLocaleString("en-US")}`;
const times = (x: number) => `${x.toFixed(1).replace(/\.0$/, "")}×`;

/** What your history says, most useful first. Short on purpose. */
export function insights(s: Snapshot, today: ISODate, m: SpendModel | null = spendModel(s, today)): Insight[] {
  const out: Array<Insight & { score: number }> = [];
  if (m) {
    // Payday effect.
    if (m.payday >= 1.3) {
      const pd = Math.round((m.perDayCents * m.payday * PAYDAY_WINDOW) / norm(m));
      const usual = Math.round((m.perDayCents * PAYDAY_WINDOW) / norm(m));
      out.push({
        id: "payday", icon: "💸", stat: times(m.payday), tone: "warn", score: m.payday * 2,
        title: "Payday splurge",
        detail: `In the 3 days after you get paid, you usually spend about ${usd(pd)}, compared with ${usd(usual)} over 3 normal days. It's very common. Planning one payday treat ahead of time keeps the rest of the pay period comfortable.`,
      });
    }
    // Busiest weekday.
    const top = m.weekday.indexOf(Math.max(...m.weekday));
    if (m.weekday[top]! >= 1.3) {
      const day = typicalDay(m, addDays(today, (top - dayOfWeek(today) + 7) % 7 || 7));
      out.push({
        id: "weekday", icon: "📆", stat: `~${usd(day.cents)}`, tone: "info", score: m.weekday[top]! * 1.5,
        title: `${DOW[top]} are your big day`,
        detail: `On ${DOW[top]} you usually spend ${times(m.weekday[top]!)} what you spend on an average day. That's fine: your budget and calendar already expect it, so it won't catch you off guard.`,
      });
    }
    // Big rare costs.
    for (const l of m.lumpy.slice(0, 2)) {
      const soon = diffDays(today, l.nextAround) <= 45;
      out.push({
        id: `lumpy-${l.category}`, icon: "🧰", stat: `~${usd(l.avgCents)}`, tone: soon ? "warn" : "info", score: soon ? 3 : 1.2,
        title: `${l.category} every ~${Math.round(l.everyDays / 30.4)} mo`,
        detail: `This cost shows up about every ${l.everyDays} days and is usually around ${usd(l.avgCents)}. The next one is likely around ${formatShort(l.nextAround)}. Setting aside ${usd(l.monthlyCents)} a month means it's already covered when it comes.`,
      });
    }
  }

  // Creeping categories: up over the last three full months (and not down last month).
  const months = [3, 2, 1].map((k) => startOfMonth(addMonths(startOfMonth(today), -k)));
  const sums = new Map<string, number[]>();
  for (const t of s.transactions) {
    if (t.status !== "posted" || t.direction !== "out" || isNotSpending(t.category)) continue;
    const i = months.findIndex((mm) => t.date >= mm && t.date <= endOfMonth(mm));
    if (i < 0) continue;
    const c = t.category ?? "Other";
    const arr = sums.get(c) ?? [0, 0, 0];
    arr[i]! += t.amountCents;
    sums.set(c, arr);
  }
  const creeping = [...sums.entries()]
    .filter(([, [a, b, c]]) => a! > 0 && b! >= a! * 0.9 && c! >= b! && c! >= a! * 1.2 && c! - a! >= 3_000)
    .map(([cat, [a, , c]]) => ({ cat, pct: (c! - a!) / a!, a: a!, c: c! }))
    .sort((x, y) => y.c - y.a - (x.c - x.a));
  for (const k of creeping.slice(0, 2)) {
    out.push({
      id: `creep-${k.cat}`, icon: "📈", stat: `+${Math.round(k.pct * 100)}%`, tone: "warn", score: 2 + k.pct,
      title: `${k.cat} is creeping up`,
      detail: `You spent ${usd(k.a)} on this three months ago and ${usd(k.c)} last month. Small increases add up quietly, so it's worth a look before it becomes the new normal.`,
    });
  }

  // Subscriptions: what they add up to, and any that quietly went up.
  const subs = s.rules.filter((r) => r.active !== false && r.kind === "subscription");
  const charges = new Map<string, OneTimeTransaction[]>();
  for (const t of s.transactions) {
    if (t.status !== "posted" || t.direction !== "out" || t.date < addDays(today, -200)) continue;
    const isSub = t.category === "Subscriptions" || subs.some((r) => cleanName(r.name) === cleanName(t.description));
    if (!isSub) continue;
    const key = cleanName(t.description);
    charges.set(key, [...(charges.get(key) ?? []), t]);
  }
  for (const list of charges.values()) {
    const sorted = [...list].sort((a, b) => (a.date < b.date ? -1 : 1));
    if (sorted.length < 3) continue;
    const last = sorted[sorted.length - 1]!;
    const prev = sorted[sorted.length - 2]!;
    const first = sorted[0]!;
    if (last.amountCents > first.amountCents * 1.03 && last.amountCents >= prev.amountCents) {
      out.push({
        id: `price-${cleanName(last.description)}`, icon: "🔺", stat: `+$${((last.amountCents - first.amountCents) / 100).toFixed(2)}`, tone: "warn", score: 2.5,
        title: `${last.description} went up`,
        detail: `This charge used to be $${(first.amountCents / 100).toFixed(2)} and is now $${(last.amountCents / 100).toFixed(2)} a month. Subscription prices often rise without notice. If you don't use it much anymore, cancelling saves that every month.`,
      });
    }
  }
  const unscheduled = [...charges.values()].filter((l) => l.length >= 2 && !subs.some((r) => cleanName(r.name) === cleanName(l[0]!.description)));
  const subMonthly = subs.reduce((a, r) => a + monthlyEquivalent(r), 0) + unscheduled.reduce((a, l) => a + [...l].sort((x, y) => (x.date < y.date ? 1 : -1))[0]!.amountCents, 0);
  const subCount = subs.length + unscheduled.length;
  if (subCount >= 2) {
    out.push({
      id: "subs", icon: "🔁", stat: `${usd(subMonthly * 12)}/yr`, tone: "info", score: 1.4,
      title: `${subCount} subscriptions`,
      detail: `Your subscriptions add up to ${usd(subMonthly)} a month. If there's one you don't use, cancelling it adds that money straight back to what you can spend.`,
    });
  }

  return out.sort((a, b) => b.score - a.score).map(({ score: _s, ...i }) => i);
}

/**
 * Everyday life between today and `end`: what you'll likely spend vs what you have. "At your usual
 * pace you'll run $X short" is the early warning plans alone can't give.
 */
export function paceUntil(m: SpendModel, today: ISODate, end: ISODate, spendingMoneyCents: Cents) {
  const p = predict(m, today, end);
  const lumpyCents = p.lumpy.reduce((a, l) => a + l.avgCents, 0);
  const usualCents = p.totalCents + lumpyCents;
  return { usualCents, lumpy: p.lumpy, gapCents: spendingMoneyCents - usualCents };
}

/** Your week at a glance: a typical day for each weekday, and a typical day right after payday. */
export function rhythm(m: SpendModel): { weekday: Cents[]; payday: Cents } {
  const n = norm(m);
  return { weekday: m.weekday.map((w) => Math.round((m.perDayCents * w) / n)), payday: Math.round((m.perDayCents * m.payday) / n) };
}

const BILL_KINDS = new Set(["bill", "subscription", "expense", "loan_payment"]);

/**
 * The next `days` days in two halves. Organized: bills and calendar plans. Everyday: what your
 * patterns say you'll spend, by category, plus any big rare cost that's due. All in one place, so a
 * budget is a forecast of your real life rather than last month's copy.
 */
export function lifeAhead(
  m: SpendModel | null,
  today: ISODate,
  days: number,
  forecastDays: Array<{ date: ISODate; items: Array<{ kind: string; cashEffectCents: number; label: string }> }>,
  plans: Array<{ date: ISODate; cents: Cents; title: string }>,
) {
  const end = addDays(today, days - 1);
  let billsCents = 0;
  for (const d of forecastDays) {
    if (d.date < today || d.date > end) continue;
    for (const i of d.items) if (BILL_KINDS.has(i.kind) && i.cashEffectCents < 0) billsCents -= i.cashEffectCents;
  }
  const upcoming = plans.filter((p) => p.date >= today && p.date <= end && p.cents > 0);
  const plansCents = upcoming.reduce((a, p) => a + p.cents, 0);
  const p = m ? predict(m, today, end) : null;
  const everydayCents = p?.totalCents ?? 0;
  const rareCents = (p?.lumpy ?? []).reduce((a, l) => a + l.avgCents, 0);
  return {
    end,
    billsCents,
    plansCents,
    plans: upcoming,
    everydayCents,
    rareCents,
    categories: p?.byCategory.sort((a, b) => b.cents - a.cents) ?? [],
    lumpy: p?.lumpy ?? [],
    totalCents: billsCents + plansCents + everydayCents + rareCents,
  };
}

/** A typical everyday amount for each day from today to `end` (with why it's high or low), for the calendar. */
export function typicalDays(s: Snapshot, today: ISODate, end: ISODate): Record<ISODate, { cents: Cents; why: string | null }> {
  const m = spendModel(s, today);
  if (!m) return {};
  const out: Record<ISODate, { cents: Cents; why: string | null }> = {};
  for (const d of eachDay(today, end)) out[d] = typicalDay(m, d);
  for (const l of m.lumpy) if (out[l.nextAround]) out[l.nextAround]!.why = `${out[l.nextAround]!.why ? out[l.nextAround]!.why + "; " : ""}${l.category} (~${usd(l.avgCents)}) usually comes around now`;
  return out;
}

export interface Habit {
  category: string;
  /** Days a week you usually spend on it. */
  perWeek: number;
  /** A usual purchase. */
  avgCents: Cents;
  /** Expected over the next `days` days, from your patterns. */
  expectedCents: Cents;
}

/**
 * The things you spend on almost every week (lunch, transit, coffee), how often, and what the next
 * few days will likely cost. Nobody schedules these, which is why they're predicted.
 */
export function everydayHabits(s: Snapshot, today: ISODate, days = 7, m: SpendModel | null = spendModel(s, today)): Habit[] {
  if (!m) return [];
  const end = addDays(m.from, m.days - 1);
  const p = predict(m, today, addDays(today, days - 1));
  const expected = new Map(p.byCategory.map((c) => [c.category, c.cents]));
  const by = new Map<string, { dates: Set<ISODate>; n: number; total: number }>();
  for (const t of everyday(s, m.from, end)) {
    const c = t.category ?? "Other";
    if (!expected.has(c)) continue;
    const e = by.get(c) ?? { dates: new Set(), n: 0, total: 0 };
    e.dates.add(t.date);
    e.n += 1;
    e.total += t.amountCents;
    by.set(c, e);
  }
  return [...by.entries()]
    .map(([category, e]) => ({ category, perWeek: (e.dates.size / m.days) * 7, avgCents: Math.round(e.total / e.n), expectedCents: expected.get(category) ?? 0 }))
    .filter((h) => h.perWeek >= 0.75)
    .sort((a, b) => b.expectedCents - a.expectedCents);
}
