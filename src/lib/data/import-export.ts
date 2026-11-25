import { z } from "zod";
import { isISODate } from "../dates";
import type { Snapshot } from "./snapshot";

export const EXPORT_FORMAT = "runway-tomorrow";
/** Files exported before the rename still import. */
export const LEGACY_EXPORT_FORMATS = ["forward-runway"] as const;
export const EXPORT_VERSION = 1;
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 5_000;

/** Export everything except secrets (calendar addresses are never exported). */
export function buildExport(s: Snapshot, exportedAt: string) {
  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt,
    note: "Amounts are integer US cents. Dates are calendar dates (YYYY-MM-DD). Calendar subscription addresses are not included.",
    profile: { displayName: s.profile.displayName, timezone: s.profile.timezone, hideAmounts: s.profile.hideAmounts, theme: s.profile.theme },
    settings: s.settings,
    accounts: s.accounts,
    rules: s.rules,
    overrides: s.overrides,
    transactions: s.transactions,
    transfers: s.transfers,
    statements: s.statements,
    goals: s.goals,
    calendarEvents: s.calendarEvents.map(({ sourceId: _s, externalUid: _e, ...rest }) => rest),
    corrections: s.corrections.map(({ id: _id, updatedAt: _u, ...rest }) => rest),
    decisions: s.decisions.map(({ id: _id, ...rest }) => rest),
    scenarios: s.scenarios,
  };
}

const id = z.string().min(1).max(100);
const cents = z.number().int().safe();
const posCents = cents.positive();
const date = z.string().refine(isISODate, "Invalid date");
const nullableDate = date.nullable().optional();
const dom = z.number().int().refine((d) => d === -1 || (d >= 1 && d <= 31)).nullable().optional();
const list = <T extends z.ZodTypeAny>(t: T) => z.array(t).max(MAX_ROWS).default([]);

const accountZ = z.object({
  id,
  name: z.string().min(1).max(60),
  kind: z.enum(["checking", "savings", "cash", "credit_card", "loan"]),
  balanceCents: cents.nullable(),
  balanceAsOf: nullableDate,
  balanceSource: z.enum(["manual", "statement", "import", "onboarding"]).optional(),
  isSpendable: z.boolean(),
  creditLimitCents: cents.nonnegative().nullable().optional(),
  statementCloseDay: dom,
  paymentDueDay: dom,
  paymentAccountId: id.nullable().optional(),
  payInFull: z.boolean().optional(),
  aprBps: z.number().int().min(0).max(10_000).nullable().optional(),
  minimumPaymentCents: cents.nonnegative().nullable().optional(),
  archived: z.boolean().optional(),
});

const ruleZ = z.object({
  id,
  name: z.string().min(1).max(80),
  kind: z.enum(["income", "bill", "subscription", "loan_payment", "savings_transfer", "card_payment", "transfer", "expense"]),
  amountCents: posCents,
  accountId: id,
  toAccountId: id.nullable().optional(),
  category: z.string().max(40).nullable().optional(),
  schedule: z.object({
    frequency: z.enum(["once", "weekly", "biweekly", "monthly", "semimonthly"]),
    startDate: date,
    endDate: nullableDate,
    dayOfMonth: dom,
    secondDayOfMonth: dom,
    weekendAdjust: z.enum(["none", "before", "after"]).optional(),
  }),
  isEstimate: z.boolean().optional(),
  active: z.boolean().optional(),
});

const overrideZ = z.object({
  id,
  ruleId: id,
  originalDate: date,
  action: z.enum(["skip", "modify", "posted"]),
  newDate: nullableDate,
  amountCents: posCents.nullable().optional(),
  note: z.string().max(200).nullable().optional(),
});

const txnZ = z.object({
  id,
  date,
  amountCents: posCents,
  direction: z.enum(["in", "out"]),
  accountId: id,
  description: z.string().min(1).max(120),
  category: z.string().max(40).nullable().optional(),
  status: z.enum(["planned", "posted"]),
  cleared: z.boolean().optional(),
  isEstimate: z.boolean().optional(),
  flexible: z.boolean().optional(),
});

