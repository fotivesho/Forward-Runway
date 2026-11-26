import "server-only";
import { APP_NAME } from "../brand";
import { plaidMode } from "./config";
import { mockBank } from "./mock";
import { PlaidError, type BankApi, type PlaidAccount, type PlaidCreditLiability, type SyncPage } from "./types";

/** Plaid over plain HTTPS (no SDK): every call is a JSON POST with the client id and secret. */
function plaidHttp(env: "sandbox" | "production", clientId: string, secret: string): BankApi {
  const base = `https://${env}.plaid.com`;
  async function call<T>(path: string, body: Record<string, unknown>): Promise<T> {
    const res = await fetch(base + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: clientId, secret, ...body }),
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      // Plaid's messages are safe to log and show; they never include the token.
      throw new PlaidError(String(json.error_code ?? res.status), String(json.display_message ?? json.error_message ?? `Plaid request failed (${res.status})`), String(json.error_type ?? ""));
    }
    return json as T;
  }
  return {
    async createLinkToken(userId, accessToken) {
      const r = await call<{ link_token: string }>("/link/token/create", {
        client_name: APP_NAME.slice(0, 30),
        user: { client_user_id: userId },
        ...(accessToken
          ? { access_token: accessToken }
          : { products: ["transactions"], optional_products: ["liabilities"], transactions: { days_requested: 180 } }),
        country_codes: ["US"],
        language: "en",
        ...(process.env.PLAID_REDIRECT_URI ? { redirect_uri: process.env.PLAID_REDIRECT_URI } : {}),
      });
      return r.link_token;
    },
    async exchangePublicToken(publicToken) {
      const r = await call<{ access_token: string; item_id: string }>("/item/public_token/exchange", { public_token: publicToken });
      return { accessToken: r.access_token, itemId: r.item_id };
    },
    async getAccounts(accessToken) {
      const r = await call<{ accounts: PlaidAccount[] }>("/accounts/get", { access_token: accessToken });
      return { accounts: r.accounts, institutionName: null };
    },
    async getLiabilities(accessToken) {
      try {
        const r = await call<{ liabilities: { credit?: PlaidCreditLiability[] | null } }>("/liabilities/get", { access_token: accessToken });
        return r.liabilities.credit ?? [];
      } catch (e) {
        // Not every bank offers statement details; balances and transactions still work without them.
        if (e instanceof PlaidError && ["PRODUCTS_NOT_SUPPORTED", "NO_LIABILITY_ACCOUNTS", "PRODUCT_NOT_ENABLED", "INVALID_PRODUCT", "ADDITIONAL_CONSENT_REQUIRED"].includes(e.code)) return [];
        throw e;
      }
    },
    async syncTransactions(accessToken, cursor) {
      return call<SyncPage>("/transactions/sync", { access_token: accessToken, ...(cursor ? { cursor } : {}), count: 500 });
    },
    async removeItem(accessToken) {
      await call("/item/remove", { access_token: accessToken });
    },
  };
}

/** The bank API for this server's configuration, or null when bank connections are off. */
export function bankApi(): BankApi | null {
  const mode = plaidMode();
  if (mode === "off") return null;
  if (mode === "mock") return mockBank;
  return plaidHttp(mode, process.env.PLAID_CLIENT_ID!, process.env.PLAID_SECRET!);
}
