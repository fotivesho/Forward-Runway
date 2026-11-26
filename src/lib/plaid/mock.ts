/**
 * A fake bank that behaves like Plaid, for local development and automated tests (PLAID_ENV=mock).
 * Everything here is made up. It's never used in production (see config.ts).
 */
import { addDays, addMonths, type ISODate } from "../dates";
import type { BankApi, PlaidAccount, PlaidCreditLiability, PlaidTransaction } from "./types";

const ACCOUNTS: PlaidAccount[] = [
  { account_id: "mock-checking", name: "Everyday Checking", official_name: "Sample Bank Everyday Checking", mask: "0042", type: "depository", subtype: "checking", balances: { available: 2431.18, current: 2486.18, limit: null, iso_currency_code: "USD" } },
  { account_id: "mock-savings", name: "Rainy Day Savings", mask: "7781", type: "depository", subtype: "savings", balances: { available: 5200, current: 5200, limit: null, iso_currency_code: "USD" } },
  { account_id: "mock-card", name: "Sample Rewards Card", mask: "9103", type: "credit", subtype: "credit card", balances: { available: 5187.6, current: 812.4, limit: 6000, iso_currency_code: "USD" } },
];

function lcg(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const SPEND: Array<[string, string, string, number, number]> = [
  ["Corner Market", "FOOD_AND_DRINK", "FOOD_AND_DRINK_GROCERIES", 35, 110],
  ["Blue Door Cafe", "FOOD_AND_DRINK", "FOOD_AND_DRINK_COFFEE", 4, 9],
  ["Noodle House", "FOOD_AND_DRINK", "FOOD_AND_DRINK_RESTAURANT", 18, 60],
  ["City Transit", "TRANSPORTATION", "TRANSPORTATION_PUBLIC_TRANSIT", 3, 30],
  ["Online Store", "GENERAL_MERCHANDISE", "GENERAL_MERCHANDISE_ONLINE_MARKETPLACES", 15, 90],
  ["Cinema 8", "ENTERTAINMENT", "ENTERTAINMENT_TV_AND_MOVIES", 12, 30],
];

/** Ninety days of history up to `today`, the same every time for the same day. */
export function mockTransactions(today: ISODate): PlaidTransaction[] {
  const rand = lcg(7);
  const out: PlaidTransaction[] = [];
  const tx = (id: string, account: string, date: ISODate, amount: number, name: string, primary: string, detailed: string, pending = false) =>
    out.push({ transaction_id: id, account_id: account, amount: Math.round(amount * 100) / 100, date, name, merchant_name: name, pending, iso_currency_code: "USD", personal_finance_category: { primary, detailed } });
  for (let i = 90; i >= 0; i--) {
    const d = addDays(today, -i);
    const day = Number(d.slice(8));
    if (i % 14 === 3) tx(`pay-${d}`, "mock-checking", d, -2150, "Acme Corp Payroll", "INCOME", "INCOME_WAGES");
    if (day === 1) tx(`rent-${d}`, "mock-checking", d, 1650, "Maple Street Apartments", "RENT_AND_UTILITIES", "RENT_AND_UTILITIES_RENT");
    if (day === 18) tx(`power-${d}`, "mock-checking", d, 138.4, "City Power & Gas", "RENT_AND_UTILITIES", "RENT_AND_UTILITIES_GAS_AND_ELECTRICITY");
    if (day === 15) {
      // The card bill, paid from checking: the same money shows up on both accounts.
      tx(`cardpay-${d}`, "mock-checking", d, 640, "Sample Rewards Card Payment", "LOAN_PAYMENTS", "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT");
      tx(`cardpay-in-${d}`, "mock-card", d, -640, "Payment - Thank You", "TRANSFER_IN", "TRANSFER_IN_ACCOUNT_TRANSFER");
    }
    if (day === 16) tx(`save-${d}`, "mock-checking", d, 200, "Transfer to Rainy Day Savings", "TRANSFER_OUT", "TRANSFER_OUT_SAVINGS");
    const n = rand() < 0.3 ? 0 : rand() < 0.6 ? 1 : 2;
    for (let k = 0; k < n; k++) {
      const [name, primary, detailed, lo, hi] = SPEND[Math.floor(rand() * SPEND.length)]!;
      const amount = lo + rand() * (hi - lo);
      tx(`spend-${d}-${k}`, rand() < 0.6 ? "mock-card" : "mock-checking", d, amount, name, primary, detailed, i === 0);
    }
  }
  // A purchase still pending on the card today: not in the bank's "current" balance yet.
  tx(`pending-card-${today}`, "mock-card", today, 23.45, "Noodle House", "FOOD_AND_DRINK", "FOOD_AND_DRINK_RESTAURANT", true);
  return out;
}

export function mockLiabilities(today: ISODate): PlaidCreditLiability[] {
  // Statement closes on the 20th; payment due on the 15th of the next month.
  const close = Number(today.slice(8)) > 20 ? `${today.slice(0, 8)}20` : addMonths(`${today.slice(0, 8)}20`, -1);
  return [
    {
      account_id: "mock-card",
      last_statement_balance: 640,
      last_statement_issue_date: close,
      next_payment_due_date: addMonths(`${close.slice(0, 8)}15`, 1),
      minimum_payment_amount: 35,
      last_payment_amount: 640,
      last_payment_date: addMonths(`${close.slice(0, 8)}15`, 0),
      aprs: [{ apr_percentage: 24.99, apr_type: "purchase_apr" }],
    },
  ];
}

const today = () => new Date().toISOString().slice(0, 10);

export const mockBank: BankApi = {
  async createLinkToken() {
    return "link-mock-token";
  },
  async exchangePublicToken(publicToken) {
    if (!publicToken.startsWith("public-mock")) throw new Error("Not a mock public token");
    return { accessToken: `access-mock-${publicToken.slice(12) || "1"}`, itemId: `item-mock-${publicToken.slice(12) || "1"}-${Date.now()}` };
  },
  async getAccounts() {
    return { accounts: ACCOUNTS, institutionName: "Sample Bank (test)" };
  },
  async getLiabilities() {
    return mockLiabilities(today());
  },
  async syncTransactions(_token, cursor) {
    if (cursor === "mock-v1") return { added: [], modified: [], removed: [], next_cursor: "mock-v1", has_more: false };
    return { added: mockTransactions(today()), modified: [], removed: [], next_cursor: "mock-v1", has_more: false };
  },
  async removeItem() {},
};
