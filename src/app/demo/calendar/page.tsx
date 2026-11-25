import type { Metadata } from "next";
import { CalendarView } from "@/components/views/calendar";
import { getDemoSession } from "@/lib/data/demo-session";

export const metadata: Metadata = { title: "Calendar" };
export default function Page() {
  return <CalendarView {...getDemoSession()} />;
}
