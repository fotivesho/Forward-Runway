import type { Metadata } from "next";
import { ForecastView } from "@/components/forecast-view";
import { getAppSession } from "@/lib/data/session";

export const metadata: Metadata = { title: "Forecast" };

export default async function ForecastPage() {
  const { snapshot, today } = await getAppSession();
  return <ForecastView snapshot={snapshot} today={today} />;
}
