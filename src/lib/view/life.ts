import type { ISODate } from "../dates";
import type { Snapshot } from "../data/snapshot";
import type { buildDashboard } from "./dashboard";
import { insights, lifeAhead, paceUntil, rhythm, spendModel } from "./patterns";

/** Everything Patterns shows, from one dashboard build. */
export function lifeSummary(s: Snapshot, today: ISODate, m: ReturnType<typeof buildDashboard>) {
  const model = spendModel(s, today);
  const periodEnd = m.plan.allowance.current.end;
  const spendingMoneyCents = m.plan.allowance.status === "shortfall" ? 0 : m.plan.poolCents;
  const plans = m.allEvents
    .filter((v) => !v.duplicate && v.event.decision !== "skip")
    .map((v) => ({ date: v.event.date, cents: v.advice?.capCents || v.plannedCents, title: v.event.title }));
  const pace = model ? paceUntil(model, today, periodEnd, spendingMoneyCents) : null;
  return {
    model,
    insights: insights(s, today, model),
    ahead: lifeAhead(model, today, 30, m.forecast90.days, plans),
    week: model ? rhythm(model) : null,
    pace: pace && { usualCents: pace.usualCents, gapCents: pace.gapCents },
    periodEnd,
    spendingMoneyCents,
    learnedDays: model?.days ?? 0,
  };
}
