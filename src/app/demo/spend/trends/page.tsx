import type { Metadata } from "next";
import { TrendsPage } from "@/components/views/money-pages";
import { getDemoSession } from "@/lib/data/demo-session";

export const metadata: Metadata = { title: "Trends" };

export default function Page() {
  return <TrendsPage {...getDemoSession()} />;
}
