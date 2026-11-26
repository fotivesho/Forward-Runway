import Link from "next/link";
import { ThemeToggle } from "@/components/theme";
import { Logo } from "@/components/logo";
import { AffordIt } from "@/components/landing/afford-it";
import { HeroCard } from "@/components/landing/hero-card";
import { RevealRoot } from "@/components/landing/motion";
import { SpokenFor } from "@/components/landing/spoken-for";
import { SnapshotTiles } from "@/components/snapshot";
import { APP_NAME, APP_TAGLINE } from "@/lib/brand";
import { formatShort, formatWeekday, todayInZone } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { buildLanding } from "@/lib/view/landing";

export const dynamic = "force-dynamic";

const REC = {
  proceed: { label: "Go ahead", cls: "border-brand/40 text-brand" },
  cheaper: { label: "Go cheaper", cls: "border-warn/50 text-warn" },
  postpone: { label: "Wait", cls: "border-info/50 text-info" },
  skip: { label: "Skip", cls: "border-danger/50 text-danger" },
  needs_estimate: { label: "Asks you", cls: "border-warn/50 text-warn" },
} as const;

const PRIMARY = "btn bg-[#ddefbf] px-6 text-base text-[#182d26] hover:bg-white";
const SECONDARY = "btn border border-white/25 px-6 text-base text-[#f1f6ea] hover:bg-white/10";

