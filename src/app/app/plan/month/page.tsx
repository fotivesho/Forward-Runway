import { PlanTabs } from "@/components/plan-tabs";
import type { Metadata } from "next";
import { CalendarView } from "@/components/views/calendar";
import { getAppSession } from "@/lib/data/session";

export const metadata: Metadata = { title: "Plan · Month" };

export default async function Page() {
  return <><PlanTabs base={"/app"} /><CalendarView {...await getAppSession()} /></>;
}
