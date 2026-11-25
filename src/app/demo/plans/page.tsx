import type { Metadata } from "next";
import { PlansView } from "@/components/views/plans";
import { getDemoSession } from "@/lib/data/demo-session";

export const metadata: Metadata = { title: "Bills & pay" };
export default function Page() {
  return <PlansView {...getDemoSession()} />;
}
