import type { Metadata } from "next";
import { BudgetPage } from "@/components/views/money-pages";
import { getAppSession } from "@/lib/data/session";

export const metadata: Metadata = { title: "Budget" };

export default async function Page() {
  return <BudgetPage {...await getAppSession()} />;
}
