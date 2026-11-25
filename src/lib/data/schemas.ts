import { z } from "zod";
import { isISODate } from "../dates";
import { parseDollars } from "../money";

/* ---------------------------------------------------------------------------
 * Field helpers. Forms post strings; these turn them into validated values
 * with messages written for people, not developers.
 * ------------------------------------------------------------------------- */

const emptyToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);

export const money = (label: string, opts: { min?: number; allowNegative?: boolean } = {}) =>
  z
    .string({ required_error: `Enter ${label}.` })
    .trim()
    .min(1, `Enter ${label}.`)
    .transform((v, ctx) => {
      const cents = parseDollars(v);
      if (cents == null) {
        ctx.addIssue({ code: "custom", message: `Enter ${label} as dollars and cents, like 1250.00.` });
        return z.NEVER;
      }
      if (!opts.allowNegative && cents < 0) {
        ctx.addIssue({ code: "custom", message: `${capitalize(label)} can't be negative.` });
        return z.NEVER;
      }
      if (opts.min != null && cents < opts.min) {
        ctx.addIssue({ code: "custom", message: `${capitalize(label)} must be at least $${(opts.min / 100).toFixed(2)}.` });
        return z.NEVER;
      }
      if (Math.abs(cents) > 100_000_000_00) {
        ctx.addIssue({ code: "custom", message: `${capitalize(label)} looks too large.` });
        return z.NEVER;
      }
      return cents;
    });

export const optionalMoney = (label: string) => z.preprocess(emptyToUndefined, money(label).optional());

export const date = (label: string) =>
  z
    .string({ required_error: `Choose ${label}.` })
    .trim()
    .refine((v) => isISODate(v), `Choose a valid ${label}.`);

export const optionalDate = (label: string) => z.preprocess(emptyToUndefined, date(label).optional());

export const dayOfMonth = (label: string) =>
  z.preprocess(
    emptyToUndefined,
    z.coerce
      .number({ invalid_type_error: `${capitalize(label)} must be a day from 1 to 31, or "last".` })
      .int()
      .refine((d) => d === -1 || (d >= 1 && d <= 31), `${capitalize(label)} must be a day from 1 to 31, or "last".`)
      .optional(),
  );

export const checkbox = z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean());

const uuid = (label: string) => z.string({ required_error: `Choose ${label}.` }).uuid(`Choose ${label}.`);
const optionalUuid = z.preprocess(emptyToUndefined, z.string().uuid().optional());
const text = (label: string, max: number) =>
  z.string({ required_error: `Enter ${label}.` }).trim().min(1, `Enter ${label}.`).max(max, `${capitalize(label)} must be ${max} characters or fewer.`);
const optionalText = (max: number) => z.preprocess(emptyToUndefined, z.string().trim().max(max, `Keep this under ${max} characters.`).optional());

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export const percentToBps = z.preprocess(
  emptyToUndefined,
  z
    .string()
    .trim()
    .regex(/^\d{1,3}(\.\d{1,2})?$/, "Enter the APR as a percentage, like 24.99.")
    .transform((v) => Math.round(Number(v) * 100))
    .refine((bps) => bps <= 10_000, "APR must be 100% or less.")
    .optional(),
);

/* ---------------------------------------------------------------------------
 * Entity schemas
 * ------------------------------------------------------------------------- */

export const ACCOUNT_KINDS = ["checking", "savings", "cash", "credit_card", "loan"] as const;

