import { addDays, diffDays, formatShort, type ISODate } from "../dates";
import { allocate, formatCents, friendlyRoundDown, friendlyRoundUp, type Cents } from "../money";
import { spendingBaseline, spentOn, type SpendingBaseline } from "./spending";
import type { EngineInput, Forecast } from "./types";

// ---------------------------------------------------------------------------
// Safe-to-spend allowance
// ---------------------------------------------------------------------------

export interface PayPeriod {
  start: ISODate;
  end: ISODate;
  days: number;
  /** Income that starts this period (undefined for the current, already-started period). */
  startsWithIncome: boolean;
  dailyRateCents: Cents;
  budgetCents: Cents;
}

export type AllowanceStatus = "ok" | "tight" | "shortfall";

export interface Allowance {
  status: AllowanceStatus;
  /** Most you could spend today without any future day dropping below your floor. */
  safeToSpendCents: Cents;
  /** How far below the floor the forecast goes before any flexible spending (0 if none). */
  shortfallCents: Cents;
  shortfallDate: ISODate | null;
  /** Even daily rate you could sustain every day of the horizon. */
  sustainableDailyCents: Cents;
  periods: PayPeriod[];
  current: PayPeriod;
  explanation: string[];
}

/**
 * Split flexible money across pay periods.
 *
 * slack(d) = closing(d) − floor. The sustainable rate a* is the largest daily
 * amount that, spent every day from today, keeps every day ≥ floor:
 *   a* = min_d slack(d) / (days elapsed through d).
 * Each pay period then gets the largest rate that still leaves a* per day for
 * every later day, so near-term money never borrows from a later bill.
 */
