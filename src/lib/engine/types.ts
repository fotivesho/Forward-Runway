import type { ISODate, WeekendAdjust } from "../dates";
import type { Cents } from "../money";

/**
 * Sign conventions used throughout the engine
 * -------------------------------------------
 * - All amounts are integer cents.
 * - Rule / transaction / transfer amounts are always POSITIVE; direction is explicit.
 * - Inside the engine every account has a "value": assets are positive,
 *   liabilities (credit cards, loans) are NEGATIVE (value = -amount owed).
 *   That way a card charge is just "value goes down" and a card payment is an
 *   ordinary transfer: checking value -X, card value +X. No special cases,
 *   and no way to count a card purchase against checking.
 * - Only accounts with `isSpendable === true` make up "cash". Credit cards and
 *   loans are never spendable, so a purchase on a card only affects cash when
 *   the card is actually paid.
 */

export type AccountKind = "checking" | "savings" | "cash" | "credit_card" | "loan";

export type BalanceSource = "manual" | "statement" | "import" | "onboarding";

export interface Account {
  id: string;
  name: string;
  kind: AccountKind;
  /** Assets: amount held. Liabilities: amount OWED (positive). null = unknown. */
  balanceCents: Cents | null;
  /** Balance is the opening balance at the START of this calendar day. */
  balanceAsOf: ISODate | null;
  balanceSource: BalanceSource;
  /** When the user last touched the balance (ISO timestamp), for freshness display. */
  balanceUpdatedAt: string | null;
  /** Counts toward spendable cash. Always false for cards and loans. */
  isSpendable: boolean;
  // Credit card fields
  creditLimitCents?: Cents | null;
  statementCloseDay?: number | null; // 1-31, -1 = last day
  paymentDueDay?: number | null; // 1-31, -1 = last day
  paymentAccountId?: string | null; // which cash account pays this card
  payInFull?: boolean; // default true
  // Card + loan
  aprBps?: number | null; // 2499 = 24.99%
  minimumPaymentCents?: Cents | null;
  archived?: boolean;
}

export type Frequency = "once" | "weekly" | "biweekly" | "monthly" | "semimonthly";

export interface Schedule {
  frequency: Frequency;
  /** First possible occurrence (anchor for weekly / biweekly). */
  startDate: ISODate;
  endDate?: ISODate | null;
  /** monthly: day of month (1-31, -1 = last day). Defaults to startDate's day. semimonthly: first day (default 1). */
  dayOfMonth?: number | null;
  /** semimonthly: second day (default 15). Use -1 for last day of month. */
  secondDayOfMonth?: number | null;
  weekendAdjust?: WeekendAdjust;
}

export type RuleKind =
  | "income"
  | "bill"
  | "subscription"
  | "loan_payment"
  | "savings_transfer"
  | "card_payment"
  | "transfer"
  | "expense";

export interface RecurringRule {
  id: string;
  name: string;
  kind: RuleKind;
  amountCents: Cents;
  /** Income: account receiving. Everything else: account the money leaves (may be a credit card for card-billed bills). */
  accountId: string;
  /** Set for transfers, savings transfers, loan payments, card payments. */
  toAccountId?: string | null;
  category?: string | null;
  schedule: Schedule;
  isEstimate?: boolean;
  active?: boolean;
}

export type OverrideAction = "skip" | "modify" | "posted";

export interface OccurrenceOverride {
  id: string;
  ruleId: string;
  originalDate: ISODate;
  /** skip: drop it. modify: change date/amount. posted: already reflected in the balance. */
  action: OverrideAction;
  newDate?: ISODate | null;
  amountCents?: Cents | null;
  note?: string | null;
}

export type TxnDirection = "in" | "out";

export interface OneTimeTransaction {
  id: string;
  date: ISODate;
  amountCents: Cents;
  /** Relative to the account: for a credit card "out" is a purchase, "in" is a refund. */
  direction: TxnDirection;
  accountId: string;
  description: string;
  category?: string | null;
  /** planned = expected; posted = it happened. */
  status: "planned" | "posted";
  /** Already reflected in the account balance the user entered → ignored by the forecast. */
  cleared?: boolean;
  isEstimate?: boolean;
  /** Discretionary spending (counts against the daily allowance in spending history). */
  flexible?: boolean;
  calendarEventId?: string | null;
}

export interface Transfer {
  id: string;
  date: ISODate;
  fromAccountId: string;
  toAccountId: string;
  amountCents: Cents;
  note?: string | null;
  cleared?: boolean;
  status?: "planned" | "posted";
}

export type StatementStatus = "unpaid" | "partial" | "paid";

