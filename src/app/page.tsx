import Link from "next/link";
import { ThemeToggle } from "@/components/theme";
import { Logo } from "@/components/logo";
import { HeroAfford } from "@/components/landing/hero-afford";
import { PlannerShowcase } from "@/components/landing/planner-showcase";
import { RevealRoot } from "@/components/landing/motion";
import { SpokenFor } from "@/components/landing/spoken-for";
import { SnapshotTiles } from "@/components/snapshot";
import { APP_NAME, APP_TAGLINE } from "@/lib/brand";
import { formatShort, formatWeekday, todayInZone } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { Glyph } from "@/components/icon";
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
            <HeroAfford hero={d.hero} snapshot={d.snapshot} today={d.today} events={d.afford.events} calendarIncomplete={d.afford.calendarIncomplete} />
          </div>
          <div className="fade-up lg:col-start-1 lg:row-start-2 lg:self-start" style={{ animationDelay: "360ms" }}>
            <div className="flex flex-wrap items-center gap-3">
              <Link href="/demo/calendar?add=1" className={PRIMARY}>See it with sample money →</Link>
              <Link href="/login?mode=signup" className={SECONDARY}>Create your runway</Link>
            </div>
            <p className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-[#b9cbb4]">
              <span className="font-semibold text-[#ddefbf]">Connect once. That's it.</span>
              <span className="flex items-center gap-1.5"><Glyph name="bank" size="xs" /> Bank</span>
              <span className="flex items-center gap-1.5"><Glyph name="card" size="xs" /> Cards</span>
              <span className="flex items-center gap-1.5"><Glyph name="plan" size="xs" /> Calendars</span>
            </p>
          </div>
        </main>
      </div>

      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        {/* ---------------------------------------------- plan it */}
        {d.planner && (
          <section className="reveal py-14 sm:py-20" aria-labelledby="plan-title">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand sm:text-sm">Something coming up?</p>
            <h2 id="plan-title" className="font-display mt-1 max-w-3xl text-4xl leading-tight text-display sm:text-6xl">Plan it before you live it.</h2>
            <p className="mt-3 max-w-2xl text-base text-muted sm:text-lg">&ldquo;Can I afford it?&rdquo; is for a maybe. This is for the things you&apos;re doing anyway: dinners, trips, birthdays. Three taps and you know what&apos;s free, what it usually costs you, and that it fits.</p>
            <div className="mt-8"><PlannerShowcase planner={d.planner} /></div>
          </section>
        )}

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

        {/* ---------------------------------------------- it learns your life */}
        <section className="reveal border-t border-line py-14 sm:py-20" aria-labelledby="learns-title">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand sm:text-sm">It learns you</p>
          <h2 id="learns-title" className="font-display mt-1 max-w-3xl text-3xl leading-tight text-display sm:text-5xl">Plans you made. Habits you didn't notice.</h2>
          <p className="mt-3 max-w-2xl text-base text-muted sm:text-lg">Your calendar covers the planned life. Your history covers the rest: lunch, rides, the payday splurge. Budgets come from both.</p>
          <div className="mt-8 grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-2">
            <article className="card p-4 sm:p-5">
              <h3 className="font-bold text-ink">What it noticed</h3>
              <ul className="mt-3 grid grid-cols-2 gap-2">
                {d.insights.map((i) => (
                  <li key={i.id} className={`rounded-2xl border bg-surface p-3 ${i.tone === "warn" ? "border-warn/50" : "border-line"}`}>
                    <Glyph name={i.icon} size="md" />
                    <p className={`mt-2 text-xl font-extrabold tabular ${i.tone === "warn" ? "text-warn" : "text-ink"}`}>{i.stat}</p>
                    <p className="text-xs font-bold leading-snug text-ink">{i.title}</p>
                  </li>
                ))}
              </ul>
              {d.habits.length > 0 && (
                <>
                  <h3 className="mt-5 font-bold text-ink">Next 7 days, everyday</h3>
                  <ul className="mt-2 grid grid-cols-2 gap-1.5">
                    {d.habits.map((h) => (
                      <li key={h.category} className="flex items-center gap-2 rounded-xl border border-dashed border-line px-2 py-1.5">
                        <Glyph name={h.category} size="sm" />
                        <span className="min-w-0 flex-1 truncate text-xs font-bold text-ink">{h.category}</span>
                        <span className="text-xs font-bold tabular text-ink">~${Math.round(h.expectedCents / 100)}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </article>
            <article className="card p-4 sm:p-5">
              <h3 className="font-bold text-ink">A budget that knows your life</h3>
              <p className="mt-1 text-sm text-muted">Not last month's copy. Bills and plans as scheduled, plus everyday life predicted from your patterns.</p>
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
        </section>

        {/* ---------------------------------------------- supporting proof, compact */}
        <section className="reveal border-t border-line py-14 sm:py-20" aria-labelledby="also-title">
          <h2 id="also-title" className="font-display text-3xl leading-tight text-display sm:text-4xl">Everything it watches for you.</h2>
          <div className="mt-8 grid grid-cols-[minmax(0,1fr)] gap-4 ">
            <article className="card p-4 sm:p-5">
              <h3 className="font-semibold text-ink">Everything, in one look</h3>
              <p className="mt-1 text-sm text-muted">Balances and card statements straight from your bank, or typed in. Always with when each was last updated.</p>
              <div className="mt-3">
                <SnapshotTiles m={d.overview} today={d.today} nowMs={now.getTime()} />
              </div>
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

        {/* ---------------------------------------------- the short why */}
        <section className="reveal border-t border-line py-14 sm:py-20" aria-label="What your balance doesn't show">
          <SpokenFor data={d.spokenFor} />
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
