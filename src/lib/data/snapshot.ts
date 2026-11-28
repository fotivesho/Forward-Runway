import type { CalendarSourceState } from "../calendar/coverage";
import type { EstimateSource } from "../calendar/estimate";
import type { ISODate } from "../dates";
import type { Cents } from "../money";
import type { Recommendation } from "../engine/advisor";
import type { Adjustment } from "../engine/scenario";
import type {
  Account,
  CardStatement,
  EngineInput,
  ForecastSettings,
  OccurrenceOverride,
  OneTimeTransaction,
  RecurringRule,
  SavingsGoal,
  Transfer,
} from "../engine/types";

export interface Profile {
  displayName: string | null;
  timezone: string;
  onboardedAt: string | null;
  hideAmounts: boolean;
  theme: "system" | "light" | "dark";
}

export interface CalendarSourceView extends CalendarSourceState {
  kind: "ics_url" | "ics_upload" | "manual";
  /** Host only, e.g. "calendar.google.com" — never the secret URL. */
  urlHint: string | null;
}

export interface CalendarEvent {
  id: string;
  sourceId: string | null;
  externalUid: string | null;
  date: ISODate;
  title: string;
  location: string | null;
  cancelled: boolean;
  estimateCents: Cents | null;
  estimateSource: EstimateSource | "user" | null;
  estimateConfirmed: boolean;
  category: string | null;
  capCents: Cents | null;
  decision: Recommendation | null;
  essential: boolean;
  paymentAccountId: string | null;
  duplicateOf: string | null;
  duplicateConfirmed: boolean;
  notDuplicateOf: string[];
  missingFromFeed: boolean;
  userCorrected: boolean;
}

export interface CorrectionRow {
  id: string;
  kind: "event_estimate" | "category_rename" | "preference";
  matchKey: string;
  value: { estimateCents?: Cents | null; capCents?: Cents | null; notSpending?: boolean; category?: string | null; [k: string]: unknown };
  updatedAt: string;
}

export interface DecisionRow {
  id: string;
  subjectType: "event" | "purchase" | "statement" | "occurrence" | "question" | "scenario";
  subjectId: string | null;
  decision: string;
  detail: Record<string, unknown>;
  createdAt: string;
}

export interface ScenarioRow {
  id: string;
  name: string;
  adjustments: Adjustment[];
}

/** Everything the signed-in experience needs, in engine-friendly shape. */
export type CategoryGroup = "needs" | "wants" | "savings";

/** Your choices for a category: its group and, optionally, a budget you set yourself. */
export interface CategorySetting {
  name: string;
  group: CategoryGroup;
  monthlyBudgetCents: Cents | null;
  /** Your own symbol and color (a key from the icon set, "#rrggbb"). */
  icon?: string | null;
  color?: string | null;
}

export interface Snapshot {
  profile: Profile;
  settings: ForecastSettings;
  accounts: Account[];
  rules: RecurringRule[];
  overrides: OccurrenceOverride[];
  transactions: OneTimeTransaction[];
  transfers: Transfer[];
  statements: CardStatement[];
  goals: SavingsGoal[];
  calendarSources: CalendarSourceView[];
  calendarEvents: CalendarEvent[];
  corrections: CorrectionRow[];
  decisions: DecisionRow[];
  scenarios: ScenarioRow[];
  /** Missing before the categories update is applied, and in the demo. */
  categorySettings?: CategorySetting[];
  /** Categories you've set as not counted: their money isn't spending or income anywhere. */
  excludedCategories?: string[];
}

export const DEFAULT_SETTINGS: ForecastSettings = {
  cashFloorCents: 50_000,
  defaultHorizonDays: 30,
  staleAfterDays: 3,
  autoPayStatements: true,
  unseenPlansBufferPct: 15,
};

export function toEngineInput(s: Snapshot, today: ISODate): EngineInput {
  return {
    today,
    accounts: s.accounts,
    rules: s.rules,
    overrides: s.overrides,
    transactions: s.transactions,
    transfers: s.transfers,
    statements: s.statements,
    goals: s.goals,
    settings: s.settings,
    plans: s.calendarEvents
      .filter((e) => !e.cancelled && !e.duplicateOf && e.date >= today && e.decision !== "skip" && e.decision !== "postpone" && e.estimateSource !== "not_spending")
      .map((e) => ({ date: e.date, cents: Math.max(0, e.capCents ?? e.estimateCents ?? 0), paymentAccountId: e.paymentAccountId }))
      .filter((p) => p.cents > 0),
    everydayPay: String((s.corrections.find((c) => c.kind === "preference" && c.matchKey === "pay_everyday_with")?.value as { with?: string } | undefined)?.with ?? "auto"),
  };
}

export function emptySnapshot(): Snapshot {
  return {
    profile: { displayName: null, timezone: "America/New_York", onboardedAt: null, hideAmounts: false, theme: "system" },
    settings: DEFAULT_SETTINGS,
    accounts: [],
    rules: [],
    overrides: [],
    transactions: [],
    transfers: [],
    statements: [],
    goals: [],
    calendarSources: [],
    calendarEvents: [],
    corrections: [],
    decisions: [],
    scenarios: [],
  };
}
