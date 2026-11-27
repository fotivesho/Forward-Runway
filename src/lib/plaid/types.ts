/** The small part of Plaid's API we use. Amounts are in dollars (Plaid's convention). */

export interface PlaidAccount {
  account_id: string;
  name: string;
  official_name?: string | null;
  mask?: string | null;
  type: "depository" | "credit" | "loan" | "investment" | "other" | string;
  subtype?: string | null;
  balances: {
    available?: number | null;
    current?: number | null;
    limit?: number | null;
    iso_currency_code?: string | null;
  };
}

export interface PlaidTransaction {
  transaction_id: string;
  account_id: string;
  /** Positive = money out of the account (a purchase, a payment). Negative = money in. */
  amount: number;
  /** Posted date (or the authorized date while pending). */
  date: string;
  authorized_date?: string | null;
  name: string;
  merchant_name?: string | null;
  pending: boolean;
  iso_currency_code?: string | null;
  personal_finance_category?: { primary: string; detailed: string } | null;
}

export interface PlaidCreditLiability {
  account_id: string | null;
  last_statement_balance?: number | null;
  last_statement_issue_date?: string | null;
  next_payment_due_date?: string | null;
  minimum_payment_amount?: number | null;
  last_payment_amount?: number | null;
  last_payment_date?: string | null;
  aprs?: Array<{ apr_percentage: number; apr_type: string }>;
}

export interface SyncPage {
  added: PlaidTransaction[];
  modified: PlaidTransaction[];
  removed: Array<{ transaction_id: string }>;
  next_cursor: string;
  has_more: boolean;
}

/** What the rest of the app needs from Plaid, so a fake bank can stand in for tests and demos. */
export interface BankApi {
  /** With an access token, opens Link in update mode, for a bank that needs you to sign in again. */
  createLinkToken(userId: string, accessToken?: string): Promise<string>;
  exchangePublicToken(publicToken: string): Promise<{ accessToken: string; itemId: string }>;
  getAccounts(accessToken: string): Promise<{ accounts: PlaidAccount[]; institutionName: string | null }>;
  getLiabilities(accessToken: string): Promise<PlaidCreditLiability[]>;
  syncTransactions(accessToken: string, cursor: string | null): Promise<SyncPage>;
  removeItem(accessToken: string): Promise<void>;
  /** Ask the bank for new activity now (Plaid's Transactions Refresh). False when it isn't available. */
  refreshTransactions?(accessToken: string): Promise<boolean>;
  /** When Plaid last got new activity from the bank, and any problem it reports. */
  itemStatus?(accessToken: string): Promise<{ lastSuccess: string | null; lastFailure: string | null; error: string | null }>;
}

/** A Plaid API error, with Plaid's own error code (e.g. ITEM_LOGIN_REQUIRED). */
export class PlaidError extends Error {
  constructor(
    public code: string,
    message: string,
    public type?: string,
  ) {
    super(message);
    this.name = "PlaidError";
  }
}
