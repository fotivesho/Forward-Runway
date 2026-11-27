import type { Metadata } from "next";
import { SpendView } from "@/components/views/spend";
import { getDemoSession } from "@/lib/data/demo-session";

export const metadata: Metadata = { title: "Bills" };

export default function Page() {
  return <SpendView {...getDemoSession()} demo section="bills" />;
}
