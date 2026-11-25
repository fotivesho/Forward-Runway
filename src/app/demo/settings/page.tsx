import type { Metadata } from "next";
import { SettingsView } from "@/components/views/settings";
import { getDemoSession } from "@/lib/data/demo-session";

export const metadata: Metadata = { title: "Settings" };
export default function Page() {
  return <SettingsView {...getDemoSession()} />;
}
