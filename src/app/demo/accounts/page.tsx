import type { Metadata } from "next";
import { AccountsView } from "@/components/views/accounts";
import { getDemoSession } from "@/lib/data/demo-session";

export const metadata: Metadata = { title: "Accounts" };
export default function Page() {
  return <AccountsView {...getDemoSession()} />;
}
