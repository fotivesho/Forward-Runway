import { describe, expect, it } from "vitest";
import { plaidMode } from "./config";
import { decryptToken, encryptToken, tokenKey } from "./crypto";
import { accountBalanceCents, accountKind, accountName, categorize, statementRow, transactionRow } from "./map";
import { mockBank, mockLiabilities, mockTransactions } from "./mock";
import type { PlaidAccount, PlaidTransaction } from "./types";

const acct = (over: Partial<PlaidAccount>): PlaidAccount => ({ account_id: "a", name: "Checking", type: "depository", subtype: "checking", balances: { available: 100, current: 120 }, ...over });
const txn = (over: Partial<PlaidTransaction>): PlaidTransaction => ({ transaction_id: "t", account_id: "a", amount: 10, date: "2026-11-20", name: "Thing", pending: false, ...over });

describe("bank connection switch", () => {
  const keys = { SUPABASE_SERVICE_ROLE_KEY: "s", PLAID_CLIENT_ID: "id", PLAID_SECRET: "secret", PLAID_TOKEN_KEY: "k" };
  it("is off until every key is set", () => {
    expect(plaidMode({})).toBe("off");
    expect(plaidMode({ ...keys, PLAID_ENV: "sandbox", PLAID_SECRET: undefined })).toBe("off");
    expect(plaidMode({ ...keys, PLAID_ENV: "sandbox", SUPABASE_SERVICE_ROLE_KEY: undefined })).toBe("off");
    expect(plaidMode({ ...keys, PLAID_ENV: "sandbox" })).toBe("sandbox");
    expect(plaidMode({ ...keys, PLAID_ENV: "production" })).toBe("production");
  });
  it("never runs the fake bank on the live site", () => {
    expect(plaidMode({ SUPABASE_SERVICE_ROLE_KEY: "s", PLAID_ENV: "mock" })).toBe("mock");
    expect(plaidMode({ SUPABASE_SERVICE_ROLE_KEY: "s", PLAID_ENV: "mock", VERCEL_ENV: "production" })).toBe("off");
  });
});

describe("token encryption", () => {
  const key = tokenKey("a".repeat(64));
  it("round-trips, and each encryption looks different", () => {
    const a = encryptToken("access-sandbox-123", key);
    expect(a).not.toContain("access-sandbox");
    expect(encryptToken("access-sandbox-123", key)).not.toBe(a);
    expect(decryptToken(a, key)).toBe("access-sandbox-123");
  });
  it("refuses a wrong key or a tampered value", () => {
    const a = encryptToken("x", key);
    expect(() => decryptToken(a, tokenKey("b".repeat(64)))).toThrow();
    const parts = a.split(":");
    parts[3] = Buffer.from("tampered").toString("base64");
    expect(() => decryptToken(parts.join(":"), key)).toThrow();
  });
  it("requires a real 32-byte key", () => {
    expect(() => tokenKey(undefined)).toThrow();
    expect(() => tokenKey("short")).toThrow();
  });
});

describe("accounts", () => {
  it("maps bank account types", () => {
    expect(accountKind(acct({}))).toBe("checking");
    expect(accountKind(acct({ subtype: "savings" }))).toBe("savings");
    expect(accountKind(acct({ type: "credit", subtype: "credit card" }))).toBe("credit_card");
    expect(accountKind(acct({ type: "loan", subtype: "auto" }))).toBe("loan");
    expect(accountKind(acct({ type: "investment", subtype: "401k" }))).toBeNull();
  });
  it("uses what you can spend for cash and what you owe for cards", () => {
    expect(accountBalanceCents(acct({}))).toBe(10_000);
    expect(accountBalanceCents(acct({ balances: { available: null, current: 55.5 } }))).toBe(5_550);
    expect(accountBalanceCents(acct({ type: "credit", subtype: "credit card", balances: { available: 900, current: 100.25 } }))).toBe(10_025);
  });
  it("names accounts with the last four digits", () => {
    expect(accountName(acct({ mask: "0042" }))).toBe("Checking ••0042");
  });
});