export function computeAllowance(forecast: Forecast): Allowance {
  const floor = forecast.floorCents;
  const days = forecast.days;
  const slack = days.map((d) => d.closingCents - floor);
  const minSlack = Math.min(...slack);
  const minIdx = slack.indexOf(minSlack);
  const explanation: string[] = [];

  // Pay periods: split at each cash income date after today.
  const incomeIdx: number[] = [];
  days.forEach((d, i) => {
    if (i > 0 && d.items.some((it) => it.kind === "income" && it.cashEffectCents > 0)) incomeIdx.push(i);
  });
  let bounds: Array<[number, number, boolean]> = [];
  if (incomeIdx.length === 0) {
    for (let s = 0; s < days.length; s += 14) bounds.push([s, Math.min(days.length - 1, s + 13), false]);
  } else {
    let s = 0;
    for (const i of incomeIdx) {
      if (i > s) bounds.push([s, i - 1, s > 0]);
      s = i;
    }
    bounds.push([s, days.length - 1, true]);
    bounds = bounds.filter(([a, b]) => b >= a);
  }

  if (minSlack < 0) {
    const periods = bounds.map(([a, b, inc]) => ({
      start: days[a]!.date,
      end: days[b]!.date,
      days: b - a + 1,
      startsWithIncome: inc,
      dailyRateCents: 0,
      budgetCents: 0,
    }));
    // Name the biggest payments that cause it, so the shortfall isn't a mystery.
    const outs = days
      .slice(0, minIdx + 1)
      .flatMap((d) => d.items.filter((it) => it.cashEffectCents < 0))
      .sort((x, y) => x.cashEffectCents - y.cashEffectCents)
      .slice(0, 2);
    const nextIncome = days.slice(minIdx + 1).find((d) => d.items.some((it) => it.kind === "income" && it.cashEffectCents > 0));
    const cause = outs.length
      ? ` Mainly ${outs.map((it) => `${it.label} (${formatCents(-it.cashEffectCents)} on ${formatShort(it.date)})`).join(" and ")}${nextIncome ? `, before your next income on ${formatShort(nextIncome.date)}` : ""}.`
      : "";
    explanation.push(
      `Before any flexible spending, cash is projected to fall ${formatCents(-minSlack)} below your ${formatCents(floor)} floor on ${formatShort(days[minIdx]!.date)}.${cause}`,
      "Flexible spending is paused until that gap is closed: move money from savings, pay less on a card this month, delay a bill, or add income.",
    );
    return {
      status: "shortfall",
      safeToSpendCents: 0,
      shortfallCents: -minSlack,
      shortfallDate: days[minIdx]!.date,
      sustainableDailyCents: 0,
      periods,
      current: periods[0]!,
      explanation,
    };
  }

  let aStar = Number.POSITIVE_INFINITY;
  slack.forEach((s, k) => {
    aStar = Math.min(aStar, Math.floor(s / (k + 1)));
  });

  const spentBefore = new Array<number>(days.length).fill(0); // cumulative allocations from earlier periods through day k
  const periods: PayPeriod[] = [];
  for (const [a, b, inc] of bounds) {
    const n = b - a + 1;
    let rate = Number.POSITIVE_INFINITY;
    for (let k = a; k < days.length; k++) {
      const elapsedInPeriod = Math.min(k - a + 1, n);
      const after = Math.max(0, k - b); // later days reserved at a*
      const room = slack[k]! - spentBefore[k]! - aStar * after;
      rate = Math.min(rate, Math.floor(room / elapsedInPeriod));
    }
    rate = Math.max(aStar, Math.max(0, rate));
    for (let k = a; k < days.length; k++) spentBefore[k]! += rate * Math.min(k - a + 1, n);
    periods.push({
      start: days[a]!.date,
      end: days[b]!.date,
      days: n,
      startsWithIncome: inc,
      dailyRateCents: rate,
      budgetCents: rate * n,
    });
  }

  const current = periods[0]!;
  const status: AllowanceStatus = current.dailyRateCents < 1_500 || minSlack < floor * 0.25 ? "tight" : "ok";
  explanation.push(
    `Lowest projected cash is ${formatCents(days[minIdx]!.closingCents)} on ${formatShort(days[minIdx]!.date)}, ${formatCents(minSlack)} above your floor.`,
    `This pay period (${formatShort(current.start)}–${formatShort(current.end)}) can absorb ${formatCents(current.budgetCents)} of flexible spending while every bill, card payment and savings transfer still clears.`,
  );
  return {
    status,
    safeToSpendCents: minSlack,
    shortfallCents: 0,
    shortfallDate: null,
    sustainableDailyCents: aStar,
    periods,
    current,
    explanation,
  };
}

// ---------------------------------------------------------------------------
// Events and daily caps
// ---------------------------------------------------------------------------

export type Recommendation = "proceed" | "cheaper" | "postpone" | "skip";

export interface PlannedEvent {
  id: string;
  title: string;
  date: ISODate;
  estimateCents: Cents;
  /** true when the estimate is confirmed by the user rather than guessed. */
  estimateConfirmed: boolean;
  /** User-chosen cap; overrides the computed cap. */
  userCapCents?: Cents | null;
  /** User's decision, if they've made one. */
  decision?: Recommendation | null;
  essential?: boolean;
  /** Paid with this account (card → shows up on a statement). */
  paymentAccountId?: string | null;
  /** Hidden as a duplicate of another event. */
  duplicateOf?: string | null;
  needsEstimate?: boolean;
}

export interface EventAdvice {
  eventId: string;
  recommendation: Recommendation;
  /** Suggested spending cap for the event (0 for skip/postpone). */
  capCents: Cents;
  estimateCents: Cents;
  reason: string;
  suggestedDate?: ISODate;
  impacts: string[];
  /** Follows a decision the user already made. */
  userDecided: boolean;
}

export interface DayCap {
  date: ISODate;
  baseCents: Cents;
  eventCents: Cents;
  capCents: Cents;
  spentCents: Cents;
  remainingCents: Cents;
  eventIds: string[];
}

export interface DailyPlan {
  allowance: Allowance;
  /** Pool for the current period after holding back the unseen-plans buffer. */
  poolCents: Cents;
  bufferCents: Cents;
  days: DayCap[];
  advice: EventAdvice[];
  baseline: SpendingBaseline;
  todayCap: DayCap;
  notes: string[];
}

