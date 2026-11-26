/**
 * Bank connections are off unless the server is configured for them, so nothing appears
 * on the site until the keys are in place.
 *
 *   PLAID_ENV=sandbox | production   with PLAID_CLIENT_ID, PLAID_SECRET, PLAID_TOKEN_KEY
 *   PLAID_ENV=mock                   a built-in fake bank, for local development and tests only
 *
 * SUPABASE_SERVICE_ROLE_KEY is also required: bank tokens live in a table only the server can read.
 */
export type PlaidMode = "off" | "mock" | "sandbox" | "production";

export function plaidMode(env: Record<string, string | undefined> = process.env): PlaidMode {
  const mode = env.PLAID_ENV;
  if (!env.SUPABASE_SERVICE_ROLE_KEY) return "off";
  if (mode === "mock") return env.VERCEL_ENV === "production" ? "off" : "mock";
  if ((mode === "sandbox" || mode === "production") && env.PLAID_CLIENT_ID && env.PLAID_SECRET && env.PLAID_TOKEN_KEY) return mode;
  return "off";
}

export const plaidEnabled = () => plaidMode() !== "off";
