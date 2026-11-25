import type { Metadata } from "next";
import { AccountsView } from "@/components/views/accounts";
import { getAppSession } from "@/lib/data/session";

export const metadata: Metadata = { title: "Accounts" };

export default async function Page() {
  return <AccountsView {...await getAppSession()} />;
}
