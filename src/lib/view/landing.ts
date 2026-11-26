/**
 * Everything the public landing page shows, computed by the real engine from the
 * FICTIONAL demo data. No user data is ever involved.
 */
import { addDays, diffDays, type ISODate } from "../dates";
import type { Cents } from "../money";
import { demoSnapshot } from "../data/demo";
import type { Snapshot } from "../data/snapshot";
import type { PlannedEvent } from "../engine/advisor";
import { buildDashboard, type DashboardModel } from "./dashboard";
import { buildBudget, type BudgetPlan } from "./budget";
import { everydayHabits, insights, type Habit, type Insight } from "./patterns";
import { exploreData, profileCategory, suggestAmounts } from "./explore";

export interface LandingStep {
  date: ISODate;
  label: string;
  amountCents: Cents; // signed effect on cash
  balanceAfterCents: Cents;
  kind: string;
}

export interface LandingData {
  today: ISODate;
  snapshot: Snapshot;
  /** What the advisor needs to re-run Today's number with a hypothetical purchase. */
  afford: { events: PlannedEvent[]; calendarIncomplete: boolean };
  hero: {
    safeTodayCents: Cents;
    poolCents: Cents;
    daysToPayday: number | null;
    nextPayday: ISODate | null;
    points: Array<{ date: ISODate; cents: Cents }>;
    floorCents: Cents;
    lowest: { date: ISODate; cents: Cents };
    upcoming: Array<{ date: ISODate; label: string; amountCents: Cents }>;
  };
  /** Bank balance today, then every cash item in the next three weeks with the running balance. */
  spokenFor: { startCents: Cents; steps: LandingStep[]; safeTodayCents: Cents };
  events: Array<{ title: string; date: ISODate; estimateCents: Cents; capCents: Cents; recommendation: string; reason: string; duplicateOf: string | null }>;
  weekCaps: Array<{ date: ISODate; capCents: Cents; hasPlan: boolean }>;
  card: { name: string; purchaseDate: ISODate; closingDate: ISODate; dueDate: ISODate } | null;
  wedding: { balanceCents: Cents; targetCents: Cents; pct: number } | null;
  /** The Today tab's snapshot tiles, from the same sample data. */
  overview: Pick<DashboardModel, "cash" | "savings" | "goals" | "cards" | "loans">;
  /** This month's smart budget for the sample person. */
  budget: BudgetPlan;
  /** What the sample person's patterns show. */
  insights: Insight[];
  /** Everyday spending the sample person's habits predict for the next 7 days. */
  habits: Habit[];
  /** The guided planner, filled in for one sample dinner. */
  planner: {
    period: { start: ISODate; end: ISODate; freeCents: Cents; perDayCents: Cents };
    committed: { bills: Cents; savings: Cents; plans: Cents };
    profile: { avgCents: Cents; lowCents: Cents; highCents: Cents; perWeek: number; busiestDow: number | null } | null;
    suggestions: Array<{ label: string; cents: Cents }>;
  } | null;
}

export function buildLanding(today: ISODate, nowIso: string): LandingData {
  const snapshot = demoSnapshot(today, nowIso);
  const m = buildDashboard(snapshot, today, 30, new Date(nowIso));
  const days = m.forecast.days;

  const steps: LandingStep[] = [];
  let running = m.forecast.startingCashCents;
  const until = addDays(today, 20);
  for (const d of m.forecast90.days) {
    if (d.date > until) break;
    for (const it of d.items) {
      running += it.cashEffectCents;
      steps.push({ date: d.date, label: it.label, amountCents: it.cashEffectCents, balanceAfterCents: running, kind: it.kind });
    }
  }

  const card = m.cards[0];
  const nextStatement = card?.projection?.statements.find((s) => s.isProjected);
  const wedding = m.goals.find((g) => g.goal.kind === "wedding");

  return {
    today,
    snapshot,
    afford: { events: m.planned, calendarIncomplete: m.coverage.incomplete },
    overview: { cash: m.cash, savings: m.savings, goals: m.goals, cards: m.cards, loans: m.loans },
    insights: insights(snapshot, today).slice(0, 4),
    habits: everydayHabits(snapshot, today, 7).slice(0, 4),
    planner: (() => {
      const period = m.payPeriods[1] ?? m.payPeriods[0];
      if (!period) return null;
      let bills = 0, savings = 0;
      for (const d of m.forecast90.days) {
        if (d.date < period.start || d.date > period.end) continue;
        for (const it of d.items) {
          if (it.kind === "savings_transfer") savings -= it.cashEffectCents;
          else if (["bill", "subscription", "loan_payment", "expense", "card_payment"].includes(it.kind) && it.cashEffectCents < 0) bills -= it.cashEffectCents;
        }
      }
      const plans = m.allEvents.filter((v) => v.event.date >= period.start && v.event.date <= period.end && v.event.decision !== "skip").reduce((a, v) => a + (v.advice?.capCents ?? 0), 0);
      const p = profileCategory(exploreData(snapshot, today), "Dining");
      return {
        period: { start: period.start, end: period.end, freeCents: period.freeCents, perDayCents: period.perDayCents },
        committed: { bills, savings, plans },
        profile: p && { avgCents: p.avgCents, lowCents: p.lowCents, highCents: p.highCents, perWeek: p.perWeek, busiestDow: p.busiestDow },
        suggestions: suggestAmounts(p, "Dining"),
      };
    })(),
    budget: buildBudget(snapshot, today, m.allEvents.map((v) => ({ title: v.event.title, date: v.event.date, cents: v.advice?.capCents ?? 0, category: v.event.category }))),
    hero: {
      safeTodayCents: m.plan.todayCap.capCents,
      poolCents: m.plan.poolCents,
      daysToPayday: m.nextPayday ? diffDays(today, m.nextPayday) : null,
      nextPayday: m.nextPayday,
      points: days.map((d) => ({ date: d.date, cents: d.closingCents })),
      floorCents: m.forecast.floorCents,
      lowest: m.forecast.lowest,
      upcoming: m.upcoming
        .filter((i) => i.cashEffectCents !== 0)
        .slice(0, 4)
        .map((i) => ({ date: i.date, label: i.label, amountCents: i.cashEffectCents })),
    },
    spokenFor: { startCents: m.forecast.startingCashCents, steps: steps.slice(0, 8), safeTodayCents: m.plan.todayCap.capCents },
    events: m.events
      .filter((v) => v.advice)
      .slice(0, 7)
      .map((v) => ({
        title: v.event.title,
        date: v.event.date,
        estimateCents: v.estimate.cents,
        capCents: v.advice?.capCents ?? 0,
        recommendation: v.estimate.needsInput ? "needs_estimate" : (v.advice?.recommendation ?? "proceed"),
        reason: v.advice?.reason ?? "",
        duplicateOf: v.duplicate?.ofTitle ?? null,
      })),
    weekCaps: m.plan.days.slice(0, 7).map((d) => ({ date: d.date, capCents: d.capCents, hasPlan: d.eventIds.length > 0 })),
    card:
      card && nextStatement
        ? { name: card.view.account.name, purchaseDate: today, closingDate: nextStatement.closingDate, dueDate: nextStatement.dueDate }
        : null,
    wedding: wedding ? { balanceCents: wedding.balanceCents, targetCents: wedding.goal.targetCents, pct: wedding.pct } : null,
  };
}
