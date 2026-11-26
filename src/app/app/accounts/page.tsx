import type { Metadata } from "next";
import { AccountsView } from "@/components/views/accounts";
import type { BankConnectionView } from "@/components/bank-connect";
import { getAppSession } from "@/lib/data/session";
import { plaidEnv, plaidSetup } from "@/lib/plaid/config";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Accounts" };

export default async function Page() {
  const session = await getAppSession();
  const setup = plaidSetup();
  const mode = setup.mode;
  let bank: { mode: Exclude<typeof mode, "off">; connections: BankConnectionView[]; redirectReady: boolean } | undefined;
  if (mode !== "off") {
    const supabase = await createClient();
    // Only what the user may see; the bank token lives in a table the browser can never read.
    const { data } = await supabase.from("bank_connections").select("id, institution_name, status, last_synced_at, last_error").order("created_at");
    bank = {
      mode,
      redirectReady: !!plaidEnv("PLAID_REDIRECT_URI"),
      connections: (data ?? []).map((c) => ({
        id: String(c.id),
        institutionName: (c.institution_name as string | null) ?? null,
        status: c.status as BankConnectionView["status"],
        lastSyncedAt: (c.last_synced_at as string | null) ?? null,
        lastError: (c.last_error as string | null) ?? null,
        accountNames: session.snapshot.accounts.filter((a) => a.bankConnectionId === c.id && !a.archived).map((a) => a.name),
      })),
    };
  }
  // Bank connections were asked for (PLAID_ENV is set) but a setting is missing: say which, by name only.
  const bankSetupMissing = mode === "off" && setup.requested ? setup.missing : undefined;
  return <AccountsView {...session} bank={bank} bankSetupMissing={bankSetupMissing} />;
}
