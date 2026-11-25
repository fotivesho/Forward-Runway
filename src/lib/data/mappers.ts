/* Database row <-> app shape mapping. Rows are snake_case; bigint cents arrive as numbers or strings. */
import type { Adjustment } from "../engine/scenario";
import type {
  Account,
  CardStatement,
  ForecastSettings,
  OccurrenceOverride,
  OneTimeTransaction,
  RecurringRule,
  SavingsGoal,
  Transfer,
} from "../engine/types";
import type {
  CalendarEvent,
  CalendarSourceView,
  CorrectionRow,
  DecisionRow,
  Profile,
  ScenarioRow,
} from "./snapshot";

type Row = Record<string, unknown>;

const n = (v: unknown): number | null => (v == null ? null : Number(v));
const nn = (v: unknown): number => Number(v ?? 0);
const s = (v: unknown): string | null => (v == null ? null : String(v));

export function urlHint(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url.replace(/^webcal:/i, "https:")).host;
  } catch {
    return null;
  }
}

export const mapProfile = (r: Row | null): Profile => ({
  displayName: s(r?.display_name),
  timezone: (r?.timezone as string) || "America/New_York",
  onboardedAt: s(r?.onboarded_at),
  hideAmounts: !!r?.hide_amounts,
});

export const mapSettings = (r: Row | null, fallback: ForecastSettings): ForecastSettings =>
  r
    ? {
        cashFloorCents: nn(r.cash_floor_cents),
        defaultHorizonDays: ([30, 60, 90].includes(nn(r.default_horizon_days)) ? nn(r.default_horizon_days) : 30) as 30 | 60 | 90,
        staleAfterDays: nn(r.stale_after_days) || 3,
        autoPayStatements: r.auto_pay_statements !== false,
        unseenPlansBufferPct: nn(r.unseen_plans_buffer_pct),
      }
    : fallback;

export const mapAccount = (r: Row): Account => ({
  id: String(r.id),
  name: String(r.name),
  kind: r.kind as Account["kind"],
  balanceCents: n(r.balance_cents),
  balanceAsOf: s(r.balance_as_of),
  balanceSource: (r.balance_source as Account["balanceSource"]) ?? "manual",
  balanceUpdatedAt: s(r.balance_updated_at),
  isSpendable: !!r.is_spendable,
  creditLimitCents: n(r.credit_limit_cents),
  statementCloseDay: n(r.statement_close_day),
  paymentDueDay: n(r.payment_due_day),
  paymentAccountId: s(r.payment_account_id),
  payInFull: r.pay_in_full !== false,
  aprBps: n(r.apr_bps),
  minimumPaymentCents: n(r.minimum_payment_cents),
  archived: !!r.archived,
});

export const mapRule = (r: Row): RecurringRule => ({
  id: String(r.id),
  name: String(r.name),
  kind: r.kind as RecurringRule["kind"],
  amountCents: nn(r.amount_cents),
  accountId: String(r.account_id),
  toAccountId: s(r.to_account_id),
  category: s(r.category),
  schedule: {
    frequency: r.frequency as RecurringRule["schedule"]["frequency"],
    startDate: String(r.start_date),
    endDate: s(r.end_date),
    dayOfMonth: n(r.day_of_month),
    secondDayOfMonth: n(r.second_day_of_month),
    weekendAdjust: (r.weekend_adjust as "none" | "before" | "after") ?? "none",
  },
  isEstimate: !!r.is_estimate,
  active: r.active !== false,
});

export const mapOverride = (r: Row): OccurrenceOverride => ({
  id: String(r.id),
  ruleId: String(r.rule_id),
  originalDate: String(r.original_date),
  action: r.action as OccurrenceOverride["action"],
  newDate: s(r.new_date),
  amountCents: n(r.amount_cents),
  note: s(r.note),
});

