import Link from "next/link";
import { ThemeToggle } from "@/components/theme";
import { Logo } from "@/components/logo";
import { HeroAfford } from "@/components/landing/hero-afford";
import { PlannerTry } from "@/components/landing/planner-try";
import { Showcase, StickyDemo } from "@/components/landing/showcase";
import { PlanResults } from "@/components/plan-results";
import { PatternExplorer } from "@/components/pattern-explorer";
import { RevealRoot } from "@/components/landing/motion";
import { SpokenFor } from "@/components/landing/spoken-for";
import { SnapshotTiles } from "@/components/snapshot";
import { APP_NAME, APP_TAGLINE } from "@/lib/brand";
import { formatWeekday, todayInZone } from "@/lib/dates";
import { formatCents } from "@/lib/money";
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
  const maxCap = Math.max(1, ...d.weekCaps.map((c) => c.capCents));

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
              Know what's safe to spend, <span className="text-[#ddefbf]">before you spend it.</span>
            </h1>
            <p className="fade-up mt-4 max-w-xl text-base leading-relaxed text-[#b9cbb4] sm:mt-6 sm:text-xl" style={{ animationDelay: "240ms" }}>
              {APP_NAME} looks ahead at every payday, bill, card statement and plan, then tells you what's truly yours to spend today.
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
            <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#b9cbb4] sm:text-sm">
              <span className="font-semibold text-[#ddefbf]">Connect once. That&apos;s it.</span>
              <span className="flex items-center gap-1"><Glyph name="bank" size="xs" bare /> Bank</span>
              <span className="flex items-center gap-1"><Glyph name="card" size="xs" bare /> Cards</span>
              <span className="flex items-center gap-1"><Glyph name="plan" size="xs" bare /> Calendars</span>
            </p>
          </div>
        </main>
      </div>

      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        {/* ---------------------------------------------- what it does: one tabbed showcase */}
        <section id="showcase" className="py-12 sm:py-20" aria-label="What it does">
          <Showcase
            tabs={[
              {
                id: "plan",
                label: "Plan it",
                kicker: "Something coming up?",
                title: "Plan it before you live it.",
                blurb: <>For things you&apos;re doing anyway. Tap a plan: it knows what it usually costs <em>you</em>, and what it leaves.</>,
                content: <PlannerTry periods={d.planPeriods} history={d.explore} bias={d.bias} />,
                cta: { href: "/demo/calendar?add=1", label: "Plan yours in the demo" },
              },
              {
                id: "smarter",
                label: "Gets smarter",
                kicker: "Smart estimates",
                title: "Every plan makes the next one sharper.",
                blurb: "After each plan it finds the real charge, compares, and adjusts the next estimate.",
                content: (
                  <div className="grid grid-cols-[minmax(0,1fr)] gap-3 lg:grid-cols-2">
                    <PlanResults results={d.results} acc={d.accuracy} limit={3} accLimit={1} />
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wide text-faint">Coming next</p>
                      <ul className="mt-2 flex flex-wrap gap-1.5">
                        {["Knows the place's price level", "Splits group plans per person", "✦ Describe it in a sentence (AI)"].map((t) => (
                          <li key={t} className="flex items-center gap-1.5 rounded-full border border-dashed border-info/40 px-2.5 py-1 text-xs text-ink">
                            {t}<span className="rounded-full bg-info/12 px-1.5 text-[10px] font-bold text-info">Soon</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                ),
                cta: { href: "/demo/calendar", label: "See plans in the demo" },
              },
              {
                id: "patterns",
                label: "Patterns",
                kicker: "It learns you",
                title: "Habits you didn't notice.",
                blurb: "Swipe what it noticed, then tap in to explore.",
                content: (
                  <div className="grid grid-cols-[minmax(0,1fr)] gap-3">
                    <ul className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
                      {d.insights.map((i) => (
                        <li key={i.id} className={`flex w-44 shrink-0 snap-start items-center gap-2 rounded-2xl border bg-surface p-2.5 ${i.tone === "warn" ? "border-warn/50" : "border-line"}`}>
                          <Glyph name={i.icon} size="sm" />
                          <span className="min-w-0">
                          <p className={`text-base font-extrabold leading-tight tabular ${i.tone === "warn" ? "text-warn" : "text-ink"}`}>{i.stat}</p>
                          <p className="text-[11px] font-bold leading-snug text-ink">{i.title}</p>
                          </span>
                        </li>
                      ))}
                    </ul>
                    <PatternExplorer data={d.explore} compact />
                  </div>
                ),
                cta: { href: "/demo/spend/patterns", label: "Explore patterns in the demo" },
              },
              {
                id: "budget",
                label: "Budget",
                kicker: "Forward, not backward",
                title: "A budget that knows your life.",
                blurb: "Not last month's copy. Bills and plans as scheduled, plus everyday life predicted from your habits.",
                content: (() => {
                  const b = d.budget;
                  const parts = [
                    { k: "Needs", c: b.groups.needs, cls: "bg-info" },
                    { k: "Wants", c: b.groups.wants, cls: "bg-brand" },
                    { k: "Savings", c: b.groups.savings, cls: "bg-warn" },
                  ];
                  return (
                    <article className="card p-4 lg:max-w-2xl">
                      <p className="flex items-baseline justify-between text-sm text-muted">
                        <span>This month&apos;s income</span>
                        <span className="font-num text-2xl text-display">${Math.round(b.incomeCents / 100).toLocaleString("en-US")}</span>
                      </p>
                      <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-surface-3" aria-hidden>
                        {parts.map((p) => <span key={p.k} className={p.cls} style={{ width: `${(p.c.budgetCents / Math.max(1, b.incomeCents)) * 100}%` }} />)}
                      </div>
                      <ul className="mt-3 space-y-2.5 text-sm">
                        {parts.map((p) => {
                          const pct = p.c.budgetCents ? Math.min(100, (p.c.spentCents / p.c.budgetCents) * 100) : 0;
                          return (
                            <li key={p.k}>
                              <span className="flex justify-between">
                                <span className="text-ink"><span className={`mr-1.5 inline-block h-2 w-2 rounded-full ${p.cls}`} />{p.k}</span>
                                <span className="tabular text-muted">${Math.round(p.c.spentCents / 100).toLocaleString("en-US")} of ${Math.round(p.c.budgetCents / 100).toLocaleString("en-US")}</span>
                              </span>
                              <span className="mt-1 block h-1.5 rounded-full bg-surface-3"><span className={`block h-1.5 rounded-full ${p.cls}`} style={{ width: `${pct}%` }} /></span>
                            </li>
                          );
                        })}
                      </ul>
                      {d.habits.length > 0 && (
                        <>
                          <p className="mt-4 text-xs font-bold text-ink">Predicted this week, everyday</p>
                          <ul className="mt-2 flex flex-wrap gap-1.5">
                            {d.habits.map((h) => (
                              <li key={h.category} className="flex items-center gap-1.5 rounded-full border border-dashed border-line px-2.5 py-1 text-xs text-muted">
                                <Glyph name={h.category} size="xs" bare /> {h.category} <b className="text-ink">~${Math.round(h.expectedCents / 100)}</b>
                              </li>
                            ))}
                          </ul>
                        </>
                      )}
                    </article>
                  );
                })(),
                cta: { href: "/demo/spend/budget", label: "Open the budget in the demo" },
              },
              {
                id: "daily",
                label: "Every day",
                kicker: "Every morning",
                title: "One look, every morning.",
                blurb: "Your accounts, and daily limits that know your week: more room on plan days.",
                content: (
                  <div className="grid grid-cols-[minmax(0,1fr)] gap-3 lg:grid-cols-2">
                    <article className="card p-4">
                      <SnapshotTiles m={d.overview} today={d.today} nowMs={now.getTime()} />
                    </article>
                    <article className="card p-4">
                      <h3 className="text-sm font-bold text-ink">Daily caps this week</h3>
                      <div className="mt-3 flex h-20 items-end gap-1.5" role="img" aria-label="Example daily spending caps">
                        {d.weekCaps.map((c) => (
                          <div key={c.date} className="flex flex-1 flex-col items-center gap-1">
                            <span className="text-[10px] tabular text-faint">${Math.round(c.capCents / 100)}</span>
                            <span className={`w-full rounded-md ${c.hasPlan ? "bg-info/70" : "bg-brand"}`} style={{ height: `${Math.max(5, (c.capCents / maxCap) * 48)}px` }} />
                            <span className="text-[10px] text-faint">{formatWeekday(c.date)}</span>
                          </div>
                        ))}
                      </div>
                      <p className="mt-2 text-[11px] text-faint"><span className="mr-1 inline-block h-2 w-2 rounded-full bg-info/70" />plan days get extra room</p>
                    </article>
                  </div>
                ),
                cta: { href: "/demo", label: "See today in the demo" },
              },
              {
                id: "balance",
                label: "Balance",
                kicker: "Why not just check the bank?",
                title: `Your bank says ${formatCents(d.spokenFor.startCents)}. It's not the full story.`,
                blurb: <>Rent, the card bill and savings already have jobs. Walk it forward and what&apos;s truly yours today is <b className="text-ink">{formatCents(d.spokenFor.safeTodayCents)}</b>.</>,
                content: <SpokenFor data={d.spokenFor} listOnly />,
                cta: { href: "/demo/forecast", label: "See the forecast in the demo" },
              },
            ]}
          />
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

        {/* ---------------------------------------------- privacy, slim */}
        <section className="reveal border-t border-line py-12 sm:py-16" aria-labelledby="priv-title">
          <h2 id="priv-title" className="text-sm font-bold uppercase tracking-[0.16em] text-brand">Private by design</h2>
          <ul className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["lock", "Only you see your data", "The database itself enforces it."],
              ["bank", "Read-only bank access", "Through Plaid. Nothing can move your money."],
              ["📊", "Every number explained", "Plain math, assumptions listed."],
              ["⚙", "Export or delete anytime", "Right from Settings."],
            ].map(([g, t, b]) => (
              <li key={t} className="flex gap-3">
                <Glyph name={g} size="md" />
                <span><span className="block font-bold text-ink">{t}</span><span className="text-muted">{b}</span></span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {/* ------------------------------------------------ final call to action */}
      <section className="brand-band" aria-labelledby="cta-title">
        <div className="reveal mx-auto max-w-6xl px-4 py-16 text-center sm:px-6 sm:py-24">
          <h2 id="cta-title" className="font-display text-5xl leading-tight sm:text-6xl">Clear for takeoff.</h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-[#b9cbb4]">Connect once, and every morning you'll know what's safe to spend. Or try it first with sample money.</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/login?mode=signup" className={PRIMARY}>Create your runway →</Link>
            <Link href="/demo/calendar?add=1" className={SECONDARY}>See it with sample money</Link>
          </div>
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