export interface PlanOptions {
  /** Calendar coverage is incomplete (missing, failed or stale calendars). */
  calendarIncomplete: boolean;
}

/**
 * Turn the allowance into realistic daily caps, reserving money for calendar
 * events and spreading the rest by the user's historical weekday pattern.
 */
export function planDailySpending(
  input: EngineInput,
  forecast: Forecast,
  events: PlannedEvent[],
  options: PlanOptions,
): DailyPlan {
  const allowance = computeAllowance(forecast);
  const baseline = spendingBaseline(input);
  const notes: string[] = [];
  const active = events
    .filter((e) => !e.duplicateOf && e.date >= forecast.startDate && e.date <= forecast.endDate)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id < b.id ? -1 : 1));

  const advice: EventAdvice[] = [];
  const periodIndex = (date: ISODate) => allowance.periods.findIndex((p) => date >= p.start && date <= p.end);
  // Event money left per period.
  const pct = options.calendarIncomplete ? Math.min(50, Math.max(0, input.settings.unseenPlansBufferPct)) : 0;
  const periodPools = allowance.periods.map((p) => p.budgetCents - Math.round((p.budgetCents * pct) / 100));
  const bufferCents = allowance.current.budgetCents - periodPools[0]!;
  if (pct > 0 && bufferCents > 0) {
    notes.push(
      `${formatCents(bufferCents)} is held back this period for plans we can't see (some calendars are missing, failed to sync, or are out of date).`,
    );
  }
  // Keep at least half of normal daily spending for non-event days.
  const essentialPerDay = baseline.reliable ? Math.round(baseline.avgDailyCents * 0.5) : 0;
  const eventRoom = allowance.periods.map((p, i) => Math.max(0, periodPools[i]! - essentialPerDay * p.days));

  // Pass 1: user-decided and essential events claim money first.
  const ordered = [
    ...active.filter((e) => e.decision || e.essential),
    ...active.filter((e) => !e.decision && !e.essential),
  ];
  for (const e of ordered) {
    const pi = periodIndex(e.date);
    const want = e.userCapCents ?? e.estimateCents;
    const impacts = eventImpacts(input, forecast, e, want);
    if (pi < 0) continue;

    if (e.decision) {
      const cap = e.decision === "skip" || e.decision === "postpone" ? 0 : want;
      eventRoom[pi] = eventRoom[pi]! - cap;
      advice.push({
        eventId: e.id,
        recommendation: e.decision,
        capCents: cap,
        estimateCents: e.estimateCents,
        reason: decidedReason(e.decision, cap),
        impacts,
        userDecided: true,
      });
      continue;
    }
    if (e.needsEstimate && want === 0) {
      advice.push({
        eventId: e.id,
        recommendation: "proceed",
        capCents: 0,
        estimateCents: 0,
        reason: "No cost estimate yet. Add one so it can be planned for.",
        impacts,
        userDecided: false,
      });
      continue;
    }
    if (want === 0) {
      advice.push({
        eventId: e.id,
        recommendation: "proceed",
        capCents: 0,
        estimateCents: 0,
        reason: "No spending expected.",
        impacts,
        userDecided: false,
      });
      continue;
    }

    const room = eventRoom[pi]!;
    if (allowance.status === "shortfall" && !e.essential) {
      const later = laterPeriodWithRoom(allowance, eventRoom, pi, want);
      advice.push({
        eventId: e.id,
        recommendation: later != null ? "postpone" : "skip",
        capCents: 0,
        estimateCents: e.estimateCents,
        suggestedDate: later != null ? allowance.periods[later]!.start : undefined,
        reason:
          later != null
            ? `Cash is projected to fall below your floor; after ${formatShort(allowance.periods[later]!.start)} there's room for it.`
            : "Cash is projected to fall below your floor. Skipping keeps bills and card payments covered.",
        impacts,
        userDecided: false,
      });
      continue;
    }
    if (want <= room) {
      const cap = Math.min(friendlyRoundUp(want), room);
      eventRoom[pi] = room - cap;
      advice.push({
        eventId: e.id,
        recommendation: "proceed",
        capCents: cap,
        estimateCents: e.estimateCents,
        reason: `Fits this pay period. Keep it under ${formatCents(cap)}.`,
        impacts,
        userDecided: false,
      });
    } else if (room >= Math.round(want * 0.6) || e.essential) {
      const cap = Math.max(0, friendlyRoundDown(room));
      eventRoom[pi] = room - cap;
      advice.push({
        eventId: e.id,
        recommendation: "cheaper",
        capCents: cap,
        estimateCents: e.estimateCents,
        reason:
          cap > 0
            ? `Only ${formatCents(cap)} fits this period (estimate ${formatCents(want)}). A cheaper version keeps you on track.`
            : `Nothing is left for it this period (estimate ${formatCents(want)}).`,
        impacts,
        userDecided: false,
      });
    } else {
      const later = laterPeriodWithRoom(allowance, eventRoom, pi, want);
      if (later != null) {
        eventRoom[later] = eventRoom[later]! - want;
        advice.push({
          eventId: e.id,
          recommendation: "postpone",
          capCents: 0,
          estimateCents: e.estimateCents,
          suggestedDate: allowance.periods[later]!.start,
          reason: `Doesn't fit before payday (only ${formatCents(Math.max(0, room))} free). It fits on or after ${formatShort(allowance.periods[later]!.start)}.`,
          impacts,
          userDecided: false,
        });
      } else {
        advice.push({
          eventId: e.id,
          recommendation: "skip",
          capCents: 0,
          estimateCents: e.estimateCents,
          reason: `At ${formatCents(want)} it doesn't fit in any pay period in this forecast without cutting into bills, card payments or savings.`,
          impacts,
          userDecided: false,
        });
      }
    }
  }

  // Daily caps for the current period.
  const cur = allowance.current;
  const curDates: ISODate[] = [];
  for (let d = cur.start; d <= cur.end; d = addDays(d, 1)) curDates.push(d);
  const eventCapsByDate = new Map<ISODate, { cents: Cents; ids: string[] }>();
  for (const a of advice) {
    const ev = active.find((e) => e.id === a.eventId)!;
    if (ev.date > cur.end) continue;
    const entry = eventCapsByDate.get(ev.date) ?? { cents: 0, ids: [] };
    entry.cents += a.capCents;
    entry.ids.push(ev.id);
    eventCapsByDate.set(ev.date, entry);
  }
  const eventTotal = [...eventCapsByDate.values()].reduce((s, e) => s + e.cents, 0);
  const leftover = Math.max(0, periodPools[0]! - eventTotal);
  // Everyday money is the same every day of the period (to the cent), so any two days without
  // plans read the same. Plan days get their plan's cap on top.
  const base = allocate(leftover, curDates.map(() => 1));

  const dayCaps: DayCap[] = curDates.map((date, i) => {
    const ev = eventCapsByDate.get(date);
    const cap = base[i]! + (ev?.cents ?? 0);
    const spent = date === input.today ? spentOn(input, date) : 0;
    return {
      date,
      baseCents: base[i]!,
      eventCents: ev?.cents ?? 0,
      capCents: cap,
      spentCents: spent,
      remainingCents: cap,
      eventIds: ev?.ids ?? [],
    };
  });
  // Spending logged today is already out of the balance (and the pool), so
  // today's cap is what's still available today — no double subtraction.
  if (dayCaps[0] && dayCaps[0].spentCents > 0) {
    notes.push(`${formatCents(dayCaps[0].spentCents)} logged today is already reflected; today's cap is what's left.`);
  }
  if (allowance.status === "shortfall") {
    notes.unshift(allowance.explanation[0]!);
  }

  const todayCap = dayCaps[0] ?? {
    date: input.today,
    baseCents: 0,
    eventCents: 0,
    capCents: 0,
    spentCents: 0,
    remainingCents: 0,
    eventIds: [],
  };
  return {
    allowance,
    poolCents: periodPools[0]!,
    bufferCents: Math.max(0, bufferCents),
    days: dayCaps,
    advice,
    baseline,
    todayCap,
    notes,
  };
}

