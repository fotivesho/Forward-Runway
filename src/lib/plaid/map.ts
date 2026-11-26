/**
 * Turning what the bank says into the app's own records. Pure functions, unit-tested.
 *
 * Rules that keep the numbers honest:
 *  - The bank's balance is the fact. Everything the bank has already recorded is marked
 *    "cleared" (already in that balance), so the forecast never subtracts it a second time.
 *  - A card purchase is spending once, when you buy. The card payment from checking (and the
 *    matching "payment received" on the card) is labelled "Card payment" and never counted as spending.
 *  - Moves between your own accounts are "Transfer" and never counted as spending either.
 */
import type { AccountKind } from "../engine/types";
import type { PlaidAccount, PlaidCreditLiability, PlaidTransaction } from "./types";

export const cents = (dollars: number | null | undefined) => (dollars == null ? null : Math.round(dollars * 100));

export function accountKind(a: PlaidAccount): AccountKind | null {
  const sub = (a.subtype ?? "").toLowerCase();
  if (a.type === "depository") {
    if (["savings", "money market", "cd", "hsa"].includes(sub)) return "savings";
    return "checking";
  }
  if (a.type === "credit") return "credit_card";
  if (a.type === "loan") return "loan";
  return null; // investment and other accounts aren't part of cash flow
}

export function accountName(a: PlaidAccount): string {
  const base = (a.name || a.official_name || "Account").trim();
  const withMask = a.mask ? `${base} ••${a.mask}` : base;
  return withMask.slice(0, 60);
}

/** Cash accounts: what you can use now (available, after pending). Cards and loans: what you owe. */
export function accountBalanceCents(a: PlaidAccount): number | null {
  const kind = accountKind(a);
  if (kind === "checking" || kind === "savings") return cents(a.balances.available ?? a.balances.current);
  return cents(a.balances.current);
}

export type TxnKind = "spending" | "bill" | "income" | "card_payment" | "transfer";

export function categorize(t: PlaidTransaction, accountKindOf: AccountKind | null): { category: string; kind: TxnKind } {
  const primary = t.personal_finance_category?.primary ?? "";
  const detailed = t.personal_finance_category?.detailed ?? "";
  // Money arriving on a card is a payment toward it (or a refund, which reads as spending going back).
  if (accountKindOf === "credit_card" && t.amount < 0 && (primary === "TRANSFER_IN" || primary === "LOAN_PAYMENTS")) return { category: "Card payment", kind: "card_payment" };
  switch (primary) {
    case "FOOD_AND_DRINK":
      return { category: detailed.endsWith("GROCERIES") ? "Groceries" : detailed.endsWith("COFFEE") ? "Coffee" : "Dining", kind: "spending" };
    case "GENERAL_MERCHANDISE":
      return { category: "Shopping", kind: "spending" };
    case "TRANSPORTATION":
      return { category: "Transport", kind: "spending" };
    case "TRAVEL":
      return { category: "Travel", kind: "spending" };
    case "ENTERTAINMENT":
      return { category: "Entertainment", kind: "spending" };
    case "PERSONAL_CARE":
      return { category: "Personal care", kind: "spending" };
    case "MEDICAL":
      return { category: "Health", kind: "spending" };
    case "HOME_IMPROVEMENT":
      return { category: "Home", kind: "spending" };
    case "RENT_AND_UTILITIES":
      return { category: detailed.endsWith("RENT") ? "Housing" : "Utilities", kind: "bill" };
    case "LOAN_PAYMENTS":
      return detailed === "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT" ? { category: "Card payment", kind: "card_payment" } : { category: "Debt", kind: "bill" };
    case "TRANSFER_IN":
    case "TRANSFER_OUT":
      return { category: "Transfer", kind: "transfer" };
    case "INCOME":
      return { category: "Income", kind: "income" };
    case "BANK_FEES":
      return { category: "Fees", kind: "bill" };
    case "GENERAL_SERVICES":
      return { category: "Services", kind: "bill" };
    case "GOVERNMENT_AND_NON_PROFIT":
      return { category: "Other", kind: "bill" };
    default:
      return { category: "Other", kind: t.amount > 0 ? "spending" : "income" };
  }
}

/** A database row for one bank transaction, or null when there's nothing to record (a $0 line). */
export function transactionRow(t: PlaidTransaction, accountId: string, kind: AccountKind | null) {
  const amount = cents(Math.abs(t.amount)) ?? 0;
  if (amount <= 0) return null;
  const { category, kind: txnKind } = categorize(t, kind);
  return {
    external_id: t.transaction_id,
    account_id: accountId,
    date: t.date,
    amount_cents: amount,
    direction: t.amount > 0 ? ("out" as const) : ("in" as const),
    description: (t.merchant_name || t.name || "Bank transaction").trim().slice(0, 120),
    category,
    status: "posted" as const,
    // Already in the balance the bank reported: never subtracted again.
    cleared: true,
    pending: t.pending,
    is_estimate: false,
    flexible: txnKind === "spending",
  };
}

const dayOf = (d: string | null | undefined) => (d ? Number(d.slice(8, 10)) : null);

/** Card details from the bank's statement data. */
export function cardFields(l: PlaidCreditLiability) {
  const apr = l.aprs?.find((a) => a.apr_type === "purchase_apr") ?? l.aprs?.[0];
  return {
    statement_close_day: dayOf(l.last_statement_issue_date),
    payment_due_day: dayOf(l.next_payment_due_date),
    apr_bps: apr ? Math.round(apr.apr_percentage * 100) : null,
    minimum_payment_cents: cents(l.minimum_payment_amount),
  };
}

/** The latest statement as a card_statements row, or null when the bank didn't give enough to use it. */
export function statementRow(l: PlaidCreditLiability, accountId: string) {
  const closing = l.last_statement_issue_date;
  const due = l.next_payment_due_date;
  const balance = cents(l.last_statement_balance);
  if (!closing || !due || due <= closing || balance == null || balance < 0) return null;
  const paid = l.last_payment_date && l.last_payment_date > closing ? Math.min(balance, cents(l.last_payment_amount) ?? 0) : 0;
  return {
    account_id: accountId,
    closing_date: closing,
    due_date: due,
    statement_balance_cents: balance,
    minimum_due_cents: cents(l.minimum_payment_amount),
    paid_cents: paid,
    status: paid >= balance ? ("paid" as const) : paid > 0 ? ("partial" as const) : ("unpaid" as const),
  };
}

/**
 * How much of a statement is paid: the larger of what the bank's statement data says and the card
 * payments it actually received after the statement closed (several smaller payments add up).
 */
export function settleStatement<T extends { closing_date: string; statement_balance_cents: number; paid_cents: number }>(
  row: T,
  payments: Array<{ date: string; cents: number }>,
): T & { status: "paid" | "partial" | "unpaid" } {
  const received = payments.filter((p) => p.date > row.closing_date).reduce((t, p) => t + p.cents, 0);
  const paid = Math.min(row.statement_balance_cents, Math.max(row.paid_cents, received));
  return { ...row, paid_cents: paid, status: paid >= row.statement_balance_cents ? "paid" : paid > 0 ? "partial" : "unpaid" };
}

/**
 * Pending card activity the bank's "current" balance leaves out: purchases add to what you owe,
 * refunds and payments reduce it. Cash accounts already use the available balance, which counts them.
 */
export function pendingOwedCents(rows: Array<{ amount_cents: number; direction: "in" | "out" }>): number {
  return rows.reduce((t, r) => t + (r.direction === "out" ? r.amount_cents : -r.amount_cents), 0);
}
