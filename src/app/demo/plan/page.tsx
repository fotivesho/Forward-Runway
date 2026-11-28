import { PlanTabs } from "@/components/plan-tabs";
import type { Metadata } from "next";
import { ForecastView } from "@/components/forecast-view";
import { getDemoSession } from "@/lib/data/demo-session";

export const metadata: Metadata = { title: "Plan" };
export default function Page() {
  const s = getDemoSession();
  return <><PlanTabs base={"/demo"} /><ForecastView snapshot={s.snapshot} today={s.today} /></>;
}
