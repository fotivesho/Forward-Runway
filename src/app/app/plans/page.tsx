import type { Metadata } from "next";
import { PlansView } from "@/components/views/plans";
import { getAppSession } from "@/lib/data/session";

export const metadata: Metadata = { title: "Bills & pay" };

export default async function Page() {
  return <PlansView {...await getAppSession()} />;
}
