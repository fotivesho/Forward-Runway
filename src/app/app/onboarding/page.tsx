import type { Metadata } from "next";
import { OnboardingView } from "@/components/views/onboarding";
import { getAppSession } from "@/lib/data/session";

export const metadata: Metadata = { title: "Set up" };

export default async function Page() {
  return <OnboardingView {...await getAppSession()} />;
}
