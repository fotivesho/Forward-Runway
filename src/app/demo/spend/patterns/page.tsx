import type { Metadata } from "next";
import { PatternsPage } from "@/components/views/money-pages";
import { getDemoSession } from "@/lib/data/demo-session";

export const metadata: Metadata = { title: "Patterns" };
export default function Page() {
  return <PatternsPage {...getDemoSession()} />;
}
