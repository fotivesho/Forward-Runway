import type { Metadata } from "next";
import { PatternsPage } from "@/components/views/money-pages";
import { getAppSession } from "@/lib/data/session";

export const metadata: Metadata = { title: "Patterns" };

export default async function Page() {
  return <PatternsPage {...await getAppSession()} />;
}