export interface CardStatement {
  id: string;
  accountId: string;
  closingDate: ISODate;
  statementBalanceCents: Cents;
  minimumDueCents?: Cents | null;
  dueDate: ISODate;
  paidCents: Cents;
  status: StatementStatus;
}

export type GoalKind = "wedding" | "emergency" | "debt" | "other";

export interface SavingsGoal {
  id: string;
  name: string;
  kind: GoalKind;
  accountId: string | null;
  targetCents: Cents;
  targetDate?: ISODate | null;
  /** Planned contribution per month. If no transfer rule funds it, the advisor reserves it. */
  monthlyContributionCents?: Cents | null;
  /** Protected goals are never suggested as a funding source unless the user opts in. */
  protected?: boolean;
}

export interface ForecastSettings {
  cashFloorCents: Cents;
  defaultHorizonDays: 30 | 60 | 90;
  /** Spendable balances older than this many days are "stale". */
  staleAfterDays: number;
  /** Auto-schedule "pay statement in full" on the due date when no payment is scheduled. */
  autoPayStatements: boolean;
  /** Share of the flexible pool held back when calendars can't be fully read (0-50). */
  unseenPlansBufferPct: number;
}

export interface EngineInput {
  today: ISODate;
  accounts: Account[];
  rules: RecurringRule[];
  overrides: OccurrenceOverride[];
  transactions: OneTimeTransaction[];
  transfers: Transfer[];
  statements: CardStatement[];
  goals: SavingsGoal[];
  settings: ForecastSettings;
}

export type ItemSource =
  | "rule"
  | "one_time"
  | "transfer"
  | "card_statement"
  | "card_projected"
  | "goal_reserve"
  | "scenario";

export type ItemKind = RuleKind | "card_purchase" | "refund" | "goal_reserve";

export interface Posting {
  accountId: string;
  deltaCents: Cents; // change in account VALUE (see conventions above)
}

export interface ForecastItem {
  id: string;
  date: ISODate;
  label: string;
  kind: ItemKind;
  source: ItemSource;
  sourceId: string;
  category?: string | null;
  postings: Posting[];
  /** Net effect on spendable cash (sum of postings on spendable accounts). */
  cashEffectCents: Cents;
  isEstimate: boolean;
  /** Original scheduled date when an override moved it. */
  movedFrom?: ISODate;
  note?: string;
}

export interface ForecastDay {
  date: ISODate;
  openingCents: Cents;
  inflowsCents: Cents;
  /** Positive number. */
  outflowsCents: Cents;
  closingCents: Cents;
  /** Items that change cash today. */
  items: ForecastItem[];
  /** Items dated today that do NOT change cash (card purchases, transfers between cash accounts, savings moves within non-cash). */
  nonCashItems: ForecastItem[];
  belowFloor: boolean;
  negative: boolean;
}

export type IssueSeverity = "critical" | "warning" | "info";

export interface ForecastIssue {
  code:
    | "no_cash_account"
    | "missing_balance"
    | "stale_balance"
    | "no_income"
    | "card_missing_dates"
    | "card_no_statement"
    | "card_stale_balance"
    | "goal_no_account"
    | "estimates_present"
    | "balance_gap";
  severity: IssueSeverity;
  /** True when this issue means the forecast cannot be trusted as complete. */
  makesIncomplete: boolean;
  message: string;
  /** One focused question the app can ask to resolve it. */
  question?: string;
  accountId?: string;
  goalId?: string;
}

export interface CardProjection {
  accountId: string;
  name: string;
  currentOwedCents: Cents;
  creditLimitCents: Cents | null;
  statements: Array<{
    closingDate: ISODate;
    dueDate: ISODate;
    balanceCents: Cents;
    paidOrScheduledCents: Cents;
    autoPaymentCents: Cents;
    isProjected: boolean;
    status: StatementStatus | "projected";
    statementId?: string;
  }>;
  /** Purchases charged to this card within the horizon (never subtracted from cash). */
  projectedChargesCents: Cents;
}

export interface Forecast {
  startDate: ISODate;
  endDate: ISODate;
  horizonDays: number;
  cashAccountIds: string[];
  startingCashCents: Cents;
  endingCashCents: Cents;
  totalInflowsCents: Cents;
  totalOutflowsCents: Cents;
  lowest: { date: ISODate; cents: Cents };
  firstBelowFloor: ISODate | null;
  firstNegative: ISODate | null;
  floorCents: Cents;
  days: ForecastDay[];
  /** Opening value of every account at the start date. */
  openingByAccount: Record<string, Cents>;
  /** Closing value of every account at the end date. */
  closingByAccount: Record<string, Cents>;
  cards: CardProjection[];
  assumptions: string[];
  issues: ForecastIssue[];
  /** false when any critical issue exists (missing/stale balance, no income...). */
  complete: boolean;
}