export const mapTransaction = (r: Row): OneTimeTransaction => ({
  id: String(r.id),
  date: String(r.date),
  amountCents: nn(r.amount_cents),
  direction: r.direction as "in" | "out",
  accountId: String(r.account_id),
  description: String(r.description),
  category: s(r.category),
  status: r.status as "planned" | "posted",
  cleared: !!r.cleared,
  isEstimate: !!r.is_estimate,
  flexible: r.flexible !== false,
  calendarEventId: s(r.calendar_event_id),
});

export const mapTransfer = (r: Row): Transfer => ({
  id: String(r.id),
  date: String(r.date),
  fromAccountId: String(r.from_account_id),
  toAccountId: String(r.to_account_id),
  amountCents: nn(r.amount_cents),
  note: s(r.note),
  cleared: !!r.cleared,
  status: (r.status as "planned" | "posted") ?? "planned",
});

export const mapStatement = (r: Row): CardStatement => ({
  id: String(r.id),
  accountId: String(r.account_id),
  closingDate: String(r.closing_date),
  statementBalanceCents: nn(r.statement_balance_cents),
  minimumDueCents: n(r.minimum_due_cents),
  dueDate: String(r.due_date),
  paidCents: nn(r.paid_cents),
  status: r.status as CardStatement["status"],
});

export const mapGoal = (r: Row): SavingsGoal => ({
  id: String(r.id),
  name: String(r.name),
  kind: r.kind as SavingsGoal["kind"],
  accountId: s(r.account_id),
  targetCents: nn(r.target_cents),
  targetDate: s(r.target_date),
  monthlyContributionCents: n(r.monthly_contribution_cents),
  protected: r.protected !== false,
});

export const mapCalendarSource = (r: Row): CalendarSourceView => ({
  id: String(r.id),
  name: String(r.name),
  kind: (r.kind as CalendarSourceView["kind"]) ?? "ics_url",
  enabled: r.enabled !== false,
  lastStatus: (r.last_status as CalendarSourceView["lastStatus"]) ?? "never",
  lastSyncedAt: s(r.last_synced_at),
  lastAttemptAt: s(r.last_attempt_at),
  lastError: s(r.last_error),
  eventCount: nn(r.event_count),
  urlHint: urlHint(s(r.ics_url)),
});

export const mapCalendarEvent = (r: Row): CalendarEvent => ({
  id: String(r.id),
  sourceId: s(r.source_id),
  externalUid: s(r.external_uid),
  date: String(r.date),
  title: String(r.title),
  location: s(r.location),
  cancelled: !!r.cancelled,
  estimateCents: n(r.estimate_cents),
  estimateSource: (r.estimate_source as CalendarEvent["estimateSource"]) ?? null,
  estimateConfirmed: !!r.estimate_confirmed,
  category: s(r.category),
  capCents: n(r.cap_cents),
  decision: (r.decision as CalendarEvent["decision"]) ?? null,
  essential: !!r.essential,
  paymentAccountId: s(r.payment_account_id),
  duplicateOf: s(r.duplicate_of),
  duplicateConfirmed: !!r.duplicate_confirmed,
  notDuplicateOf: Array.isArray(r.not_duplicate_of) ? (r.not_duplicate_of as string[]) : [],
  missingFromFeed: !!r.missing_from_feed,
  userCorrected: !!r.user_corrected,
});

export const mapCorrection = (r: Row): CorrectionRow => ({
  id: String(r.id),
  kind: r.kind as CorrectionRow["kind"],
  matchKey: String(r.match_key),
  value: (r.value as CorrectionRow["value"]) ?? {},
  updatedAt: String(r.updated_at ?? r.created_at ?? ""),
});

export const mapDecision = (r: Row): DecisionRow => ({
  id: String(r.id),
  subjectType: r.subject_type as DecisionRow["subjectType"],
  subjectId: s(r.subject_id),
  decision: String(r.decision),
  detail: (r.detail as Record<string, unknown>) ?? {},
  createdAt: String(r.created_at),
});

export const mapScenario = (r: Row): ScenarioRow => ({
  id: String(r.id),
  name: String(r.name),
  adjustments: (Array.isArray(r.adjustments) ? r.adjustments : []) as Adjustment[],
});
