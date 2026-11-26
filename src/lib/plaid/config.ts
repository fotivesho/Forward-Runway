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

type Env = Record<string, string | undefined>;
const val = (env: Env, name: string) => env[name]?.trim() || "";

/** Which setting names are missing (names only, never values), for the owner setting it up. */
export function plaidSetup(env: Env = process.env): { mode: PlaidMode; requested: boolean; missing: string[] } {
  const raw = val(env, "PLAID_ENV").toLowerCase().replace(/^["']|["']$/g, "");
  // Asked for when any Plaid setting is present, so a missing PLAID_ENV is reported too.
  const requested = raw !== "" || !!val(env, "PLAID_CLIENT_ID") || !!val(env, "PLAID_SECRET") || !!val(env, "PLAID_TOKEN_KEY");
  const missing: string[] = [];
  if (!val(env, "SUPABASE_SERVICE_ROLE_KEY")) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (raw === "mock") {
    const mode = missing.length || env.VERCEL_ENV === "production" ? "off" : "mock";
    return { mode, requested, missing };
  }
  if (!raw) missing.push("PLAID_ENV");
  else if (raw !== "sandbox" && raw !== "production") missing.push('PLAID_ENV (must be "sandbox" or "production")');
  for (const name of ["PLAID_CLIENT_ID", "PLAID_SECRET"]) if (!val(env, name)) missing.push(name);
  const key = val(env, "PLAID_TOKEN_KEY");
  if (!key) missing.push("PLAID_TOKEN_KEY");
  else if (key.length < 20) missing.push("PLAID_TOKEN_KEY (needs 20+ characters)");
  const mode = requested && missing.length === 0 ? (raw as "sandbox" | "production") : "off";
  return { mode, requested, missing };
}

export const plaidMode = (env: Env = process.env): PlaidMode => plaidSetup(env).mode;
export const plaidEnabled = () => plaidMode() !== "off";
/** Trimmed setting values, so a stray space pasted into Vercel doesn't break anything. */
export const plaidEnv = (name: "PLAID_CLIENT_ID" | "PLAID_SECRET" | "PLAID_TOKEN_KEY" | "PLAID_REDIRECT_URI") => process.env[name]?.trim() || undefined;
