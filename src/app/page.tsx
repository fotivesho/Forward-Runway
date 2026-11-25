import Link from "next/link";
import { ThemeToggle } from "@/components/theme";
import { Logo } from "@/components/logo";
import { AffordIt } from "@/components/landing/afford-it";
import { HeroCard } from "@/components/landing/hero-card";
import { RevealRoot } from "@/components/landing/motion";
import { SpokenFor } from "@/components/landing/spoken-for";
import { APP_NAME, APP_TAGLINE } from "@/lib/brand";
import { formatShort, formatWeekday, todayInZone } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { buildLanding } from "@/lib/view/landing";

export const dynamic = "force-dynamic";

const REC = {
  proceed: { label: "Go ahead", cls: "border-brand/40 text-brand" },
  cheaper: { label: "Cheaper version", cls: "border-warn/50 text-warn" },
  postpone: { label: "Postpone", cls: "border-info/50 text-info" },
  skip: { label: "Skip", cls: "border-danger/50 text-danger" },
  duplicate: { label: "Duplicate caught", cls: "border-info/50 text-info" },
  needs_estimate: { label: "Asks you", cls: "border-warn/50 text-warn" },
} as const;

export default async function Landing({ searchParams }: { searchParams: Promise<{ deleted?: string }> }) {
  const { deleted } = await searchParams;
  const now = new Date();
  // Fictional sample data only, computed by the real engine.
  const d = buildLanding(todayInZone("America/New_York", now), now.toISOString());
  const maxCap = Math.max(1, ...d.weekCaps.map((c) => c.capCents));
  const shownEvents = d.events.filter((e) => e.estimateCents > 0 || e.recommendation === "duplicate" || e.recommendation === "needs_estimate").slice(0, 4);

  return (
    <>
      <RevealRoot />
      {/* ------------------------------------------------------------ hero */}
      <div className="brand-band">
        <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
          <Logo size="lg" inverse />
          <nav aria-label="Site" className="flex items-center gap-2">
            <ThemeToggle />
            <Link href="/login" className="btn btn-sm border border-white/20 text-[#f1f6ea] hover:bg-white/10">Sign in</Link>
          </nav>
        </header>
        {deleted && (
          <p role="status" className="mx-auto max-w-6xl px-4 text-sm text-[#ddefbf] sm:px-6">Your account and all of its data have been deleted.</p>
        )}
        <main id="main" className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-20 pt-8 sm:px-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:pb-28 lg:pt-14">
          <div>
            <p className="fade-up text-sm font-semibold uppercase tracking-[0.2em] text-[#ddefbf]">{APP_TAGLINE}</p>
            <h1 className="font-display fade-up mt-4 text-5xl leading-[1.04] sm:text-6xl lg:text-7xl" style={{ animationDelay: "120ms" }}>
              Know what's safe to spend, <span className="text-[#ddefbf]">before you spend it.</span>
            </h1>
            <p className="fade-up mt-6 max-w-xl text-lg leading-relaxed text-[#b9cbb4] sm:text-xl" style={{ animationDelay: "240ms" }}>
              {APP_NAME} looks ahead at every payday, bill, card statement and plan on your calendar, then tells you exactly what's yours to
              spend today. Down to the dollar.
            </p>
            <div className="fade-up mt-8 flex flex-wrap items-center gap-3" style={{ animationDelay: "360ms" }}>
              <Link href="/demo" className="btn bg-[#ddefbf] px-6 text-base text-[#182d26] hover:bg-white">
                See it with sample money →
              </Link>
              <Link href="/login?mode=signup" className="btn border border-white/25 px-6 text-base text-[#f1f6ea] hover:bg-white/10">
                Create your runway
              </Link>
            </div>
            <p className="fade-up mt-4 text-sm text-[#b9cbb4]" style={{ animationDelay: "480ms" }}>No bank login needed · About five minutes to set up</p>
          </div>
          <div className="fade-up" style={{ animationDelay: "200ms" }}>
            <HeroCard hero={d.hero} />
          </div>
        </main>
      </div>

      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        {/* ---------------------------------------------- the problem */}
        <section className="reveal py-20 sm:py-28" aria-label="What your balance doesn't show">
          <SpokenFor data={d.spokenFor} />
        </section>

        {/* ---------------------------------------------- can I afford it */}
        <section className="reveal border-t border-line py-20 sm:py-28" aria-labelledby="afford-title">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-brand">Try it right here</p>
          <h2 id="afford-title" className="font-display mt-3 max-w-3xl text-4xl leading-tight text-ink sm:text-5xl">
            “Can I afford it?” Get a real answer in a second.
          </h2>
          <p className="mt-4 max-w-2xl text-lg text-muted">
            Not a vibe. Not a budget category. The actual effect on every day ahead, your card payments and your savings, with a plan if it
            needs one.
          </p>
          <div className="mt-10">
            <AffordIt snapshot={d.snapshot} today={d.today} nextPayday={d.hero.nextPayday} />
          </div>
        </section>

        {/* ---------------------------------------------- tidbits */}
        <section className="reveal border-t border-line py-20 sm:py-28" aria-labelledby="magic-title">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-brand">The little things</p>
          <h2 id="magic-title" className="font-display mt-3 max-w-3xl text-4xl leading-tight text-ink sm:text-5xl">Details that feel like magic.</h2>
          <div className="mt-10 grid gap-4 md:grid-cols-6">
            {/* Calendar */}
            <article className="card reveal p-6 md:col-span-4">
              <h3 className="text-lg font-semibold text-ink">Your calendar, priced.</h3>
              <p className="mt-1 text-sm text-muted">
                Every plan on your calendars, shared ones included, gets an estimated cost, a spending cap and a call: go ahead, go cheaper,
                postpone or skip.
              </p>
              <ul className="mt-5 space-y-2">
                {shownEvents.map((e) => (
                  <li key={e.title + e.date} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-surface-2/60 px-3 py-2.5">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-ink">{e.title}</span>
                      <span className="text-xs text-muted">
                        {formatShort(e.date)}
                        {e.recommendation !== "duplicate" && e.recommendation !== "needs_estimate" && <> · est. {formatCents(e.estimateCents)} · cap {formatCents(e.capCents)}</>}
                        {e.recommendation === "duplicate" && <> · on two calendars, counted once</>}
                        {e.recommendation === "needs_estimate" && <> · no guess, it asks you once and remembers</>}
                      </span>
                    </span>
                    <span className={`whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold ${REC[e.recommendation as keyof typeof REC]?.cls ?? REC.proceed.cls}`}>
                      {REC[e.recommendation as keyof typeof REC]?.label ?? "Go ahead"}
                    </span>
                  </li>
                ))}
              </ul>
            </article>

            {/* Wedding fund */}
            {d.wedding && (
              <article className="card reveal flex flex-col p-6 md:col-span-2">
                <h3 className="text-lg font-semibold text-ink">Wedding fund, protected.</h3>
                <p className="mt-1 text-sm text-muted">Goal money lives apart from spending money. It's never offered up to cover a purchase unless you say so.</p>
                <div className="mt-auto flex items-center gap-4 pt-6">
                  <svg viewBox="0 0 120 120" className="h-28 w-28 shrink-0 -rotate-90" aria-hidden="true">
                    <circle cx="60" cy="60" r="50" fill="none" stroke="var(--color-surface-3)" strokeWidth="12" />
                    <circle cx="60" cy="60" r="50" fill="none" stroke="var(--color-brand)" strokeWidth="12" strokeLinecap="round" strokeDasharray={`${(d.wedding.pct / 100) * 314} 314`} />
                  </svg>
                  <p>
                    <span className="font-display block text-4xl text-ink">{d.wedding.pct}%</span>
                    <span className="text-sm text-muted tabular">{formatCents(d.wedding.balanceCents, { compact: true })} of {formatCents(d.wedding.targetCents, { compact: true })}</span>
                  </p>
                </div>
              </article>
            )}

            {/* Cards once */}
            {d.card && (
              <article className="card reveal p-6 md:col-span-3">
                <h3 className="text-lg font-semibold text-ink">Card purchases, counted once.</h3>
                <p className="mt-1 text-sm text-muted">Swipe your card and your cash doesn't move. It moves once, when the statement is paid in full.</p>
                <ol className="mt-6 grid grid-cols-3 gap-2 text-center text-xs">
                  {[
                    ["You buy", d.card.purchaseDate, "on " + d.card.name],
                    ["Statement closes", d.card.closingDate, "cash untouched"],
                    ["Paid in full", d.card.dueDate, "from checking"],
                  ].map(([t, date, sub], i) => (
                    <li key={t} className="relative rounded-xl border border-line bg-surface-2/60 p-3">
                      <span className="block font-semibold text-ink">{t}</span>
                      <span className="font-display block text-xl text-brand">{formatShort(date!)}</span>
                      <span className="text-muted">{sub}</span>
                      {i < 2 && <span aria-hidden className="absolute -right-2 top-1/2 z-10 -translate-y-1/2 text-faint">›</span>}
                    </li>
                  ))}
                </ol>
              </article>
            )}

            {/* Weekday caps */}
            <article className="card reveal p-6 md:col-span-3">
              <h3 className="text-lg font-semibold text-ink">Daily caps that know your week.</h3>
              <p className="mt-1 text-sm text-muted">It learns when you usually spend, leaves room for plans, and recalculates the moment you log a purchase.</p>
              <div className="mt-6 flex h-32 items-end gap-2" role="img" aria-label="Example daily spending caps for the coming days">
                {d.weekCaps.map((c) => (
                  <div key={c.date} className="flex flex-1 flex-col items-center gap-1">
                    <span className="text-[11px] font-semibold tabular text-ink">${Math.trunc(c.capCents / 100)}</span>
                    <span className={`w-full rounded-t-md ${c.hasPlan ? "bg-info/70" : "bg-brand"}`} style={{ height: `${Math.max(6, (c.capCents / maxCap) * 88)}px` }} />
                    <span className="text-[11px] text-faint">{formatWeekday(c.date)}</span>
                  </div>
                ))}
              </div>
            </article>

            {/* Small truths */}
            {[
              ["Never fooled by an empty calendar.", "A calendar that fails to sync is flagged, not read as “no plans.” A buffer is held back until it's fixed."],
              ["Facts and estimates, never mixed.", "Confirmed amounts and educated guesses are labelled differently, and the forecast says when it's missing something."],
              ["One question, not twenty.", "When something important is missing, it asks you one focused question, then remembers your answer next time."],
            ].map(([t, body]) => (
              <article key={t} className="card reveal p-6 md:col-span-2">
                <h3 className="text-lg font-semibold text-ink">{t}</h3>
                <p className="mt-1 text-sm text-muted">{body}</p>
              </article>
            ))}
          </div>
        </section>

        {/* ---------------------------------------------- how it works */}
        <section className="reveal border-t border-line py-20 sm:py-28" aria-labelledby="how-title">
          <h2 id="how-title" className="font-display text-4xl leading-tight text-ink sm:text-5xl">Three steps to your number.</h2>
          <ol className="mt-10 grid gap-4 md:grid-cols-3">
            {[
              ["Add your balance and payday", "Checking balance, when you get paid, and your main bills. About five minutes, no bank login."],
              ["Connect your calendars", "Google, iCloud or Outlook, including calendars shared with a partner. Plans get priced automatically."],
              ["Check your number each morning", "Safe to spend today, what's coming up, and whether that plan on Saturday fits."],
            ].map(([t, body], i) => (
              <li key={t} className="card p-6">
                <span className="font-display text-5xl text-brand">{i + 1}</span>
                <h3 className="mt-3 text-lg font-semibold text-ink">{t}</h3>
                <p className="mt-1 text-sm text-muted">{body}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* ---------------------------------------------- privacy */}
        <section className="reveal border-t border-line py-20 sm:py-28" aria-labelledby="privacy-title">
          <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
            <div>
              <h2 id="privacy-title" className="font-display text-4xl leading-tight text-ink sm:text-5xl">Private by design.</h2>
              <p className="mt-4 text-lg text-muted">Your money is nobody's business. We built it that way.</p>
            </div>
            <ul className="grid gap-4 sm:grid-cols-2">
              {[
                ["Only you can see your data", "The database itself refuses to show your rows to anyone else."],
                ["No bank login required", "You enter what matters. Nothing is pulled from your bank without you."],
                ["Every number explainable", "Plain, deterministic math with its assumptions listed. No black box."],
                ["Export or delete anytime", "Download everything as a file, or erase it all, in Settings."],
              ].map(([t, body]) => (
                <li key={t} className="rounded-2xl border border-line p-5">
                  <h3 className="font-semibold text-ink">{t}</h3>
                  <p className="mt-1 text-sm text-muted">{body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>

      {/* ------------------------------------------------ final call to action */}
      <section className="brand-band" aria-labelledby="cta-title">
        <div className="reveal mx-auto max-w-6xl px-4 py-20 text-center sm:px-6 sm:py-28">
          <h2 id="cta-title" className="font-display text-5xl leading-tight sm:text-6xl">Clear for takeoff.</h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-[#b9cbb4]">
            Take the demo for a spin with sample money, or set up your own runway in about five minutes.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/demo" className="btn bg-[#ddefbf] px-6 text-base text-[#182d26] hover:bg-white">See it with sample money →</Link>
            <Link href="/login?mode=signup" className="btn border border-white/25 px-6 text-base text-[#f1f6ea] hover:bg-white/10">Create your runway</Link>
          </div>
        </div>
        <footer className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 border-t border-white/10 px-4 py-6 text-xs text-[#b9cbb4] sm:px-6">
          <span>© {new Date().getFullYear()} {APP_NAME}. Examples on this page use made-up sample data.</span>
          <span className="flex gap-4">
            <Link href="/privacy" className="underline">Privacy</Link>
            <Link href="/login" className="underline">Sign in</Link>
          </span>
        </footer>
      </section>
    </>
  );
}
