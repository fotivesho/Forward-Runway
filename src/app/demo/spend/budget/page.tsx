import type { Metadata } from "next";
import { BudgetPage } from "@/components/views/money-pages";
import { getDemoSession } from "@/lib/data/demo-session";

export const metadata: Metadata = { title: "Budget" };
export default function Page() {
  return <BudgetPage {...getDemoSession()} />;
}
