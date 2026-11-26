import type { Metadata } from "next";
import { ReportsPage } from "@/components/views/money-pages";
import { getAppSession } from "@/lib/data/session";

export const metadata: Metadata = { title: "Reports" };

export default async function Page() {
  return <ReportsPage {...await getAppSession()} />;
}
