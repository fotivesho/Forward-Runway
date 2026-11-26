import type { Metadata } from "next";
import { SpendView } from "@/components/views/spend";
import { getAppSession } from "@/lib/data/session";

export const metadata: Metadata = { title: "Transactions" };
export default async function Page() {
  return <SpendView {...await getAppSession()} section="transactions" />;
}