export default async function Landing({ searchParams }: { searchParams: Promise<{ deleted?: string }> }) {
  const { deleted } = await searchParams;
  const now = new Date();
  // Fictional sample data only, computed by the real engine.
  const d = buildLanding(todayInZone("America/New_York", now), now.toISOString());
  const maxCap = Math.max(1, ...d.weekCaps.map((c) => c.capCents));
  const events = d.events.filter((e) => e.estimateCents > 0).slice(0, 3);

  return (
    <>
      <RevealRoot />
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
        <main id="main" className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)] gap-x-12 gap-y-8 px-4 pb-14 pt-4 sm:px-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:pb-24 lg:pt-12">
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
            <HeroCard hero={d.hero} />
          </div>
          <div className="fade-up lg:col-start-1 lg:row-start-2 lg:self-start" style={{ animationDelay: "360ms" }}>
            <div className="flex flex-wrap items-center gap-3">
              <Link href="/demo" className={PRIMARY}>See it with sample money →</Link>
              <Link href="/login?mode=signup" className={SECONDARY}>Create your runway</Link>
            </div>
            <p className="mt-4 text-sm text-[#b9cbb4]">
              Connect your bank or type it in · About five minutes to set up · <span className="text-[#ddefbf]">One-tap calendars coming soon</span>
            </p>
          </div>
        </main>
      </div>

      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        {/* ---------------------------------------------- the short why */}
        <section className="reveal py-14 sm:py-20" aria-label="What your balance doesn't show">
          <SpokenFor data={d.spokenFor} />
        </section>

        {/* ---------------------------------------------- the proof */}
        <section className="scroll-mt-4 pb-16 sm:pb-24" aria-labelledby="afford-title">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand sm:text-sm">Try it right here</p>
          <h2 id="afford-title" className="font-display mt-1 max-w-3xl scroll-mt-12 sm:scroll-mt-6 text-3xl leading-tight text-ink sm:mt-2 sm:text-5xl">Can I afford it?</h2>
          <p className="mt-1 hidden max-w-2xl text-sm text-muted sm:mt-3 sm:block sm:text-lg">Pick something and watch today's number, your lowest point, and what to do about it.</p>
          <div className="mt-3 sm:mt-8">
            <AffordIt snapshot={d.snapshot} today={d.today} nextPayday={d.hero.nextPayday} events={d.afford.events} calendarIncomplete={d.afford.calendarIncomplete} />
          </div>
        </section>

        {/* ---------------------------------------------- supporting proof, compact */}
        <section className="reveal border-t border-line py-14 sm:py-20" aria-labelledby="also-title">
          <h2 id="also-title" className="font-display text-3xl leading-tight text-ink sm:text-4xl">Behind that answer.</h2>
          <div className="mt-8 grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
            <article className="card p-4 sm:p-5">
              <h3 className="font-semibold text-ink">Everything, in one look</h3>
              <p className="mt-1 text-sm text-muted">Balances and card statements straight from your bank, or typed in. Always with when each was last updated.</p>
              <div className="mt-3">
                <SnapshotTiles m={d.overview} today={d.today} nowMs={now.getTime()} />
              </div>
            </article>
            <article className="card p-4 sm:p-5">
              <h3 className="font-semibold text-ink">A budget that fits your month</h3>
              <p className="mt-1 text-sm text-muted">Built from your income and your usual month. Savings and plans first; wants flex to fit.</p>
              {(() => {
                const b = d.budget;
                const parts = [
                  { k: "Needs", c: b.groups.needs, cls: "bg-info" },
                  { k: "Wants", c: b.groups.wants, cls: "bg-brand" },
                  { k: "Savings", c: b.groups.savings, cls: "bg-warn" },
                ];
                return (
                  <>
                    <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-surface-3" aria-hidden>
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
                  </>
                );
              })()}
            </article>
          </div>
          <div className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-3">
            <article className="card p-5">
              <h3 className="font-semibold text-ink">Your calendar, priced</h3>
              <p className="mt-1 text-sm text-muted">Every plan gets a cost, a cap and a clear answer: fits, fits with a plan, or not yet.</p>
              <ul className="mt-4 space-y-2">
                {events.map((e) => (
                  <li key={e.title + e.date} className="flex items-center justify-between gap-2 text-sm">
                    <span className="min-w-0 truncate text-ink">
                      {e.title}
                      <span className="ml-1 text-xs text-muted">{formatShort(e.date)}</span>
                    </span>
                    <span className={`whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold ${REC[e.recommendation as keyof typeof REC]?.cls ?? REC.proceed.cls}`}>
                      {e.recommendation === "proceed" ? `Cap ${formatCents(e.capCents, { compact: true })}` : (REC[e.recommendation as keyof typeof REC]?.label ?? "Go ahead")}
                    </span>
                  </li>
                ))}
              </ul>
            </article>
            <article className="card p-5">
              <h3 className="font-semibold text-ink">Daily caps that know your week</h3>
              <p className="mt-1 text-sm text-muted">More room on plan days, recalculated the moment you log a purchase.</p>
              <div className="mt-4 flex h-20 items-end gap-1.5" role="img" aria-label="Example daily spending caps">
                {d.weekCaps.map((c) => (
                  <div key={c.date} className="flex flex-1 flex-col items-center gap-1">
                    <span className={`w-full rounded-t ${c.hasPlan ? "bg-info/70" : "bg-brand"}`} style={{ height: `${Math.max(5, (c.capCents / maxCap) * 56)}px` }} />
                    <span className="text-[10px] text-faint">{formatWeekday(c.date)}</span>
                  </div>
                ))}
              </div>
            </article>
            <article className="card p-5">
              <h3 className="font-semibold text-ink">Cards counted once</h3>
              <p className="mt-1 text-sm text-muted">Swipe today and cash doesn't move. It moves once, when the statement is paid in full.</p>
              {d.card && (
                <p className="mt-4 flex items-center justify-between gap-1 text-center text-xs">
                  {[["Buy", d.card.purchaseDate], ["Statement", d.card.closingDate], ["Paid", d.card.dueDate]].map(([t, date], i) => (
                    <span key={t} className="flex flex-1 items-center gap-1">
                      <span className="flex-1 rounded-lg bg-surface-2/70 px-1 py-2">
                        <span className="block text-faint">{t}</span>
                        <span className="font-semibold text-ink">{formatShort(date!)}</span>
                      </span>
                      {i < 2 && <span aria-hidden className="text-faint">›</span>}
                    </span>
                  ))}
                </p>
              )}
            </article>
          </div>
          <ul className="mt-4 flex flex-wrap gap-2 text-sm text-muted">
            {[
              d.wedding ? `Wedding fund ${d.wedding.pct}% there, and protected` : "Savings goals protected",
              "Empty calendars never read as “no plans”",
              "Facts and estimates labelled",
              "One question, not twenty",
            ].map((t) => (
              <li key={t} className="rounded-full border border-line px-3 py-1">{t}</li>
            ))}
          </ul>
        </section>

        {/* ---------------------------------------------- how, soon, privacy: one slim strip */}
        <section className="reveal border-t border-line py-14 sm:py-20" aria-labelledby="how-title">
          <h2 id="how-title" className="font-display text-3xl leading-tight text-ink sm:text-4xl">Five minutes to your number.</h2>
          <ol className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-3">
            {[
              ["Connect your bank", "Or type your balance, payday and main bills. Your bank login never reaches us."],
              ["Add your calendars", "Google, iCloud or Outlook, shared ones too, with a private calendar link."],
              ["Check your number each morning", "And ask “can I afford it?” whenever you need."],
            ].map(([t, body], i) => (
              <li key={t} className="flex gap-3 rounded-2xl border border-line p-4">
                <span className="font-display text-3xl leading-none text-brand">{i + 1}</span>
                <span>
                  <span className="block font-semibold text-ink">{t}</span>
                  <span className="text-sm text-muted">{body}</span>
                </span>
              </li>
            ))}
          </ol>
          <div className="mt-10 grid grid-cols-[minmax(0,1fr)] gap-6 md:grid-cols-2">
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-brand">Coming soon</h3>
              <ul className="mt-3 space-y-2 text-sm text-muted">
                <li><span className="font-semibold text-ink">Spending patterns.</span> Payday splurges, creeping categories and forgotten subscriptions, with one nudge at a time.</li>
                <li><span className="font-semibold text-ink">One-tap calendars.</span> Sign in with Google or Apple. No links to copy.</li>
              </ul>
            </div>
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-brand">Private by design</h3>
              <ul className="mt-3 space-y-2 text-sm text-muted">
                <li><span className="font-semibold text-ink">Only you can see your data.</span> The database itself enforces it.</li>
                <li><span className="font-semibold text-ink">Bank connections are read-only,</span> through Plaid. Nothing can move your money.</li>
                <li><span className="font-semibold text-ink">Every number explainable.</span> Plain math, assumptions listed.</li>
                <li><span className="font-semibold text-ink">Export or delete anytime,</span> from Settings.</li>
              </ul>
            </div>
          </div>
        </section>
      </div>

      {/* ------------------------------------------------ final call to action */}
      <section className="brand-band" aria-labelledby="cta-title">
        <div className="reveal mx-auto max-w-6xl px-4 py-16 text-center sm:px-6 sm:py-24">
          <h2 id="cta-title" className="font-display text-5xl leading-tight sm:text-6xl">Clear for takeoff.</h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-[#b9cbb4]">Try it with sample money, or set up your own runway in about five minutes.</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/demo" className={PRIMARY}>See it with sample money →</Link>
            <Link href="/login?mode=signup" className={SECONDARY}>Create your runway</Link>
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
