import type { Metadata } from "next";
import { ActivityView } from "@/components/views/activity";
import { getDemoSession } from "@/lib/data/demo-session";

export const metadata: Metadata = { title: "Activity" };
export default function Page() {
  return <ActivityView {...getDemoSession()} />;
}
