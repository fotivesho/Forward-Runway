import type { Metadata } from "next";
import { ActivityView } from "@/components/views/activity";
import { getAppSession } from "@/lib/data/session";

export const metadata: Metadata = { title: "Activity" };

export default async function Page() {
  return <ActivityView {...await getAppSession()} />;
}
