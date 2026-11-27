import type { Metadata } from "next";
import { SpendView } from "@/components/views/spend";
import { getAppSession } from "@/lib/data/session";

export const metadata: Metadata = { title: "Bills" };
export const dynamic = "force-dynamic";

export default async function Page() {
  return <SpendView {...await getAppSession()} section="bills" />;
}
