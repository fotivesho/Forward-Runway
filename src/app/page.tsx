import Link from "next/link";
import { ThemeToggle } from "@/components/theme";
import { Logo } from "@/components/logo";
import { HeroAfford } from "@/components/landing/hero-afford";
import { StickyDemo } from "@/components/landing/showcase";
import { Story } from "@/components/landing/story";
import { Ask } from "@/components/landing/ask";
import { UpdatesForm } from "@/components/landing/updates-form";
import { RevealRoot } from "@/components/landing/motion";
import { APP_NAME, APP_TAGLINE } from "@/lib/brand";
import { todayInZone } from "@/lib/dates";
import { Glyph } from "@/components/icon";
import { buildLanding } from "@/lib/view/landing";

export const dynamic = "force-dynamic";


const PRIMARY = "btn bg-[#ddefbf] px-6 text-base text-[#182d26] hover:bg-white";
const SECONDARY = "btn border border-white/25 px-6 text-base text-[#f1f6ea] hover:bg-white/10";

export default async function Landing({ searchParams }: { searchParams: Promise<{ deleted?: string }> }) {
  const { deleted } = await searchParams;
  const now = new Date();
  // Fictional sample data only, computed by the real engine.
  const d = buildLanding(todayInZone("America/New_York", now), now.toISOString());

  return (
    <>
      <RevealRoot />
      <StickyDemo />
      {/* ------------------------------------------------------------ hero */}
      <div className="brand-band">
        <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6 sm:py-5">
          <Logo size="lg" inverse />
          <nav aria-label="Site" className="flex items-center gap-2">
            <ThemeToggle />
            <Link href="/login" className="btn btn-sm border border-white/20 text-[#f1f6ea] hover:bg-white/10">Sign in</Link>
          </nav>
        </header>
        {deleted && (
          <p role="status" className="mx-auto max-w-6xl px-4 text-sm text-[#ddefbf] sm:px-6">Your account and all of its data have been deleted.</p>
        )}
        {/* Mobile order: headline, live card, buttons. Desktop: text + buttons left, card right. */}
        <main id="main" className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)] gap-x-12 gap-y-8 px-4 pb-10 pt-4 sm:px-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:pb-24 lg:pt-12">
          <div className="lg:col-start-1 lg:row-start-1 lg:self-end">
            <p className="fade-up text-xs font-semibold uppercase tracking-[0.2em] text-[#ddefbf] sm:text-sm">{APP_TAGLINE}</p>
            <h1 className="font-display fade-up mt-3 text-[2.6rem] leading-[1.04] sm:text-6xl lg:text-7xl" style={{ animationDelay: "120ms" }}>
              Budgets look back. <span className="text-[#ddefbf]">Runway looks ahead.</span>
            </h1>
            <p className="fade-up mt-4 max-w-xl text-base leading-relaxed text-[#b9cbb4] sm:mt-6 sm:text-xl" style={{ animationDelay: "240ms" }}>
              {APP_NAME} turns the life you&apos;ve planned and the habits you haven&apos;t into a budget for the month ahead. Know what&apos;s safe to spend, before you spend it.
            </p>
          </div>
          <div className="fade-up lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-center" style={{ animationDelay: "200ms" }}>
            <HeroAfford hero={d.hero} snapshot={d.snapshot} today={d.today} events={d.afford.events} calendarIncomplete={d.afford.calendarIncomplete} />
          </div>
          <div className="fade-up lg:col-start-1 lg:row-start-2 lg:self-start" style={{ animationDelay: "360ms" }}>
            <div className="grid grid-cols-[1.3fr_1fr] gap-2 sm:flex sm:gap-3">
              <Link href="/demo/calendar?add=1" className={`${PRIMARY} justify-center px-3 sm:px-6`}>Try the demo →</Link>
              <Link href="/login?mode=signup" className={`${SECONDARY} justify-center px-3 sm:px-6`}>Sign up free</Link>
            </div>
            <p className="mt-3 flex items-center gap-2 whitespace-nowrap text-xs text-[#b9cbb4] sm:text-sm">
              <span className="rounded-full bg-[#ddefbf]/15 px-2 py-0.5 font-semibold text-[#ddefbf]">Free beta</span>
              <span>Connect your bank, cards and calendar once.</span>
            </p>
          </div>
        </main>
      </div>

      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        {/* ---------------------------------------------- the story, in five pictures */}
        <section id="showcase" className="pt-12 sm:pt-20" aria-labelledby="how-title">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand sm:text-sm">How it works</p>
          <h2 id="how-title" className="font-display mt-1 max-w-3xl text-4xl leading-tight text-display sm:text-5xl">Your calendar is your budget.</h2>
          <p className="mt-3 max-w-2xl text-base text-muted sm:text-lg">Traditional budgets copy last month and hope. Runway starts from what&apos;s actually coming.</p>
          <Story d={d} />
        </section>

        {/* ---------------------------------------------- connect once */}
        <section className="reveal border-t border-line py-14 sm:py-20" aria-labelledby="once-title">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand sm:text-sm">Set up once</p>
          <h2 id="once-title" className="font-display mt-1 max-w-3xl text-4xl leading-tight text-display sm:text-6xl">Connect once. That's it.</h2>
          <p className="mt-3 max-w-2xl text-base text-muted sm:text-lg">No spreadsheets, no categorizing, no logging every coffee. It keeps itself up to date.</p>
          <ol className="mt-8 grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-3">
            {[
              { g: "bank", t: "Your bank and cards", b: "Balances, purchases and statements flow in. Read-only, through Plaid: your login never reaches us and nothing can move your money." },
              { g: "plan", t: "Your calendars", b: "Google, iCloud or Outlook, shared ones too. Every plan gets a price and a verdict." },
              { g: "💸", t: "Then it just runs", b: "Every morning: what's safe today, what's coming, and what your habits say you'll spend. Ask “can I afford it?” anytime." },
            ].map((x, i) => (
              <li key={x.t} className="relative rounded-2xl border border-line bg-surface p-5">
                <span className="absolute right-4 top-4 font-display text-3xl leading-none text-brand/30">{i + 1}</span>
                <Glyph name={x.g} size="lg" />
                <span className="mt-3 block text-lg font-bold text-ink">{x.t}</span>
                <span className="mt-1 block text-sm text-muted">{x.b}</span>
              </li>
            ))}
          </ol>
        </section>

        {/* ---------------------------------------------- questions, answered like a chat */}
        <section className="reveal border-t border-line py-12 sm:py-16" aria-labelledby="ask-title">
          <h2 id="ask-title" className="font-display text-center text-3xl leading-tight text-display sm:text-4xl">Good questions.</h2>
          <p className="mt-2 text-center text-sm text-muted">Tap one.</p>
          <div className="mt-6"><Ask /></div>
        </section>
      </div>

      {/* ------------------------------------------------ final call to action */}
      <section className="brand-band" aria-labelledby="cta-title">
        <div className="reveal mx-auto max-w-6xl px-4 py-16 text-center sm:px-6 sm:py-24">
          <h2 id="cta-title" className="font-display text-5xl leading-tight sm:text-6xl">Clear for takeoff.</h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-[#b9cbb4]">Free while in beta. Connect once, and every morning you&apos;ll know what&apos;s safe to spend.</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/login?mode=signup" className={PRIMARY}>Create your runway →</Link>
            <Link href="/demo/calendar?add=1" className={SECONDARY}>See it with sample money</Link>
          </div>
          <div className="mt-10"><UpdatesForm /></div>
        </div>
        <footer className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 border-t border-white/10 px-4 py-6 text-xs text-[#b9cbb4] sm:px-6">
          <span>© {now.getFullYear()} {APP_NAME}. Examples on this page use made-up sample data.</span>
          <span className="flex gap-4">
            <Link href="/privacy" className="underline">Privacy</Link>
            <Link href="/terms" className="underline">Terms</Link>
            <Link href="/login" className="underline">Sign in</Link>
          </span>
        </footer>
      </section>
    </>
  );
}
