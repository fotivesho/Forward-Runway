import Link from "next/link";
import type { Metadata } from "next";
import { AppNav } from "@/components/app-nav";
import { PrivacyProvider } from "@/components/privacy";
import { ThemeToggle } from "@/components/theme";
import { getAppSession } from "@/lib/data/session";
import { formatLong } from "@/lib/dates";
import { setHideAmounts, signOut } from "./actions";
import { Eye, EyeOff, LogOut, Settings } from "lucide-react";
import { Logo } from "@/components/logo";
import { BankAutoSync } from "@/components/bank-auto-sync";
import { CategoryStylesProvider } from "@/components/custom-glyph";
import { plaidMode } from "@/lib/plaid/config";

const iconBtn = "flex h-8 w-8 items-center justify-center rounded-full text-muted transition hover:bg-surface-2 hover:text-ink";

export const metadata: Metadata = { title: "Today", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { snapshot, today, user } = await getAppSession();
  const hide = snapshot.profile.hideAmounts;
  return (
    <PrivacyProvider hide={hide}>
     <CategoryStylesProvider styles={Object.fromEntries((snapshot.categorySettings ?? []).filter((c) => c.icon || c.color).map((c) => [c.name, { icon: c.icon, color: c.color }]))}>
      {plaidMode() !== "off" && <BankAutoSync />}
      <div className="mx-auto min-h-dvh max-w-7xl px-4 pb-32 pt-4 sm:px-6 lg:pb-10">
        <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <Link href="/app" className="flex items-center">
            <Logo />
          </Link>
          <div className="flex items-center gap-0.5 text-sm">
            <span className="mr-2 hidden text-muted sm:inline">{formatLong(today)}</span>
            <ThemeToggle saved={snapshot.profile.theme} persist />
            <form action={setHideAmounts}>
              <input type="hidden" name="hide" value={hide ? "false" : "true"} />
              <button aria-pressed={hide} aria-label={hide ? "Show amounts" : "Hide amounts"} title={hide ? "Show amounts" : "Hide amounts (for when someone is looking over your shoulder)"} className={iconBtn}>
                {hide ? <EyeOff size={16} strokeWidth={2} aria-hidden /> : <Eye size={16} strokeWidth={2} aria-hidden />}
              </button>
            </form>
            <Link href="/app/settings" className={`${iconBtn} lg:hidden`} aria-label="Settings" title="Settings"><Settings size={16} strokeWidth={2} aria-hidden /></Link>
            <form action={signOut}>
              <button className={iconBtn} aria-label="Sign out" title={`Sign out${user.email ? ` (${user.email})` : ""}`}><LogOut size={16} strokeWidth={2} aria-hidden /></button>
            </form>
          </div>
        </header>
        <div className="lg:grid lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-6">
          <AppNav />
          <main id="main">{children}</main>
        </div>
      </div>
     </CategoryStylesProvider>
    </PrivacyProvider>
  );
}
