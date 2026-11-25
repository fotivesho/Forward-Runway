import Link from "next/link";
import type { Metadata } from "next";
import { AppNav } from "@/components/app-nav";
import { PrivacyProvider } from "@/components/privacy";
import { getAppSession } from "@/lib/data/session";
import { formatLong } from "@/lib/dates";
import { setHideAmounts, signOut } from "./actions";

export const metadata: Metadata = { title: "Today", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { snapshot, today, user } = await getAppSession();
  const hide = snapshot.profile.hideAmounts;
  return (
    <PrivacyProvider hide={hide}>
      <div className="mx-auto min-h-dvh max-w-7xl px-4 pb-24 pt-4 sm:px-6 lg:pb-10">
        <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <Link href="/app" className="flex items-center gap-2 font-bold text-ink">
            <img src="/icon.svg" alt="" width={28} height={28} />
            Forward Runway
          </Link>
          <div className="flex items-center gap-2 text-sm">
            <span className="hidden text-muted sm:inline">{formatLong(today)}</span>
            <form action={setHideAmounts}>
              <input type="hidden" name="hide" value={hide ? "false" : "true"} />
              <button className="btn btn-ghost btn-sm" aria-pressed={hide} title="Hide amounts on screen (for when someone is looking over your shoulder)">
                {hide ? "Show amounts" : "Hide amounts"}
              </button>
            </form>
            <form action={signOut}>
              <button className="btn btn-ghost btn-sm" title={user.email ?? undefined}>Sign out</button>
            </form>
          </div>
        </header>
        <div className="lg:grid lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-6">
          <AppNav />
          <main id="main">{children}</main>
        </div>
      </div>
    </PrivacyProvider>
  );
}
