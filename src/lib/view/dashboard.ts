import { calendarCoverage, type Coverage } from "../calendar/coverage";
import { findDuplicates } from "../calendar/duplicates";
import { estimateEventCost, type CostEstimate, type Correction } from "../calendar/estimate";
import { addDays, diffDays, parts, startOfMonth, type ISODate } from "../dates";
import type { Cents } from "../money";
import {
  buildForecast,
  isCash,
  planDailySpending,
  ruleOccurrences,
  spendingByCategory,
  topQuestion,
  type Account,
  type CardProjection,
  type CategoryTotal,
  type DailyPlan,
  type EventAdvice,
  type Forecast,
  type ForecastIssue,
  type ForecastItem,
  type PlannedEvent,
  type RecurringRule,
  type SavingsGoal,
  checkAffordability,
  type AffordCheck,
} from "../engine";
import { toEngineInput, type CalendarEvent, type Snapshot } from "../data/snapshot";
import { dayShape, leanDays } from "./day-shape";
import { planResults } from "./actuals";
import { findRecurring } from "./recurring";

export interface EventView {
  event: CalendarEvent;
  estimate: CostEstimate;
  /** Final number used for planning. */
  plannedCents: Cents;
  duplicate: { ofId: string; ofTitle: string; reason: string } | null;
  advice: EventAdvice | null;
  /** The same answer "Can I afford it?" gives for this plan (null for duplicates and free events). */
  check: AffordCheck | null;
  /** The same answer paid by debit and by your main credit card, to compare (null when there's no card). */
  checkDebit?: AffordCheck | null;
  checkCredit?: AffordCheck | null;
  creditCardId?: string | null;
  sourceName: string;
}

export interface AccountView {
  account: Account;
  valueCents: Cents; // opening value today (assets +, liabilities shown as positive owed via owedCents)
  owedCents: Cents;
  ageDays: number | null;
  stale: boolean;
}

export interface GoalView {
  goal: SavingsGoal;
  balanceCents: Cents;
  projectedCents: Cents;
  pct: number;
  monthlyPlannedCents: Cents;
  monthlyNeededCents: Cents | null;
  onTrack: boolean | null;
}

export interface Question {
  key: string;
  text: string;
  why: string;
  kind: "balance" | "income" | "card" | "event_estimate" | "statement" | "goal" | "other";
  accountId?: string;
  eventId?: string;
  goalId?: string;
}

export interface DashboardModel {
  today: ISODate;
  horizon: number;
  forecast: Forecast;
  forecast90: Forecast;
  plan: DailyPlan;
  /** Calendar events as the advisor saw them (for re-running the plan with a hypothetical purchase). */
  planned: PlannedEvent[];
  coverage: Coverage;
  /** Plans in the next 30 days (duplicates are counted once and left out). */
  events: EventView[];
  /** Plans in the whole 90-day forecast, for the calendar. */
  allEvents: EventView[];
  /** Events hidden as likely duplicates of another one. */
  duplicates: EventView[];
  question: Question | null;
  issues: ForecastIssue[];
  cash: { totalCents: Cents; accounts: AccountView[] };
  savings: AccountView[];
  cards: Array<{ view: AccountView; projection: CardProjection | undefined }>;
  loans: AccountView[];
  goals: GoalView[];
  spending: { month: CategoryTotal[]; monthTotal: Cents; period: CategoryTotal[]; periodTotal: Cents; periodStart: ISODate };
  upcoming: ForecastItem[];
  nextPayday: ISODate | null;
  /** Recent plans with a likely charge, for "How did it go?". */
  checkins: import("./actuals").PlanResult[];
  /** The money's run short: limits are needs only until `until`. */
  lean: { until: ISODate; shortCents: Cents } | null;
  leanDates: ISODate[];
  leanReasons: Record<ISODate, string[]>;
  found: import("./recurring").RecurringSuggestion[];
  /**
   * Everyday safe-to-spend for each day of the forecast, before any plan that day: what's left in
   * its pay period after bills, savings and plans, spread over the days. This pay period uses the
   * daily caps (weekday pattern, today's spending); later periods spread their free money evenly.
   */
  baselineByDay: Record<ISODate, Cents>;
  /** Each pay period's free everyday money (after bills, savings and plans) and what that is per day. */
  payPeriods: Array<{ start: ISODate; end: ISODate; freeCents: Cents; perDayCents: Cents }>;
}

