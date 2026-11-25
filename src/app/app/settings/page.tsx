import type { Metadata } from "next";
import { SettingsView } from "@/components/views/settings";
import { getAppSession } from "@/lib/data/session";

export const metadata: Metadata = { title: "Settings" };

export default async function Page() {
  return <SettingsView {...await getAppSession()} />;
}
