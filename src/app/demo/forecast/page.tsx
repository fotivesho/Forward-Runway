import type { Metadata } from "next";
import { ForecastView } from "@/components/forecast-view";
import { getDemoSession } from "@/lib/data/demo-session";

export const metadata: Metadata = { title: "Forecast" };
export default function Page() {
  const s = getDemoSession();
  return <ForecastView snapshot={s.snapshot} today={s.today} />;
}