export const accountSchema = z
  .object({
    id: optionalUuid,
    name: text("an account name", 60),
    kind: z.enum(ACCOUNT_KINDS, { errorMap: () => ({ message: "Choose an account type." }) }),
    balance: optionalMoney("the balance"),
    balanceAsOf: optionalDate("balance date"),
    isSpendable: checkbox,
    creditLimit: optionalMoney("the credit limit"),
    statementCloseDay: dayOfMonth("statement closing day"),
    paymentDueDay: dayOfMonth("payment due day"),
    paymentAccountId: optionalUuid,
    payInFull: checkbox,
    apr: percentToBps,
    minimumPayment: optionalMoney("the minimum payment"),
  })
  .superRefine((v, ctx) => {
    if (v.balance != null && !v.balanceAsOf) ctx.addIssue({ code: "custom", path: ["balanceAsOf"], message: "Choose the date this balance is from." });
  })
  .transform((v) => {
    const liability = v.kind === "credit_card" || v.kind === "loan";
    return {
      id: v.id,
      row: {
        name: v.name,
        kind: v.kind,
        balance_cents: v.balance ?? null,
        balance_as_of: v.balance != null ? v.balanceAsOf! : null,
        is_spendable: liability ? false : v.isSpendable,
        credit_limit_cents: v.kind === "credit_card" ? (v.creditLimit ?? null) : null,
        statement_close_day: v.kind === "credit_card" ? (v.statementCloseDay ?? null) : null,
        payment_due_day: v.kind === "credit_card" || v.kind === "loan" ? (v.paymentDueDay ?? null) : null,
        payment_account_id: liability ? (v.paymentAccountId ?? null) : null,
        pay_in_full: v.kind === "credit_card" ? v.payInFull : true,
        apr_bps: liability ? (v.apr ?? null) : null,
        minimum_payment_cents: liability ? (v.minimumPayment ?? null) : null,
      },
    };
  });

export const balanceUpdateSchema = z.object({
  accountId: uuid("an account"),
  balance: money("the balance"),
  balanceAsOf: date("balance date"),
});

export const RULE_KINDS = ["income", "bill", "subscription", "loan_payment", "savings_transfer", "card_payment", "transfer", "expense"] as const;
export const FREQUENCIES = ["once", "weekly", "biweekly", "monthly", "semimonthly"] as const;
const TRANSFER_KINDS = new Set(["loan_payment", "savings_transfer", "card_payment", "transfer"]);

export const ruleSchema = z
  .object({
    id: optionalUuid,
    name: text("a name", 80),
    kind: z.enum(RULE_KINDS, { errorMap: () => ({ message: "Choose what kind of item this is." }) }),
    amount: money("the amount", { min: 1 }),
    accountId: uuid("the account"),
    toAccountId: optionalUuid,
    category: optionalText(40),
    frequency: z.enum(FREQUENCIES, { errorMap: () => ({ message: "Choose how often it happens." }) }),
    startDate: date("start date"),
    endDate: optionalDate("end date"),
    dayOfMonth: dayOfMonth("day of month"),
    secondDayOfMonth: dayOfMonth("second day of month"),
    weekendAdjust: z.enum(["none", "before", "after"]).default("none"),
    isEstimate: checkbox,
  })
  .superRefine((v, ctx) => {
    if (TRANSFER_KINDS.has(v.kind) && !v.toAccountId)
      ctx.addIssue({ code: "custom", path: ["toAccountId"], message: "Choose where the money goes." });
    if (v.toAccountId && v.toAccountId === v.accountId)
      ctx.addIssue({ code: "custom", path: ["toAccountId"], message: "Choose a different account than the one the money comes from." });
    if (v.endDate && v.endDate < v.startDate) ctx.addIssue({ code: "custom", path: ["endDate"], message: "End date must be on or after the start date." });
  })
  .transform((v) => ({
    id: v.id,
    row: {
      name: v.name,
      kind: v.kind,
      amount_cents: v.amount,
      account_id: v.accountId,
      to_account_id: v.kind === "income" ? null : TRANSFER_KINDS.has(v.kind) ? v.toAccountId! : null,
      category: v.category ?? null,
      frequency: v.frequency,
      start_date: v.startDate,
      end_date: v.frequency === "once" ? null : (v.endDate ?? null),
      day_of_month: v.frequency === "monthly" || v.frequency === "semimonthly" ? (v.dayOfMonth ?? null) : null,
      second_day_of_month: v.frequency === "semimonthly" ? (v.secondDayOfMonth ?? null) : null,
      weekend_adjust: v.weekendAdjust,
      is_estimate: v.isEstimate,
    },
  }));

