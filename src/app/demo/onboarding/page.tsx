import type { Metadata } from "next";
import { OnboardingView } from "@/components/views/onboarding";
import { getDemoSession } from "@/lib/data/demo-session";

export const metadata: Metadata = { title: "Set up" };
export default function Page() {
  return <OnboardingView {...getDemoSession()} />;
}
