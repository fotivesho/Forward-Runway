import type { Account, EngineInput, ForecastSettings, RecurringRule } from "../types";

export const settings: ForecastSettings = {
  cashFloorCents: 0,
  defaultHorizonDays: 30,
  staleAfterDays: 3,
  autoPayStatements: true,
  unseenPlansBufferPct: 15,
};

export function checking(balanceCents: number | null, asOf = "2026-01-01", extra: Partial<Account> = {}): Account {
  return {
    id: "chk",
    name: "Checking",
    kind: "checking",
    balanceCents,
    balanceAsOf: balanceCents == null ? null : asOf,
    balanceSource: "manual",
    balanceUpdatedAt: null,
    isSpendable: true,
    ...extra,
  };
}

export function savings(id: string, balanceCents: number, asOf = "2026-01-01", extra: Partial<Account> = {}): Account {
  return {
    id,
    name: id === "wed" ? "Wedding fund" : "Savings",
    kind: "savings",
    balanceCents,
    balanceAsOf: asOf,
    balanceSource: "manual",
    balanceUpdatedAt: null,
    isSpendable: false,
    ...extra,
  };
}

export function card(owed: number, asOf = "2026-01-01", extra: Partial<Account> = {}): Account {
  return {
    id: "visa",
    name: "Visa",
    kind: "credit_card",
    balanceCents: owed,
    balanceAsOf: asOf,
    balanceSource: "manual",
    balanceUpdatedAt: null,
    isSpendable: false,
    statementCloseDay: 20,
    paymentDueDay: 15,
    paymentAccountId: "chk",
    payInFull: true,
    ...extra,
  };
}

export function rule(partial: Partial<RecurringRule> & Pick<RecurringRule, "id" | "amountCents" | "schedule">): RecurringRule {
  return { name: partial.id, kind: "bill", accountId: "chk", ...partial };
}

export function input(partial: Partial<EngineInput>): EngineInput {
  return {
    today: "2026-01-01",
    accounts: [],
    rules: [],
    overrides: [],
    transactions: [],
    transfers: [],
    statements: [],
    goals: [],
    settings,
    ...partial,
  };
}

export const payday = (amount = 200_000, start = "2026-01-02"): RecurringRule =>
  rule({ id: "pay", kind: "income", amountCents: amount, schedule: { frequency: "biweekly", startDate: start } });
