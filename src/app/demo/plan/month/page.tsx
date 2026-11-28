import { PlanTabs } from "@/components/plan-tabs";
import type { Metadata } from "next";
import { CalendarView } from "@/components/views/calendar";
import { getDemoSession } from "@/lib/data/demo-session";

export const metadata: Metadata = { title: "Plan · Month" };
export default function Page() {
  return <><PlanTabs base={"/demo"} /><CalendarView {...getDemoSession()} /></>;
}