const transferZ = z.object({
  id,
  date,
  fromAccountId: id,
  toAccountId: id,
  amountCents: posCents,
  note: z.string().max(120).nullable().optional(),
  cleared: z.boolean().optional(),
  status: z.enum(["planned", "posted"]).optional(),
});

const statementZ = z.object({
  id,
  accountId: id,
  closingDate: date,
  statementBalanceCents: cents.nonnegative(),
  minimumDueCents: cents.nonnegative().nullable().optional(),
  dueDate: date,
  paidCents: cents.nonnegative(),
  status: z.enum(["unpaid", "partial", "paid"]),
});

const goalZ = z.object({
  id,
  name: z.string().min(1).max(60),
  kind: z.enum(["wedding", "emergency", "debt", "other"]),
  accountId: id.nullable(),
  targetCents: posCents,
  targetDate: nullableDate,
  monthlyContributionCents: cents.nonnegative().nullable().optional(),
  protected: z.boolean().optional(),
});

const eventZ = z.object({
  id,
  date,
  title: z.string().min(1).max(200),
  location: z.string().max(200).nullable().optional(),
  cancelled: z.boolean().optional(),
  estimateCents: cents.nonnegative().nullable().optional(),
  estimateSource: z.string().nullable().optional(),
  estimateConfirmed: z.boolean().optional(),
  category: z.string().max(40).nullable().optional(),
  capCents: cents.nonnegative().nullable().optional(),
  decision: z.enum(["proceed", "cheaper", "postpone", "skip"]).nullable().optional(),
  essential: z.boolean().optional(),
  paymentAccountId: id.nullable().optional(),
  userCorrected: z.boolean().optional(),
});

const correctionZ = z.object({
  kind: z.enum(["event_estimate", "category_rename", "preference"]),
  matchKey: z.string().min(1).max(200),
  value: z.record(z.unknown()),
});

const decisionZ = z.object({
  subjectType: z.enum(["event", "purchase", "statement", "occurrence", "question", "scenario"]),
  subjectId: z.string().max(200).nullable().optional(),
  decision: z.string().min(1).max(60),
  detail: z.record(z.unknown()).optional(),
  createdAt: z.string().optional(),
});

const scenarioZ = z.object({ id, name: z.string().min(1).max(60), adjustments: z.array(z.record(z.unknown())).max(200) });

export const exportFileSchema = z.object({
  format: z.enum([EXPORT_FORMAT, ...LEGACY_EXPORT_FORMATS], { errorMap: () => ({ message: "This isn't a Runway Tomorrow export file." }) }),
  version: z.literal(EXPORT_VERSION, { errorMap: () => ({ message: "This export was made by an unsupported version." }) }),
  profile: z.object({ displayName: z.string().max(80).nullable().optional(), timezone: z.string().max(64).optional(), hideAmounts: z.boolean().optional(), theme: z.enum(["system", "light", "dark"]).optional() }).optional(),
  settings: z
    .object({
      cashFloorCents: cents.nonnegative(),
      defaultHorizonDays: z.union([z.literal(30), z.literal(60), z.literal(90)]),
      staleAfterDays: z.number().int().min(1).max(60),
      autoPayStatements: z.boolean(),
      unseenPlansBufferPct: z.number().int().min(0).max(50),
    })
    .optional(),
  accounts: list(accountZ),
  rules: list(ruleZ),
  overrides: list(overrideZ),
  transactions: list(txnZ),
  transfers: list(transferZ),
  statements: list(statementZ),
  goals: list(goalZ),
  calendarEvents: list(eventZ),
  corrections: list(correctionZ),
  decisions: list(decisionZ),
  scenarios: list(scenarioZ),
});

export type ExportFile = z.infer<typeof exportFileSchema>;