export function monthlyEquivalent(rule: RecurringRule): Cents {
  switch (rule.schedule.frequency) {
    case "weekly":
      return Math.round((rule.amountCents * 52) / 12);
    case "biweekly":
      return Math.round((rule.amountCents * 26) / 12);
    case "semimonthly":
      return rule.amountCents * 2;
    case "monthly":
      return rule.amountCents;
    case "once":
      return 0;
  }
}

export function categoryAverages(s: Snapshot, today: ISODate): Record<string, Cents> {
  const from = addDays(today, -90);
  const sums: Record<string, { t: number; n: number }> = {};
  for (const t of s.transactions) {
    if (t.status !== "posted" || t.direction !== "out" || t.flexible === false || !t.category || t.date < from || t.date >= today) continue;
    const e = (sums[t.category] ??= { t: 0, n: 0 });
    e.t += t.amountCents;
    e.n += 1;
  }
  return Object.fromEntries(Object.entries(sums).filter(([, v]) => v.n >= 3).map(([k, v]) => [k, Math.round(v.t / v.n)]));
}

export function eventCorrections(s: Snapshot): Correction[] {
  return s.corrections
    .filter((c) => c.kind === "event_estimate")
    .map((c) => ({
      matchKey: c.matchKey,
      estimateCents: (c.value.estimateCents as number | null | undefined) ?? null,
      capCents: (c.value.capCents as number | null | undefined) ?? null,
      notSpending: !!c.value.notSpending,
      category: (c.value.category as string | null | undefined) ?? null,
    }));
}

/** Build event views (estimates + duplicate detection) for events in [from, to]. */
export function buildEventViews(s: Snapshot, today: ISODate, from: ISODate, to: ISODate): EventView[] {
  const corrections = eventCorrections(s);
  const averages = categoryAverages(s, today);
  const sources = new Map(s.calendarSources.map((c) => [c.id, c.name]));
  const inRange = s.calendarEvents.filter((e) => !e.cancelled && !e.duplicateConfirmed && e.date >= from && e.date <= to);
  const blocked: Array<[string, string]> = [];
  for (const e of inRange) for (const other of e.notDuplicateOf) blocked.push([e.id, other]);
  const dups = new Map(
    findDuplicates(
      inRange.map((e) => ({ id: e.id, title: e.title, date: e.date, sourceId: e.sourceId, userCorrected: e.userCorrected })),
      blocked,
    ).map((m) => [m.id, m]),
  );
  const byId = new Map(inRange.map((e) => [e.id, e]));
  return inRange
    .map((event) => {
      let estimate: CostEstimate;
      if (event.estimateConfirmed && event.estimateCents != null) {
        estimate = {
          cents: event.estimateCents,
          source: "your_correction",
          category: event.category,
          basis: "You set this amount",
          needsInput: false,
        };
      } else {
        estimate = estimateEventCost(event.title, corrections, averages);
      }
      const d = dups.get(event.id);
      return {
        event,
        estimate,
        plannedCents: event.capCents ?? estimate.cents,
        duplicate: d ? { ofId: d.duplicateOf, ofTitle: byId.get(d.duplicateOf)?.title ?? "another event", reason: d.reason } : null,
        advice: null,
        check: null,
        sourceName: event.sourceId ? (sources.get(event.sourceId) ?? "Calendar") : "Added by you",
      };
    })
    .sort((a, b) => (a.event.date < b.event.date ? -1 : a.event.date > b.event.date ? 1 : a.event.title.localeCompare(b.event.title)));
}

