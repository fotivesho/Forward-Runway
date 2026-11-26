import Link from "next/link";
import type { Metadata } from "next";
import { AppNav } from "@/components/app-nav";
import { DemoProvider } from "@/components/form";
import { PrivacyProvider } from "@/components/privacy";
import { ThemeToggle } from "@/components/theme";
import { DemoNudge } from "@/components/demo-nudge";
import { formatLong, todayInZone } from "@/lib/dates";
import { APP_NAME } from "@/lib/brand";
import { Logo } from "@/components/logo";

export const metadata: Metadata = { title: { default: "Demo", template: `%s · Demo · ${APP_NAME}` } };
export const dynamic = "force-dynamic";

/** Public demo shell. Every page under /demo uses ONLY fictional data generated in code. */
export default function DemoLayout({ children }: { children: React.ReactNode }) {
  return (
    <PrivacyProvider hide={false}>
      <DemoProvider demo>
        <div className="mx-auto min-h-dvh max-w-7xl px-4 pb-32 pt-4 sm:px-6 lg:pb-10">
          <div role="note" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-info/40 bg-info/5 p-3 text-sm">
            <p>
              <strong>Demo with fictional data.</strong>{" "}
              <span className="text-muted">“Alex” and every account, bill and plan here are made up. Forms are read-only and nothing is saved.</span>
            </p>
            <Link href="/login?mode=signup" className="btn btn-primary btn-sm">Create your own</Link>
          </div>
          <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <Link href="/" className="flex items-center">
              <Logo />
            </Link>
            <div className="flex items-center gap-3">
              <span className="hidden text-sm text-muted sm:inline">{formatLong(todayInZone("America/New_York"))}</span>
              <ThemeToggle />
            </div>
          </header>
          <div className="lg:grid lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-6">
            <AppNav base="/demo" />
            <main id="main">{children}</main>
          </div>
          <DemoNudge />
        </div>
      </DemoProvider>
    </PrivacyProvider>
  );
}
