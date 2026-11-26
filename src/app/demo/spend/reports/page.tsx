import type { Metadata } from "next";
import { ReportsPage } from "@/components/views/money-pages";
import { getDemoSession } from "@/lib/data/demo-session";

export const metadata: Metadata = { title: "Reports" };
export default function Page() {
  return <ReportsPage {...getDemoSession()} />;
}
