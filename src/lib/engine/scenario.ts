import type { ISODate } from "../dates";
import type { Cents } from "../money";
import { computeAllowance } from "./advisor";
import { buildForecast } from "./forecast";
import type { EngineInput, Forecast, TxnDirection } from "./types";

export type Adjustment =
  | { type: "add_one_time"; date: ISODate; amountCents: Cents; direction: TxnDirection; accountId: string; label: string }
  | { type: "change_rule_amount"; ruleId: string; amountCents: Cents }
  | { type: "pause_rule"; ruleId: string }
  | { type: "skip_occurrence"; ruleId: string; date: ISODate }
  | { type: "set_balance"; accountId: string; balanceCents: Cents }
  | { type: "set_floor"; cents: Cents };

export interface Scenario {
  id: string;
  name: string;
  adjustments: Adjustment[];
}

/** Apply adjustments to a copy of the input. The original is never mutated. */
export function applyScenario(input: EngineInput, adjustments: Adjustment[]): EngineInput {
  const next: EngineInput = {
    ...input,
    accounts: input.accounts.map((a) => ({ ...a })),
    rules: input.rules.map((r) => ({ ...r })),
    overrides: [...input.overrides],
    transactions: [...input.transactions],
    settings: { ...input.settings },
  };
  adjustments.forEach((adj, i) => {
    switch (adj.type) {
      case "add_one_time":
        next.transactions.push({
          id: `scenario-${i}`,
          date: adj.date,
          amountCents: adj.amountCents,
          direction: adj.direction,
          accountId: adj.accountId,
          description: adj.label,
          status: "planned",
          isEstimate: true,
        });
        break;
      case "change_rule_amount": {
        const r = next.rules.find((x) => x.id === adj.ruleId);
        if (r) r.amountCents = adj.amountCents;
        break;
      }
      case "pause_rule": {
        const r = next.rules.find((x) => x.id === adj.ruleId);
        if (r) r.active = false;
        break;
      }
      case "skip_occurrence":
        next.overrides = next.overrides.filter((o) => !(o.ruleId === adj.ruleId && o.originalDate === adj.date));
        next.overrides.push({ id: `scenario-skip-${i}`, ruleId: adj.ruleId, originalDate: adj.date, action: "skip" });
        break;
      case "set_balance": {
        const a = next.accounts.find((x) => x.id === adj.accountId);
        if (a) {
          a.balanceCents = adj.balanceCents;
          a.balanceAsOf = input.today;
        }
        break;
      }
      case "set_floor":
        next.settings.cashFloorCents = adj.cents;
        break;
    }
  });
  return next;
}

export interface ScenarioComparison {
  base: Forecast;
  scenario: Forecast;
  lowestDeltaCents: Cents;
  endingDeltaCents: Cents;
  dailyAllowanceDeltaCents: Cents;
  baseDailyAllowanceCents: Cents;
  scenarioDailyAllowanceCents: Cents;
}

export function compareScenario(input: EngineInput, adjustments: Adjustment[], horizonDays: number): ScenarioComparison {
  const base = buildForecast(input, horizonDays);
  const scenario = buildForecast(applyScenario(input, adjustments), horizonDays);
  const ba = computeAllowance(base).current.dailyRateCents;
  const sa = computeAllowance(scenario).current.dailyRateCents;
  return {
    base,
    scenario,
    lowestDeltaCents: scenario.lowest.cents - base.lowest.cents,
    endingDeltaCents: scenario.endingCashCents - base.endingCashCents,
    dailyAllowanceDeltaCents: sa - ba,
    baseDailyAllowanceCents: ba,
    scenarioDailyAllowanceCents: sa,
  };
}