export interface ImportRows {
  profile: Record<string, unknown> | null;
  settings: Record<string, unknown> | null;
  accounts: Record<string, unknown>[];
  /** Applied after all accounts exist (self-references). */
  accountPaymentLinks: Array<{ id: string; payment_account_id: string }>;
  rules: Record<string, unknown>[];
  overrides: Record<string, unknown>[];
  transactions: Record<string, unknown>[];
  transfers: Record<string, unknown>[];
  statements: Record<string, unknown>[];
  goals: Record<string, unknown>[];
  calendarEvents: Record<string, unknown>[];
  corrections: Record<string, unknown>[];
  decisions: Record<string, unknown>[];
  scenarios: Record<string, unknown>[];
}

export type ParseImportResult = { ok: true; rows: ImportRows; counts: Record<string, number> } | { ok: false; error: string };

/**
 * Validate an export file and turn it into insert-ready rows with fresh IDs.
 * References are remapped consistently; a reference to an ID that isn't in
 * the file is an error (we never guess).
 */
export function parseImport(text: string, newId: () => string): ParseImportResult {
  if (text.length > MAX_IMPORT_BYTES) return { ok: false, error: "That file is larger than 5 MB." };
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, error: "That file isn't valid JSON." };
  }
  const parsed = exportFileSchema.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0]!;
    const where = issue.path.length ? ` (at ${issue.path.join(".")})` : "";
    return { ok: false, error: `${issue.message}${where}` };
  }
  const f = parsed.data;
  const accountIds = new Map<string, string>();
  const ruleIds = new Map<string, string>();
  for (const a of f.accounts) accountIds.set(a.id, newId());
  for (const r of f.rules) ruleIds.set(r.id, newId());

  const missing: string[] = [];
  const acct = (old: string | null | undefined, where: string): string | null => {
    if (old == null) return null;
    const m = accountIds.get(old);
    if (!m) missing.push(`${where} refers to an account that isn't in the file`);
    return m ?? null;
  };

  const rows: ImportRows = {
    profile: f.profile
      ? { display_name: f.profile.displayName ?? null, timezone: f.profile.timezone ?? "America/New_York", hide_amounts: !!f.profile.hideAmounts, theme: f.profile.theme ?? "system" }
      : null,
    settings: f.settings
      ? {
          cash_floor_cents: f.settings.cashFloorCents,
          default_horizon_days: f.settings.defaultHorizonDays,
          stale_after_days: f.settings.staleAfterDays,
          auto_pay_statements: f.settings.autoPayStatements,
          unseen_plans_buffer_pct: f.settings.unseenPlansBufferPct,
        }
      : null,
    accounts: f.accounts.map((a) => {
      const liability = a.kind === "credit_card" || a.kind === "loan";
      return {
        id: accountIds.get(a.id),
        name: a.name,
        kind: a.kind,
        balance_cents: a.balanceCents,
        balance_as_of: a.balanceCents == null ? null : (a.balanceAsOf ?? null),
        balance_source: "import",
        is_spendable: liability ? false : a.isSpendable,
        credit_limit_cents: a.creditLimitCents ?? null,
        statement_close_day: a.statementCloseDay ?? null,
        payment_due_day: a.paymentDueDay ?? null,
        pay_in_full: a.payInFull !== false,
        apr_bps: a.aprBps ?? null,
        minimum_payment_cents: a.minimumPaymentCents ?? null,
        archived: !!a.archived,
      };
    }),
    accountPaymentLinks: f.accounts
      .filter((a) => a.paymentAccountId)
      .map((a) => ({ id: accountIds.get(a.id)!, payment_account_id: acct(a.paymentAccountId, `Account "${a.name}"`)! })),
    rules: f.rules.map((r) => ({
      id: ruleIds.get(r.id),
      name: r.name,
      kind: r.kind,
      amount_cents: r.amountCents,
      account_id: acct(r.accountId, `Recurring item "${r.name}"`),
      to_account_id: acct(r.toAccountId, `Recurring item "${r.name}"`),
      category: r.category ?? null,
      frequency: r.schedule.frequency,
      start_date: r.schedule.startDate,
      end_date: r.schedule.endDate ?? null,
      day_of_month: r.schedule.dayOfMonth ?? null,
      second_day_of_month: r.schedule.secondDayOfMonth ?? null,
      weekend_adjust: r.schedule.weekendAdjust ?? "none",
      is_estimate: !!r.isEstimate,
      active: r.active !== false,
    })),
    overrides: f.overrides.map((o) => {
      const rid = ruleIds.get(o.ruleId);
      if (!rid) missing.push("An occurrence change refers to a recurring item that isn't in the file");
      return {
        rule_id: rid,
        original_date: o.originalDate,
        action: o.action,
        new_date: o.newDate ?? null,
        amount_cents: o.amountCents ?? null,
        note: o.note ?? null,
      };
    }),
    transactions: f.transactions.map((t) => ({
      date: t.date,
      amount_cents: t.amountCents,
      direction: t.direction,
      account_id: acct(t.accountId, `Transaction "${t.description}"`),
      description: t.description,
      category: t.category ?? null,
      status: t.status,
      cleared: !!t.cleared,
      is_estimate: !!t.isEstimate,
      flexible: t.flexible !== false,
    })),
    transfers: f.transfers.map((t) => ({
      date: t.date,
      amount_cents: t.amountCents,
      from_account_id: acct(t.fromAccountId, "A transfer"),
      to_account_id: acct(t.toAccountId, "A transfer"),
      note: t.note ?? null,
      status: t.status ?? "planned",
      cleared: !!t.cleared,
    })),
    statements: f.statements.map((s) => ({
      account_id: acct(s.accountId, "A card statement"),
      closing_date: s.closingDate,
      statement_balance_cents: s.statementBalanceCents,
      minimum_due_cents: s.minimumDueCents ?? null,
      due_date: s.dueDate,
      paid_cents: s.paidCents,
      status: s.status,
    })),
    goals: f.goals.map((g) => ({
      name: g.name,
      kind: g.kind,
      account_id: acct(g.accountId, `Goal "${g.name}"`),
      target_cents: g.targetCents,
      target_date: g.targetDate ?? null,
      monthly_contribution_cents: g.monthlyContributionCents ?? null,
      protected: g.protected !== false,
    })),
    calendarEvents: f.calendarEvents.map((e) => ({
      date: e.date,
      title: e.title,
      location: e.location ?? null,
      cancelled: !!e.cancelled,
      estimate_cents: e.estimateCents ?? null,
      estimate_source: e.estimateSource ?? null,
      estimate_confirmed: !!e.estimateConfirmed,
      category: e.category ?? null,
      cap_cents: e.capCents ?? null,
      decision: e.decision ?? null,
      essential: !!e.essential,
      payment_account_id: acct(e.paymentAccountId, `Event "${e.title}"`),
      user_corrected: !!e.userCorrected,
    })),
    corrections: f.corrections.map((c) => ({ kind: c.kind, match_key: c.matchKey, value: c.value })),
    decisions: f.decisions.map((d) => ({
      subject_type: d.subjectType,
      subject_id: d.subjectId ?? null,
      decision: d.decision,
      detail: d.detail ?? {},
      ...(d.createdAt ? { created_at: d.createdAt } : {}),
    })),
    scenarios: f.scenarios.map((s) => ({ name: s.name, adjustments: remapAdjustments(s.adjustments, accountIds, ruleIds) })),
  };
  if (missing.length) return { ok: false, error: missing[0]! };
  // Fields where the database enforces "both accounts must differ" etc. are left to it.
  const counts = Object.fromEntries(
    (["accounts", "rules", "transactions", "transfers", "statements", "goals", "calendarEvents"] as const).map((k) => [k, rows[k].length]),
  );
  return { ok: true, rows, counts };
}

function remapAdjustments(adjs: Record<string, unknown>[], accounts: Map<string, string>, rules: Map<string, string>) {
  return adjs.map((a) => {
    const out = { ...a };
    if (typeof out.accountId === "string") out.accountId = accounts.get(out.accountId) ?? out.accountId;
    if (typeof out.ruleId === "string") out.ruleId = rules.get(out.ruleId) ?? out.ruleId;
    return out;
  });
}