export function buildDashboard(s: Snapshot, today: ISODate, horizon: number, now: Date = new Date()): DashboardModel {
  const input = toEngineInput(s, today);
  const forecast90 = buildForecast(input, 90);
  const forecast = horizon === 90 ? forecast90 : buildForecast(input, horizon);
  const coverage = calendarCoverage(s.calendarSources, now);

  const events = buildEventViews(s, today, today, forecast90.endDate);
  const planned: PlannedEvent[] = events.map((v) => ({
    id: v.event.id,
    title: v.event.title,
    date: v.event.date,
    estimateCents: v.estimate.cents,
    estimateConfirmed: v.event.estimateConfirmed,
    userCapCents: v.event.capCents,
    decision: v.event.decision,
    essential: v.event.essential,
    paymentAccountId: v.event.paymentAccountId,
    duplicateOf: v.duplicate?.ofId ?? null,
    needsEstimate: v.estimate.needsInput,
  }));
  const shape = dayShape(s, today, forecast90.endDate);
  const leanMap = leanDays(s, today, forecast90.endDate);
  const leanDates = new Set<ISODate>();
  const plan = planDailySpending(input, forecast90, planned, { calendarIncomplete: coverage.incomplete, dayWeights: shape?.weights, dayReasons: shape?.reasons });
  const adviceById = new Map(plan.advice.map((a) => [a.eventId, a]));
  for (const v of events) v.advice = adviceById.get(v.event.id) ?? null;

  const nextPayday =
    forecast90.days.find((d) => d.date > today && d.items.some((i) => i.kind === "income" && i.cashEffectCents > 0))?.date ?? null;
  // Each plan gets the same answer as "Can I afford it?", with its own cap already set aside.
  const ctx = { input, events: planned, calendarIncomplete: coverage.incomplete, nextPayday };
  const mainCard = s.accounts.find((a) => a.kind === "credit_card" && !a.archived) ?? null;
  for (const v of events) {
    if (v.duplicate || v.plannedCents <= 0 || v.event.decision === "skip") continue;
    const req = { amountCents: v.plannedCents, date: v.event.date, reservedCents: v.advice?.capCents ?? 0 };
    const payCard = s.accounts.find((a) => a.id === v.event.paymentAccountId && a.kind === "credit_card") ?? null;
    v.checkDebit = checkAffordability(ctx, { ...req, paymentAccountId: payCard ? null : v.event.paymentAccountId });
    const card = payCard ?? mainCard;
    v.creditCardId = card?.id ?? null;
    v.checkCredit = card ? checkAffordability(ctx, { ...req, paymentAccountId: card.id }) : null;
    v.check = payCard ? v.checkCredit : v.checkDebit;
  }

  const accounts = s.accounts.filter((a) => !a.archived);
  const bankLinked = new Set(accounts.filter((a) => a.bankConnectionId).map((a) => a.id));
  const view = (a: Account): AccountView => {
    const ageDays = a.balanceAsOf ? diffDays(a.balanceAsOf, today) : null;
    const value = forecast90.openingByAccount[a.id] ?? 0;
    const limit = a.kind === "credit_card" ? Math.max(s.settings.staleAfterDays, 7) : a.kind === "savings" || a.kind === "loan" ? 30 : s.settings.staleAfterDays;
    return {
      account: a,
      valueCents: value,
      owedCents: a.kind === "credit_card" || a.kind === "loan" ? -value : 0,
      ageDays,
      stale: a.balanceCents == null || ageDays == null || ageDays > limit,
    };
  };
  const cashAccounts = accounts.filter(isCash).map(view);
  const goalAccounts = new Set(s.goals.map((g) => g.accountId).filter(Boolean));
  // Savings not already shown under a goal.
  const savings = accounts
    .filter((a) => !isCash(a) && (a.kind === "savings" || a.kind === "checking" || a.kind === "cash") && !goalAccounts.has(a.id))
    .map(view);
  const cards = accounts
    .filter((a) => a.kind === "credit_card")
    .map((a) => ({ view: view(a), projection: forecast90.cards.find((c) => c.accountId === a.id) }));
  const loans = accounts.filter((a) => a.kind === "loan").map(view);

  const goals: GoalView[] = s.goals.map((g) => {
    const balance = g.accountId ? (forecast90.openingByAccount[g.accountId] ?? 0) : 0;
    const projected = g.accountId ? (forecast90.closingByAccount[g.accountId] ?? 0) : 0;
    const ruleMonthly = s.rules
      .filter((r) => r.active !== false && g.accountId && r.toAccountId === g.accountId)
      .reduce((t, r) => t + monthlyEquivalent(r), 0);
    const monthlyPlanned = ruleMonthly || (g.monthlyContributionCents ?? 0);
    let needed: Cents | null = null;
    if (g.targetDate && g.targetDate > today) {
      const months = Math.max(1, (parts(g.targetDate).y - parts(today).y) * 12 + (parts(g.targetDate).m - parts(today).m));
      needed = Math.max(0, Math.ceil((g.targetCents - balance) / months));
    }
    return {
      goal: g,
      balanceCents: balance,
      projectedCents: projected,
      pct: g.targetCents > 0 ? Math.min(100, Math.round((balance / g.targetCents) * 100)) : 0,
      monthlyPlannedCents: monthlyPlanned,
      monthlyNeededCents: needed,
      onTrack: needed == null ? null : monthlyPlanned >= needed,
    };
  });

  // The current pay period started at the last payday, which may be before today.
  const lastPayday = lastIncomeDate(s, today);
  const spendFrom = lastPayday ?? addDays(today, -13);
  const month = spendingByCategory(input, startOfMonth(today), today);
  const period = spendingByCategory(input, spendFrom, today);

  const upcomingEnd = addDays(today, 13);
  const upcoming = forecast90.days
    .filter((d) => d.date <= upcomingEnd)
    .flatMap((d) => [...d.items, ...d.nonCashItems]);

  const baselineByDay: Record<ISODate, Cents> = {};
  const payPeriods: DashboardModel["payPeriods"] = [];
  const pct = coverage.incomplete ? Math.min(50, Math.max(0, s.settings.unseenPlansBufferPct)) : 0;
  const capOf = new Map(plan.advice.map((a) => [a.eventId, a.capCents]));
  plan.allowance.periods.forEach((p, i) => {
    if (i === 0) return;
    const pool = p.budgetCents - Math.round((p.budgetCents * pct) / 100);
    const reserved = planned.filter((e) => !e.duplicateOf && e.date >= p.start && e.date <= p.end).reduce((t, e) => t + (capOf.get(e.id) ?? 0), 0);
    const free = Math.max(0, pool - reserved);
    const perDay = Math.floor(free / Math.max(1, p.days));
    payPeriods.push({ start: p.start, end: p.end, freeCents: free, perDayCents: perDay });
    // Shaped by your weekday rhythm too (weekends where you really spend), and lean when nothing's free.
    const ds: ISODate[] = [];
    for (let d = p.start; d <= p.end && d <= forecast90.endDate; d = addDays(d, 1)) ds.push(d);
    const lean = free < 100 * ds.length;
    const w = ds.map((d) => Math.max(0.1, shape?.weights[d] ?? 1));
    const tw = w.reduce((a, b) => a + b, 0) || 1;
    ds.forEach((d, k) => {
      baselineByDay[d] = lean ? (leanMap[d]?.cents ?? 0) : Math.floor((free * w[k]!) / tw);
      if (lean) leanDates.add(d);
    });
  });
  // This pay period with nothing free (under $1 a day): lean days, needs only, instead of $0.
  const curFree = plan.days.reduce((t, d) => t + d.baseCents, 0);
  if (plan.days.length && curFree < 100 * plan.days.length) {
    for (const d of plan.days) {
      const l = leanMap[d.date];
      const spent = d.date === today ? d.spentCents : 0;
      d.baseCents = Math.max(0, (l?.cents ?? 0) - spent);
      d.capCents = d.baseCents + d.eventCents;
      d.remainingCents = d.capCents;
      d.reasons = l?.reasons;
      d.lean = true;
      leanDates.add(d.date);
    }
  }
  for (const d of plan.days) baselineByDay[d.date] = d.baseCents;
  if (plan.days.length) {
    payPeriods.unshift({
      start: plan.days[0]!.date,
      end: plan.days[plan.days.length - 1]!.date,
      freeCents: plan.days.reduce((t, d) => t + d.baseCents, 0),
      perDayCents: plan.days[plan.days.length - 1]!.baseCents,
    });
  }

  return {
    today,
    horizon,
    forecast,
    forecast90,
    plan,
    planned,
    coverage,
    events: events.filter((v) => !v.duplicate && v.event.date <= addDays(today, 30)),
    allEvents: events.filter((v) => !v.duplicate),
    duplicates: events.filter((v) => v.duplicate),
    // A connected bank answers balance and statement questions itself: never ask about those accounts.
    question: pickQuestion(
      forecast90.issues.filter(
        (i) => !(i.accountId && bankLinked.has(i.accountId) && ["missing_balance", "stale_balance", "card_stale_balance", "card_no_statement", "card_missing_dates"].includes(i.code)),
      ),
      events,
      today,
    ),
    issues: forecast90.issues,
    cash: { totalCents: forecast90.startingCashCents, accounts: cashAccounts },
    savings,
    cards,
    loans,
    goals,
    spending: {
      month,
      monthTotal: month.reduce((t, c) => t + c.cents, 0),
      period,
      periodTotal: period.reduce((t, c) => t + c.cents, 0),
      periodStart: spendFrom,
    },
    upcoming,
    nextPayday,
    // Plans from the last ten days with a charge we think was theirs, waiting for a yes or no.
    // Lean mode: from today until the first day that isn't short.
    lean: leanDates.has(today)
      ? { until: forecast90.days.find((d) => d.date > today && !leanDates.has(d.date))?.date ?? forecast90.endDate, shortCents: plan.allowance.shortfallCents }
      : null,
    leanDates: [...leanDates],
    leanReasons: Object.fromEntries([...leanDates].map((d) => [d, leanMap[d]?.reasons ?? []])),
    checkins: planResults(s, today, 10).filter((r) => r.actual && !r.confirmed).slice(0, 3),
    // Just connected a bank: what repeats in its history, to review once.
    found:
      s.accounts.some((a) => a.balanceSource === "bank") && !s.corrections.some((c) => c.kind === "preference" && c.matchKey === "setup:repeats_reviewed")
        ? findRecurring(s.transactions, s.rules, today, new Set(s.corrections.filter((c) => c.kind === "preference" && c.matchKey.startsWith("recurring_dismissed:")).map((c) => c.matchKey.slice(20)))).slice(0, 12)
        : [],
    baselineByDay,
    payPeriods,
  };
}