export const overrideSchema = z
  .object({
    ruleId: uuid("the recurring item"),
    originalDate: date("scheduled date"),
    action: z.enum(["skip", "modify", "posted", "reset"]),
    newDate: optionalDate("new date"),
    amount: optionalMoney("the amount"),
    note: optionalText(200),
  })
  .superRefine((v, ctx) => {
    if (v.action === "modify" && !v.newDate && v.amount == null)
      ctx.addIssue({ code: "custom", path: ["amount"], message: "Change the date or the amount (or both)." });
    if (v.amount != null && v.amount <= 0) ctx.addIssue({ code: "custom", path: ["amount"], message: "Amount must be more than $0." });
  });

export const transactionSchema = z
  .object({
    id: optionalUuid,
    date: date("date"),
    amount: money("the amount", { min: 1 }),
    direction: z.enum(["in", "out"], { errorMap: () => ({ message: "Choose money in or money out." }) }),
    accountId: uuid("the account"),
    description: text("a description", 120),
    category: optionalText(40),
    status: z.enum(["planned", "posted"]).default("posted"),
    cleared: checkbox,
    isEstimate: checkbox,
    flexible: checkbox,
    calendarEventId: optionalUuid,
  })
  .transform((v) => ({
    id: v.id,
    row: {
      date: v.date,
      amount_cents: v.amount,
      direction: v.direction,
      account_id: v.accountId,
      description: v.description,
      category: v.category ?? null,
      status: v.status,
      cleared: v.cleared,
      is_estimate: v.isEstimate,
      flexible: v.direction === "out" ? v.flexible : false,
      calendar_event_id: v.calendarEventId ?? null,
    },
  }));

export const transferSchema = z
  .object({
    id: optionalUuid,
    date: date("date"),
    amount: money("the amount", { min: 1 }),
    fromAccountId: uuid("the account money comes from"),
    toAccountId: uuid("the account money goes to"),
    note: optionalText(120),
    status: z.enum(["planned", "posted"]).default("planned"),
    cleared: checkbox,
  })
  .superRefine((v, ctx) => {
    if (v.fromAccountId === v.toAccountId) ctx.addIssue({ code: "custom", path: ["toAccountId"], message: "Choose two different accounts." });
  })
  .transform((v) => ({
    id: v.id,
    row: {
      date: v.date,
      amount_cents: v.amount,
      from_account_id: v.fromAccountId,
      to_account_id: v.toAccountId,
      note: v.note ?? null,
      status: v.status,
      cleared: v.cleared,
    },
  }));

export const statementSchema = z
  .object({
    id: optionalUuid,
    accountId: uuid("the card"),
    closingDate: date("statement closing date"),
    statementBalance: money("the statement balance"),
    minimumDue: optionalMoney("the minimum due"),
    dueDate: date("due date"),
    paid: optionalMoney("the amount paid"),
  })
  .superRefine((v, ctx) => {
    if (v.dueDate <= v.closingDate) ctx.addIssue({ code: "custom", path: ["dueDate"], message: "The due date must be after the closing date." });
    if ((v.paid ?? 0) > v.statementBalance) ctx.addIssue({ code: "custom", path: ["paid"], message: "Paid can't be more than the statement balance." });
  })
  .transform((v) => {
    const paid = v.paid ?? 0;
    return {
      id: v.id,
      row: {
        account_id: v.accountId,
        closing_date: v.closingDate,
        statement_balance_cents: v.statementBalance,
        minimum_due_cents: v.minimumDue ?? null,
        due_date: v.dueDate,
        paid_cents: paid,
        status: paid >= v.statementBalance ? "paid" : paid > 0 ? "partial" : "unpaid",
      },
    };
  });

