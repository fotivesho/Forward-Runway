import type { Metadata } from "next";
import { TrendsPage } from "@/components/views/money-pages";
import { getAppSession } from "@/lib/data/session";

export const metadata: Metadata = { title: "Trends" };
export const dynamic = "force-dynamic";

export default async function Page() {
  return <TrendsPage {...await getAppSession()} />;
}