describe("transactions", () => {
  it("marks everything as already in the bank's balance", () => {
    const r = transactionRow(txn({ amount: 12.34 }), "acc", "checking")!;
    expect(r).toMatchObject({ amount_cents: 1234, direction: "out", cleared: true, status: "posted", external_id: "t" });
  });
  it("treats money in as in, and skips $0 lines", () => {
    expect(transactionRow(txn({ amount: -2150, personal_finance_category: { primary: "INCOME", detailed: "INCOME_WAGES" } }), "acc", "checking")).toMatchObject({ direction: "in", category: "Income", flexible: false });
    expect(transactionRow(txn({ amount: 0 }), "acc", "checking")).toBeNull();
  });
  it("never counts a card payment or a transfer as spending", () => {
    const fromChecking = categorize(txn({ amount: 640, personal_finance_category: { primary: "LOAN_PAYMENTS", detailed: "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT" } }), "checking");
    const onCard = categorize(txn({ amount: -640, personal_finance_category: { primary: "TRANSFER_IN", detailed: "TRANSFER_IN_ACCOUNT_TRANSFER" } }), "credit_card");
    const toSavings = categorize(txn({ amount: 200, personal_finance_category: { primary: "TRANSFER_OUT", detailed: "TRANSFER_OUT_SAVINGS" } }), "checking");
    expect(fromChecking).toEqual({ category: "Card payment", kind: "card_payment" });
    expect(onCard).toEqual({ category: "Card payment", kind: "card_payment" });
    expect(toSavings).toEqual({ category: "Transfer", kind: "transfer" });
  });
  it("counts a card purchase as day-to-day spending", () => {
    expect(transactionRow(txn({ amount: 42, personal_finance_category: { primary: "FOOD_AND_DRINK", detailed: "FOOD_AND_DRINK_RESTAURANT" } }), "card", "credit_card")).toMatchObject({ category: "Dining", flexible: true, direction: "out" });
  });
});

describe("card statements", () => {
  it("reads the latest statement and whether it's been paid", () => {
    const row = statementRow({ account_id: "c", last_statement_balance: 640, last_statement_issue_date: "2026-11-20", next_payment_due_date: "2026-12-15", minimum_payment_amount: 35, last_payment_amount: 100, last_payment_date: "2026-11-22" }, "card")!;
    expect(row).toMatchObject({ closing_date: "2026-11-20", due_date: "2026-12-15", statement_balance_cents: 64_000, paid_cents: 10_000, status: "partial" });
  });
  it("ignores incomplete statement data", () => {
    expect(statementRow({ account_id: "c", last_statement_balance: 640, last_statement_issue_date: null, next_payment_due_date: "2026-12-15" }, "card")).toBeNull();
    expect(statementRow({ account_id: "c", last_statement_balance: 640, last_statement_issue_date: "2026-12-20", next_payment_due_date: "2026-12-15" }, "card")).toBeNull();
  });
});

describe("fake bank", () => {
  it("gives three months of history with paychecks, rent and a paid card bill", async () => {
    const t = mockTransactions("2026-11-26");
    expect(t.some((x) => x.name.includes("Payroll"))).toBe(true);
    expect(t.some((x) => x.personal_finance_category?.detailed === "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT")).toBe(true);
    expect(new Set(t.map((x) => x.transaction_id)).size).toBe(t.length);
    expect(statementRow(mockLiabilities("2026-11-26")[0]!, "card")).toMatchObject({ closing_date: "2026-11-20", due_date: "2026-12-15", status: "unpaid" });
    const first = await mockBank.syncTransactions("x", null);
    const again = await mockBank.syncTransactions("x", first.next_cursor);
    expect(first.added.length).toBeGreaterThan(50);
    expect(again.added).toHaveLength(0);
  });
});