function lastIncomeDate(s: Snapshot, today: ISODate): ISODate | null {
  // Latest scheduled or logged income in the last 35 days (the start of this pay period).
  const from = addDays(today, -35);
  const cashIds = new Set(s.accounts.filter(isCash).map((a) => a.id));
  let latest: ISODate | null = null;
  for (const r of s.rules) {
    if (r.kind !== "income" || !cashIds.has(r.accountId)) continue;
    for (const o of ruleOccurrences(r, s.overrides, from, today)) if (!latest || o.date > latest) latest = o.date;
  }
  for (const t of s.transactions) {
    if (t.direction === "in" && cashIds.has(t.accountId) && t.date >= from && t.date <= today && (!latest || t.date > latest)) latest = t.date;
  }
  return latest;
}

/** One focused question: the most important missing input. */
export function pickQuestion(issues: ForecastIssue[], events: EventView[], today: ISODate): Question | null {
  const top = topQuestion(issues);
  if (top && (top.severity === "critical" || top.makesIncomplete)) {
    return {
      key: `${top.code}:${top.accountId ?? top.goalId ?? ""}`,
      text: top.question!,
      why: top.message,
      kind:
        top.code === "missing_balance" || top.code === "stale_balance" || top.code === "card_stale_balance" || top.code === "no_cash_account"
          ? "balance"
          : top.code === "no_income"
            ? "income"
            : top.code === "card_missing_dates"
              ? "card"
              : top.code === "card_no_statement"
                ? "statement"
                : "other",
      accountId: top.accountId,
      goalId: top.goalId,
    };
  }
  const unknown = events.find((v) => v.estimate.needsInput && !v.duplicate && v.event.date <= addDays(today, 14) && v.event.capCents == null);
  if (unknown) {
    return {
      key: `event:${unknown.event.id}`,
      text: `About how much do you expect to spend at "${unknown.event.title}"?`,
      why: "There's no basis for an estimate yet, so it isn't in your daily limits. Your answer is remembered for similar events.",
      kind: "event_estimate",
      eventId: unknown.event.id,
    };
  }
  if (top) {
    return {
      key: `${top.code}:${top.accountId ?? top.goalId ?? ""}`,
      text: top.question!,
      why: top.message,
      kind: top.code === "card_no_statement" ? "statement" : top.code === "goal_no_account" ? "goal" : "other",
      accountId: top.accountId,
      goalId: top.goalId,
    };
  }
  return null;
}
