import type { Metadata } from "next";
import { SpendView } from "@/components/views/spend";
import { getAppSession } from "@/lib/data/session";

export const metadata: Metadata = { title: "Money" };

export default async function Page() {
  return <SpendView {...await getAppSession()} />;
}
