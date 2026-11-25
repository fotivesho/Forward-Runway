import { addDays, dayOfWeek, diffDays, endOfMonth, startOfMonth, type ISODate } from "../dates";
import type { Cents } from "../money";
import { ruleOccurrences } from "./schedule";
import type { Account, EngineInput, OneTimeTransaction } from "./types";

export interface CategoryTotal {
  category: string;
  cents: Cents;
  count: number;
  /** Portion paid by credit card (already included in cents; shown for clarity). */
  onCardCents: Cents;
  /** Portion from scheduled bills rather than logged spending. */
  scheduledCents: Cents;
}

const SPENDING_RULE_KINDS = new Set(["bill", "subscription", "expense"]);

/**
 * Spending by category in [from, to] (to is clamped to today: only things
 * that have happened). Card purchases count as spending ONCE, when made.
 * Card payments, transfers, savings moves and loan principal are not
 * spending and are excluded, so nothing is counted twice.
 */
export function spendingByCategory(input: EngineInput, from: ISODate, to: ISODate): CategoryTotal[] {
  const until = to < input.today ? to : input.today;
  const accounts = new Map(input.accounts.map((a) => [a.id, a]));
  const totals = new Map<string, CategoryTotal>();
  const add = (category: string | null | undefined, cents: Cents, account: Account | undefined, scheduled: boolean) => {
    const key = category?.trim() || "Uncategorized";
    const t = totals.get(key) ?? { category: key, cents: 0, count: 0, onCardCents: 0, scheduledCents: 0 };
    t.cents += cents;
    t.count += 1;
    if (account?.kind === "credit_card") t.onCardCents += cents;
    if (scheduled) t.scheduledCents += cents;
    totals.set(key, t);
  };

  for (const t of input.transactions) {
    if (t.status !== "posted" || t.date < from || t.date > until) continue;
    const acct = accounts.get(t.accountId);
    if (!acct || acct.kind === "loan") continue;
    if (t.direction === "out") add(t.category, t.amountCents, acct, false);
    else if (acct.kind === "credit_card") add(t.category, -t.amountCents, acct, false); // refund
  }
  for (const r of input.rules) {
    if (!SPENDING_RULE_KINDS.has(r.kind) || r.toAccountId) continue;
    const acct = accounts.get(r.accountId);
    for (const o of ruleOccurrences(r, input.overrides, from, until)) add(r.category ?? r.name, o.amountCents, acct, true);
  }
  return [...totals.values()].filter((t) => t.cents !== 0).sort((a, b) => b.cents - a.cents || a.category.localeCompare(b.category));
}

export function monthRange(today: ISODate): { from: ISODate; to: ISODate } {
  return { from: startOfMonth(today), to: endOfMonth(today) };
}

export interface SpendingBaseline {
  /** Average flexible spending per weekday (0 = Sunday). */
  byWeekday: Cents[];
  avgDailyCents: Cents;
  daysOfHistory: number;
  /** True when there's enough history (>= 14 days) to shape daily caps. */
  reliable: boolean;
}

export function isFlexibleSpend(t: OneTimeTransaction): boolean {
  return t.status === "posted" && t.direction === "out" && t.flexible !== false;
}

/** Historical flexible spending pattern over the last `lookbackDays` days (excluding today). */
export function spendingBaseline(input: EngineInput, lookbackDays = 56): SpendingBaseline {
  const to = addDays(input.today, -1);
  const from = addDays(input.today, -lookbackDays);
  const accounts = new Map(input.accounts.map((a) => [a.id, a]));
  const flex = input.transactions.filter(
    (t) => isFlexibleSpend(t) && t.date >= from && t.date <= to && accounts.get(t.accountId)?.kind !== "loan",
  );
  if (flex.length === 0) return { byWeekday: [0, 0, 0, 0, 0, 0, 0], avgDailyCents: 0, daysOfHistory: 0, reliable: false };
  const first = flex.reduce((m, t) => (t.date < m ? t.date : m), to);
  const span = diffDays(first, to) + 1;
  const sums = [0, 0, 0, 0, 0, 0, 0];
  const counts = [0, 0, 0, 0, 0, 0, 0];
  for (let d = first; d <= to; d = addDays(d, 1)) counts[dayOfWeek(d)]! += 1;
  let total = 0;
  for (const t of flex) {
    sums[dayOfWeek(t.date)]! += t.amountCents;
    total += t.amountCents;
  }
  return {
    byWeekday: sums.map((s, i) => (counts[i] ? Math.round(s / counts[i]!) : 0)),
    avgDailyCents: Math.round(total / span),
    daysOfHistory: span,
    reliable: span >= 14,
  };
}

/** Flexible spending already logged for a given day (cash and card). */
export function spentOn(input: EngineInput, date: ISODate): Cents {
  return input.transactions.filter((t) => isFlexibleSpend(t) && t.date === date).reduce((s, t) => s + t.amountCents, 0);
}

export function spentBetween(input: EngineInput, from: ISODate, to: ISODate): Cents {
  return input.transactions
    .filter((t) => isFlexibleSpend(t) && t.date >= from && t.date <= to)
    .reduce((s, t) => s + t.amountCents, 0);
}

/**
 * Typical everyday spending on one card per day, from the last `lookbackDays` of logged purchases.
 * Used to estimate how big a future statement will really be. Display only: everyday spending is
 * already funded by the daily caps when it happens, so it's never subtracted from cash twice.
 */
export function avgDailyCardSpend(input: EngineInput, cardId: string, lookbackDays = 56): Cents {
  const from = addDays(input.today, -lookbackDays);
  const to = addDays(input.today, -1);
  const txns = input.transactions.filter((t) => t.accountId === cardId && isFlexibleSpend(t) && t.date >= from && t.date <= to);
  if (txns.length === 0) return 0;
  const first = txns.reduce((m, t) => (t.date < m ? t.date : m), to);
  const span = Math.max(14, diffDays(first, to) + 1);
  return Math.round(txns.reduce((s, t) => s + t.amountCents, 0) / span);
}