export const goalSchema = z
  .object({
    id: optionalUuid,
    name: text("a goal name", 60),
    kind: z.enum(["wedding", "emergency", "debt", "other"]),
    accountId: optionalUuid,
    target: money("the target", { min: 1 }),
    targetDate: optionalDate("target date"),
    monthlyContribution: optionalMoney("the monthly contribution"),
    protected: checkbox,
  })
  .transform((v) => ({
    id: v.id,
    row: {
      name: v.name,
      kind: v.kind,
      account_id: v.accountId ?? null,
      target_cents: v.target,
      target_date: v.targetDate ?? null,
      monthly_contribution_cents: v.monthlyContribution ?? null,
      protected: v.protected,
    },
  }));

export const settingsSchema = z
  .object({
    cashFloor: money("your cash floor"),
    defaultHorizonDays: z.coerce.number().refine((h) => [30, 60, 90].includes(h), "Choose 30, 60 or 90 days."),
    staleAfterDays: z.coerce.number({ invalid_type_error: "Enter a number of days." }).int().min(1, "At least 1 day.").max(60, "At most 60 days."),
    autoPayStatements: checkbox,
    unseenPlansBufferPct: z.coerce.number({ invalid_type_error: "Enter a percentage." }).int().min(0, "0% or more.").max(50, "At most 50%."),
  })
  .transform((v) => ({
    cash_floor_cents: v.cashFloor,
    default_horizon_days: v.defaultHorizonDays,
    stale_after_days: v.staleAfterDays,
    auto_pay_statements: v.autoPayStatements,
    unseen_plans_buffer_pct: v.unseenPlansBufferPct,
  }));

export const profileSchema = z.object({
  displayName: optionalText(80),
  timezone: z
    .string()
    .trim()
    .refine((tz) => {
      try {
        new Intl.DateTimeFormat("en-US", { timeZone: tz });
        return true;
      } catch {
        return false;
      }
    }, "Choose a valid time zone."),
});

export const calendarSourceSchema = z.object({
  name: text("a calendar name", 60),
  url: z
    .string({ required_error: "Paste the calendar's secret iCal address." })
    .trim()
    .min(1, "Paste the calendar's secret iCal address.")
    .max(2000, "That address is too long.")
    .refine((u) => /^(https|webcal):\/\//i.test(u), "The address must start with https:// or webcal://."),
});

export const manualEventSchema = z.object({
  title: text("what the plan is", 200),
  date: date("date"),
  estimate: optionalMoney("the expected cost"),
  paymentAccountId: optionalUuid,
});

export const eventCorrectionSchema = z.object({
  eventId: uuid("the event"),
  title: optionalText(200),
  date: optionalDate("date"),
  estimate: optionalMoney("the expected cost"),
  cap: optionalMoney("the spending cap"),
  decision: z.preprocess(emptyToUndefined, z.enum(["proceed", "cheaper", "postpone", "skip"]).optional()),
  essential: checkbox,
  notSpending: checkbox,
  rememberForSimilar: checkbox,
  paymentAccountId: optionalUuid,
});

export const purchaseSchema = z.object({
  label: text("what you're buying", 80),
  amount: money("the price", { min: 1 }),
  date: date("purchase date"),
  paymentAccountId: optionalUuid,
  allowProtected: checkbox,
});

/* ---------------------------------------------------------------------------
 * Form parsing
 * ------------------------------------------------------------------------- */

export type FieldErrors = Record<string, string>;

export function parseForm<S extends z.ZodTypeAny>(
  schema: S,
  form: FormData,
): { ok: true; data: z.output<S> } | { ok: false; fieldErrors: FieldErrors } {
  const raw: Record<string, unknown> = {};
  for (const [k, v] of form.entries()) if (typeof v === "string") raw[k] = v;
  const result = schema.safeParse(raw);
  if (result.success) return { ok: true, data: result.data };
  const fieldErrors: FieldErrors = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join(".") || "_form";
    if (!fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return { ok: false, fieldErrors };
}
