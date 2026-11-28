import { PlanTabs } from "@/components/plan-tabs";
import type { Metadata } from "next";
import { ForecastView } from "@/components/forecast-view";
import { getAppSession } from "@/lib/data/session";

export const metadata: Metadata = { title: "Plan" };

export default async function ForecastPage() {
  const { snapshot, today } = await getAppSession();
  return <><PlanTabs base={"/app"} /><ForecastView snapshot={snapshot} today={today} /></>;
}