function laterPeriodWithRoom(allowance: Allowance, room: number[], from: number, want: Cents): number | null {
  for (let i = from + 1; i < allowance.periods.length; i++) if (room[i]! >= want) return i;
  return null;
}

function decidedReason(d: Recommendation, cap: Cents): string {
  switch (d) {
    case "proceed":
      return `You chose to go ahead${cap ? ` with a ${formatCents(cap)} cap` : ""}.`;
    case "cheaper":
      return `You chose a cheaper version${cap ? ` capped at ${formatCents(cap)}` : ""}.`;
    case "postpone":
      return "You chose to postpone this.";
    case "skip":
      return "You chose to skip this.";
  }
}

/** Plain-language effects of spending `cents` on an event. */
export function eventImpacts(input: EngineInput, forecast: Forecast, e: PlannedEvent, cents: Cents): string[] {
  if (cents <= 0) return [];
  const out: string[] = [];
  const acct = e.paymentAccountId ? input.accounts.find((a) => a.id === e.paymentAccountId) : undefined;
  let cashDate = e.date;
  if (acct?.kind === "credit_card") {
    const card = forecast.cards.find((c) => c.accountId === acct.id);
    const stmt = card?.statements.find((s) => s.closingDate >= e.date);
    if (stmt) {
      cashDate = stmt.dueDate;
      out.push(
        `On ${acct.name}: lands on the statement closing ${formatShort(stmt.closingDate)}, paid from checking ${formatShort(stmt.dueDate)}. Cash isn't touched until then.`,
      );
    } else {
      out.push(`On ${acct.name}: paid from checking on a statement after this forecast window.`);
      cashDate = forecast.endDate > e.date ? addDays(forecast.endDate, 1) : e.date;
    }
  }
  const after = forecast.days.filter((d) => d.date >= cashDate);
  if (after.length) {
    const low = after.reduce((m, d) => (d.closingCents < m.closingCents ? d : m));
    const before = forecast.days.filter((d) => d.date < cashDate);
    const lowBefore = before.length ? Math.min(...before.map((d) => d.closingCents)) : Number.POSITIVE_INFINITY;
    const newLow = Math.min(lowBefore, low.closingCents - cents);
    out.push(
      `Lowest projected cash goes from ${formatCents(forecast.lowest.cents)} to ${formatCents(newLow)}${newLow < forecast.floorCents ? " — below your floor" : ""}.`,
    );
  }
  const debts = input.accounts.filter((a) => a.kind === "loan" && (a.balanceCents ?? 0) > 0 && (a.aprBps ?? 0) > 0);
  const worst = debts.sort((a, b) => (b.aprBps ?? 0) - (a.aprBps ?? 0))[0];
  if (worst) {
    const saved = Math.round((cents * (worst.aprBps ?? 0)) / 10_000);
    out.push(`Put toward ${worst.name} (${((worst.aprBps ?? 0) / 100).toFixed(2)}% APR) instead, it would save about ${formatCents(saved)} in interest over a year.`);
  }
  const wedding = input.goals.find((g) => g.kind === "wedding");
  if (wedding && (wedding.monthlyContributionCents ?? 0) > 0) {
    const daysOfSaving = Math.round((cents * 30) / wedding.monthlyContributionCents!);
    out.push(`That's about ${daysOfSaving} day${daysOfSaving === 1 ? "" : "s"} of ${wedding.name} contributions.`);
  }
  return out;
}

export function periodProgress(plan: DailyPlan, today: ISODate): { dayOf: number; daysLeft: number } {
  const p = plan.allowance.current;
  return { dayOf: diffDays(p.start, today) + 1, daysLeft: diffDays(today, p.end) + 1 };
}
