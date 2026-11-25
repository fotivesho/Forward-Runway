import Link from "next/link";
import type { Metadata } from "next";
import { Dashboard } from "@/components/dashboard";
import { DemoProvider } from "@/components/form";
import { PrivacyProvider } from "@/components/privacy";
import { demoSnapshot } from "@/lib/data/demo";
import { todayInZone } from "@/lib/dates";

export const metadata: Metadata = { title: "Demo" };
export const dynamic = "force-dynamic";

/** Public demo. Uses ONLY fictional data generated in code; never reads any user's data. */
export default function DemoPage() {
  const now = new Date();
  const today = todayInZone("America/New_York", now);
  const snapshot = demoSnapshot(today, now.toISOString());
  return (
    <PrivacyProvider hide={false}>
      <DemoProvider demo>
        <div className="mx-auto max-w-7xl px-4 pb-12 pt-4 sm:px-6">
          <div role="note" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-info/40 bg-info/5 p-3 text-sm">
            <p>
              <strong>Demo with fictional data.</strong> <span className="text-muted">“Alex” and every account, bill and plan here are made up. Nothing is saved.</span>
            </p>
            <Link href="/login?mode=signup" className="btn btn-primary btn-sm">Create your own</Link>
          </div>
          <main id="main">
            <h1 className="mb-4 text-2xl font-bold tracking-tight">Today and what's next</h1>
            <Dashboard snapshot={snapshot} today={today} nowIso={now.toISOString()} demo />
          </main>
        </div>
      </DemoProvider>
    </PrivacyProvider>
  );
}
