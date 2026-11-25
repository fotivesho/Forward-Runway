import type { Metadata } from "next";
import { CalendarView } from "@/components/views/calendar";
import { getAppSession } from "@/lib/data/session";

export const metadata: Metadata = { title: "Calendar" };

export default async function Page() {
  return <CalendarView {...await getAppSession()} />;
}
