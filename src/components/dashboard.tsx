"use client";

import { Sparkles } from "lucide-react";

import Link from "next/link";
import { useMemo, useState } from "react";
import { addDays, diffDays, formatShort, formatWeekday, type ISODate } from "@/lib/dates";
import type { Snapshot } from "@/lib/data/snapshot";
import { buildDashboard } from "@/lib/view/dashboard";
import { buildBudget } from "@/lib/view/budget";
import { EventCard, QuestionCard, QuickLog } from "./advisor";
import { Money } from "./privacy";
import { ItemRow } from "./timeline";
import { Card, Disclosure, EmptyState, StatusPill } from "./ui";
import { ago, SnapshotTiles } from "./snapshot";
import { Info } from "./info";
import { lifeSummary } from "@/lib/view/life";
import { everydayHabits, predict, spendModel } from "@/lib/view/patterns";
import { CashPath } from "./cash-path";
import { Glyph } from "./icon";
import { AddPlanButton, PlanProvider } from "./calendar-forms";

export function Dashboard({ snapshot, today, nowIso, demo = false }: { snapshot: Snapshot; today: ISODate; nowIso: string; demo?: boolean }) {
  const now = useMemo(() => new Date(nowIso), [nowIso]);
  const m = useMemo(() => buildDashboard(snapshot, today, 30, now), [snapshot, today, now]);
  const { plan } = m;
  const allowance = plan.allowance;
  const accounts = snapshot.accounts;
  const base = demo ? "/demo" : "/app";

  if (accounts.length === 0) {
    return (
      <EmptyState title="Let's set up your runway" action={<Link className="btn btn-primary" href={base + "/onboarding"}>Start setup</Link>}>
        Add your checking balance, payday and main bills to see your forecast and what you can safely spend.
      </EmptyState>
    );
  }

  const daysToPayday = m.nextPayday ? diffDays(today, m.nextPayday) : null;
  const incomplete = !m.forecast90.complete;
  // Plans that cost something (meetings and "not spending" events are left to the Calendar tab).
  const costly = m.events.filter((v) => v.plannedCents > 0 || v.estimate.needsInput);

  return (
    <PlanProvider value={{ snapshot, today, nextPayday: m.nextPayday, events: m.planned, calendarIncomplete: m.coverage.incomplete }}>
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-2 lg:items-start">
      <div className="flex flex-col gap-6">
        {m.question && <QuestionCard question={m.question} accounts={accounts} today={today} />}

        {/* The hero: one number, on its own */}
        <section aria-labelledby="safe-title" className="card overflow-hidden">
          <div className="bg-gradient-to-br from-surface-3 to-surface px-5 pb-5 pt-5 sm:px-6">
            <div className="flex items-center justify-between gap-2">
              <h2 id="safe-title" className="text-sm font-bold text-muted">
                Today&apos;s limit
                <Info label="Today's limit">
                  How much you can spend today on everyday things (food, coffee, rides, shopping) and still have every bill, card payment, savings transfer and plan covered until payday.
                  <span className="mt-1.5 block">We take what&apos;s left of this paycheck after all of those, and spread it over the days until you&apos;re paid again. Spend less today and tomorrow&apos;s number goes up; spend more and it goes down.</span>
                  {plan.notes.filter((n) => n !== allowance.explanation[0]).length > 0 && (
                    <span className="mt-1.5 block">{plan.notes.filter((n) => n !== allowance.explanation[0]).join(" ")}</span>
                  )}
                </Info>
              </h2>
              <StatusPill tone={allowance.status === "shortfall" ? "bad" : allowance.status === "tight" ? "warn" : "good"}>
                {allowance.status === "shortfall" ? "Shortfall" : allowance.status === "tight" ? "Tight" : "On track"}
              </StatusPill>
            </div>
            <p className="font-num mt-3 text-7xl leading-none tracking-tight text-display">
              <Money cents={plan.todayCap.capCents} />
            </p>
            <p className="mt-3 text-sm text-faint">
              {allowance.status === "shortfall" ? (
                <><Money cents={allowance.shortfallCents} whole /> short on {formatShort(allowance.shortfallDate!)}</>
              ) : (
                <>
                  <Money cents={plan.poolCents} whole className="text-muted" /> left to {formatShort(allowance.current.end)}
                  {daysToPayday != null && ` · payday in ${daysToPayday}d`}
                </>
              )}
              {incomplete && <span className="text-warn"> · some data out of date</span>}
            </p>
            {allowance.status === "shortfall" && (
              <div className="mt-3">
                <p className="rounded-xl border border-danger/50 bg-danger/5 px-3 py-2 text-sm font-semibold text-ink">
                  Bills come first, so everyday spending is $0
                  <Info label="Why $0 today">{allowance.explanation[0]} {allowance.explanation[1]}</Info>
                  <Link href={base + "/what-if"} className="ml-2 font-semibold text-brand underline">Fix it →</Link>
                </p>
              </div>
            )}
            <div className="mt-5 flex flex-wrap items-center gap-2">
              <Link href={base + "/what-if#afford"} className="btn btn-primary">Can I afford it?</Link>
              {!demo && <QuickLog accounts={accounts} today={today} />}
            </div>
          </div>
        </section>

        <DailyCaps m={m} today={today} />

        {/* Plans */}
        <Card
          id="plans"
          title="Plans"
          action={
            <span className="flex items-center gap-1">
              <AddPlanButton snapshot={snapshot} today={today} nextPayday={m.nextPayday} events={m.planned} calendarIncomplete={m.coverage.incomplete} className="btn btn-ghost btn-sm" />
              <Link href={base + "/calendar"} className="btn btn-ghost btn-sm">
                Calendar →
              </Link>
            </span>
          }
        >
          {m.coverage.incomplete && (
            <div className="mb-3">
              <details className="rounded-xl border border-warn/50 bg-warn/5 px-3 py-2 text-sm">
                <summary className="cursor-pointer font-medium text-ink">{m.coverage.status === "none" ? "No calendars connected" : "A calendar can't be read"} ›</summary>
                <p className="mt-1 text-xs text-muted">{m.coverage.notes.join(" ")} A small buffer is held back for plans we can't see.</p>
              </details>
            </div>
          )}
          {costly.length === 0 ? (
            <EmptyState title="No plans in the next 30 days" />
          ) : (
            <ul className="space-y-2">
              {costly.map((v) => (
                <EventCard key={v.event.id} view={v} accounts={accounts} />
              ))}
            </ul>
          )}
        </Card>

        <TodayForecast m={m} snapshot={snapshot} today={today} base={base} />
      </div>

      <div className="flex flex-col gap-6">
      {/* Snapshot: the whole picture first */}
      <section aria-labelledby="snapshot-title" className="card p-4 sm:p-5 ">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 id="snapshot-title" className="text-base font-bold text-ink">Snapshot</h2>
          <Link href={base + "/accounts"} className="btn btn-ghost btn-sm">Accounts →</Link>
        </div>
        <SnapshotTiles m={m} today={today} nowMs={now.getTime()} />
        <div className="mt-3">
          <Disclosure summary="All accounts">
            <ul className="space-y-1 text-sm">
              {[...m.cash.accounts, ...m.savings].map((v) => (
                <AcctRow key={v.account.id} name={v.account.name} cents={v.valueCents} fresh={ago(v.account.balanceUpdatedAt, now.getTime())} stale={v.stale} />
              ))}
              {m.goals.map((g) => (
                <li key={g.goal.id} className="py-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-ink">{g.goal.protected && <Glyph name="lock" size="xs" bare />} {g.goal.name}</span>
                    <span className="tabular"><Money cents={g.balanceCents} whole /> <span className="text-faint">/ <Money cents={g.goal.targetCents} whole /></span></span>
                  </span>
                  <span className="mt-1 block h-1.5 rounded-full bg-surface-3"><span className={`block h-1.5 rounded-full ${g.onTrack === false ? "bg-warn" : "bg-brand"}`} style={{ width: `${g.pct}%` }} /></span>
                  {g.monthlyNeededCents != null && (
                    <span className={`text-[11px] ${g.onTrack ? "text-muted" : "text-warn"}`}>
                      <Money cents={g.monthlyPlannedCents} whole />/mo of <Money cents={g.monthlyNeededCents} whole /> needed
                    </span>
                  )}
                </li>
              ))}
              {m.cards.map(({ view, projection }) => {
                const next = projection?.statements.find((st) => st.dueDate >= today);
                return (
                  <AcctRow
                    key={view.account.id}
                    name={view.account.name}
                    cents={-view.owedCents}
                    fresh={ago(view.account.balanceUpdatedAt, now.getTime())}
                    stale={view.stale}
                    sub={next ? <>bill <Money cents={next.balanceCents} whole />{next.isProjected ? " est." : ""} · {formatShort(next.dueDate)}</> : undefined}
                  />
                );
              })}
              {m.loans.map((l) => (
                <AcctRow key={l.account.id} name={l.account.name} cents={-l.owedCents} fresh={ago(l.account.balanceUpdatedAt, now.getTime())} stale={l.stale} />
              ))}
            </ul>
          </Disclosure>
        </div>
      </section>

        <ComingUp m={m} today={today} />
        <SpendingVsBudget m={m} snapshot={snapshot} today={today} base={base} />
        <PatternPulse m={m} snapshot={snapshot} today={today} base={base} />
      </div>
    </div>
    </PlanProvider>
  );
}

/** The week's daily limits: the selected day is unmistakable, the amounts scan at a glance. */
function DailyCaps({ m, today }: { m: ReturnType<typeof buildDashboard>; today: ISODate }) {
  const days = m.plan.days;
  const [showAll, setShowAll] = useState(false);
  const [selected, setSelected] = useState<ISODate | null>(days[0]?.date ?? null);
  const visible = showAll ? days : days.slice(0, 7);
  const sel = days.find((d) => d.date === selected) ?? null;
  const fday = sel ? m.forecast90.days.find((d) => d.date === sel.date) : undefined;
  const planById = new Map(m.allEvents.map((v) => [v.event.id, v]));
  const cols = Math.min(7, Math.max(visible.length, 4));
  return (
    <section className="card p-4 sm:p-5" aria-labelledby="caps-title">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 id="caps-title" className="text-base font-bold text-ink">Daily limits<Info label="Daily limits">A reasonable most to spend each day until payday. It starts from what you have left after bills and savings, adds room on days with a plan (blue dot), and follows your habits: busier weekdays and payday get more, quiet days less, and a trip that&apos;s due (like groceries, when it&apos;s been a while) gets room on the day it&apos;s likely (small spark). Spend less one day and the rest rolls into the days ahead.</Info></h2>
        {days.length > 7 && (
          <button type="button" className="text-xs font-medium text-faint hover:text-ink" onClick={() => setShowAll((v) => !v)} aria-expanded={showAll}>
            {showAll ? "Next 7 days" : `All ${days.length} days`}
          </button>
        )}
      </div>
      <ol className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }} aria-label="Daily limits">
        {visible.map((d) => {
          const on = selected === d.date;
          return (
            <li key={d.date}>
              <button
                type="button"
                onClick={() => setSelected(on ? null : d.date)}
                aria-pressed={on}
                className={`relative w-full rounded-2xl px-1 py-2 text-center transition ${on ? "bg-brand text-brand-ink shadow-md" : "bg-surface-2/70 text-ink hover:bg-surface-3"}`}
              >
                <span className={`block text-[11px] font-medium ${on ? "opacity-80" : "text-faint"}`}>{d.date === today ? "Today" : formatWeekday(d.date)}</span>
                <Money cents={d.capCents} whole className="font-num block text-xl" />
                {d.eventIds.length > 0 && <span aria-label="has a plan" className={`absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full ${on ? "bg-brand-ink" : "bg-info"}`} />}
                {d.reasons?.some((r) => / likely/.test(r)) && <Sparkles aria-label="a usual trip is likely" size={10} className={`absolute left-1.5 top-1.5 ${on ? "text-brand-ink" : "text-warn"}`} />}
              </button>
            </li>
          );
        })}
      </ol>
      {sel && <DayCard sel={sel} fday={fday} planById={planById} today={today} />}
    </section>
  );
}

/** One day: what's left, and a short list of what happened or is due. */
function DayCard({
  sel,
  fday,
  planById,
  today,
}: {
  sel: ReturnType<typeof buildDashboard>["plan"]["days"][number];
  fday: ReturnType<typeof buildDashboard>["forecast90"]["days"][number] | undefined;
  planById: Map<string, ReturnType<typeof buildDashboard>["allEvents"][number]>;
  today: ISODate;
}) {
  const items = [
    ...sel.eventIds.map((id) => {
      const v = planById.get(id);
      return { id, glyph: "plan", label: v?.event.title ?? "Plan", cents: -(v?.advice?.capCents ?? 0) };
    }),
    ...(fday?.items ?? []).map((it) => ({ id: it.id, glyph: it.cashEffectCents > 0 ? "income" : (it.category ?? "spend"), label: it.label, cents: it.cashEffectCents })),
  ];
  return (
    <div className="mt-3 rounded-2xl bg-surface-2/50 p-3.5" aria-live="polite">
      <p className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-bold text-ink">{sel.date === today ? "Today" : `${formatWeekday(sel.date)} ${formatShort(sel.date)}`}</span>
        <span className="text-sm">
          <Money cents={sel.capCents} className="font-num text-2xl text-display" /> <span className="text-faint">{sel.date === today || sel.spentCents > 0 ? "left" : "to spend"}</span>
        </span>
      </p>
      {sel.reasons && sel.reasons.length > 0 && (
        <ul className="mt-1.5 space-y-0.5">
          {sel.reasons.map((r) => <li key={r} className="flex items-center gap-1.5 text-xs text-muted"><Sparkles size={12} className="shrink-0 text-brand" aria-hidden />{r}</li>)}
        </ul>
      )}
      {items.length > 0 && (
        <ul className="mt-2 space-y-1">
          {items.map((it) => (
            <li key={it.id} className="flex items-center justify-between gap-2 text-sm">
              <span className="flex min-w-0 items-center gap-2 text-muted"><Glyph name={it.glyph} size="xs" /><span className="truncate">{it.label}</span></span>
              <Money cents={it.cents} sign tone="auto" className="tabular" />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Where cash goes next: one quiet chart, the lowest point labelled, the floor status as the takeaway. */
function TodayForecast({ m, snapshot, today, base }: { m: ReturnType<typeof buildDashboard>; snapshot: Snapshot; today: ISODate; base: string }) {
  const days = m.forecast90.days.slice(0, 31);
  const real = useMemo(() => {
    const model = spendModel(snapshot, today);
    const p = model ? predict(model, today, days[days.length - 1]!.date) : null;
    let usual = 0;
    return days.map((d) => d.closingCents - (usual += p?.byDay[d.date] ?? 0));
  }, [snapshot, today, days]);
  const low = Math.min(...real);
  const floor = m.forecast90.floorCents;
  return (
    <section className="card p-4 sm:p-5" aria-labelledby="tf-title">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="tf-title" className="text-base font-bold text-ink">Next 30 days<Info label="Next 30 days">Your checking balance over the next month, after paychecks, bills, plans and your usual everyday spending. The dashed line is your cushion: the least you ever want in your account. Staying above it means you&apos;re safe.</Info></h2>
        <Link href={base + "/forecast"} className="text-xs font-medium text-faint hover:text-ink">Forecast →</Link>
      </div>
      <p className={`mt-1 text-sm font-semibold ${low < floor ? "text-warn" : "text-brand"}`}>
        {low < floor ? <>Dips <Money cents={floor - low} whole /> under your floor</> : <>Stays <Money cents={low - floor} whole /> above your floor</>}
      </p>
      <div className="mt-3">
        <CashPath dates={days.map((d) => d.date)} floorCents={floor} height={110} markLowest legend={false} lines={[{ id: "real", label: "Cash", cents: real, color: low < floor ? "text-warn" : "text-brand" }]} />
      </div>
    </section>
  );
}

/** One account on one line: name, amount, and how fresh it is. */
function AcctRow({ name, cents, fresh, stale, sub }: { name: string; cents: number; fresh: string; stale: boolean; sub?: React.ReactNode }) {
  return (
    <li className="flex items-baseline justify-between gap-2 py-1">
      <span className="min-w-0">
        <span className="block truncate text-ink">{name}</span>
        {sub && <span className="block text-[11px] text-muted">{sub}</span>}
      </span>
      <span className="shrink-0 text-right">
        <Money cents={cents} whole sign={cents < 0} className="font-semibold tabular" />
        <span className={`block text-[10px] ${stale ? "text-warn" : "text-faint"}`}>{stale ? <Glyph name="⚠" size="xs" bare /> : null}{fresh.replace(" ago", "")}</span>
      </span>
    </li>
  );
}

/** This month's spending by category: one bar each, the percent of budget, and over in red. */
function SpendingVsBudget({ m, snapshot, today, base }: { m: ReturnType<typeof buildDashboard>; snapshot: Snapshot; today: ISODate; base: string }) {
  const budget = useMemo(
    () => buildBudget(snapshot, today, m.allEvents.map((v) => ({ title: v.event.title, date: v.event.date, cents: v.advice?.capCents ?? 0, category: v.event.category }))),
    [snapshot, today, m.allEvents],
  );
  const habits = useMemo(() => everydayHabits(snapshot, today, 7), [snapshot, today]);
  const rows = budget.categories.filter((c) => c.spentCents > 0 || c.budgetCents > 0).sort((a, b) => b.spentCents - a.spentCents).slice(0, 6);
  const spent = budget.categories.reduce((t, c) => t + c.spentCents, 0);
  const total = budget.groups.needs.budgetCents + budget.groups.wants.budgetCents;
  return (
    <Card title="Spending" action={<Link href={base + "/spend"} className="text-xs font-medium text-faint hover:text-ink">Budget →</Link>}>
      <p className="-mt-1 mb-3 text-sm text-faint">
        <Money cents={spent} whole className="font-semibold text-ink" /> of <Money cents={total} whole /> this month
      </p>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">No spending yet.</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => {
            const pct = r.budgetCents > 0 ? Math.round((r.spentCents / r.budgetCents) * 100) : null;
            const over = pct != null && pct > 100;
            return (
              <li key={r.category}>
                <span className="flex items-center justify-between gap-2 text-sm">
                  <span className="flex min-w-0 items-center gap-2 font-medium text-ink"><Glyph name={r.category} size="xs" /><span className="truncate">{r.category}</span></span>
                  <span className={`shrink-0 text-xs font-bold tabular ${over ? "text-danger" : "text-muted"}`}>
                    {over ? <>over <Money cents={r.spentCents - r.budgetCents} whole /></> : pct != null ? `${pct}%` : <Money cents={r.spentCents} whole />}
                  </span>
                </span>
                <span className="mt-1.5 block h-2 rounded-full bg-surface-3" aria-hidden>
                  <span className={`block h-2 rounded-full ${over ? "bg-danger" : pct != null && pct >= 85 && pct < 100 ? "bg-warn" : "bg-brand"}`} style={{ width: `${Math.min(100, pct ?? 100)}%` }} />
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {habits.length > 0 && (
        <div className="mt-4 rounded-2xl bg-surface-2/50 p-3">
          <p className="flex items-center justify-between text-xs font-bold text-muted">
            <span>
              Expected this week
              <Info label="Expected this week">Everyday spending that never shows up on a calendar: lunch, rides, coffee. We estimate the next 7 days from how often you usually buy each thing and what it usually costs. It&apos;s already counted in your safe-to-spend number.</Info>
            </span>
            <span className="tabular text-ink">~<Money cents={habits.reduce((a, h) => a + h.expectedCents, 0)} whole /></span>
          </p>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {habits.slice(0, 5).map((h) => (
              <li key={h.category} className="flex items-center gap-1.5 rounded-full bg-surface px-2 py-1 text-xs text-muted">
                <Glyph name={h.category} size="xs" bare /> {h.category} <span className="font-semibold text-ink">~<Money cents={h.expectedCents} whole /></span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

/** Patterns in one glance: usual life until payday, and the two most useful things we noticed. */
function PatternPulse({ m, snapshot, today, base }: { m: ReturnType<typeof buildDashboard>; snapshot: Snapshot; today: ISODate; base: string }) {
  const life = useMemo(() => lifeSummary(snapshot, today, m), [snapshot, today, m]);
  if (!life.pace && !life.insights.length) return null;
  const short = life.pace && life.pace.gapCents < 0;
  return (
    <Link href={base + "/spend/trends"} className="card block p-3 transition hover:border-brand/60">
      {life.pace && (
        <p className="flex items-center justify-between gap-2 text-sm">
          <span className="font-bold text-ink">Usual spend to {formatShort(life.periodEnd)}</span>
          <span className="font-semibold tabular">
            ~<Money cents={life.pace.usualCents} whole className="text-ink" />{" "}
            <span className={short ? "text-warn" : "text-brand"}>
              {short ? <>· <Money cents={-life.pace.gapCents} whole /> short</> : <>· <Money cents={life.pace.gapCents} whole /> left</>}
            </span>
          </span>
        </p>
      )}
      {life.insights.length > 0 && (
        <ul className="mt-2 flex gap-1.5 overflow-hidden">
          {life.insights.slice(0, 2).map((i) => (
            <li key={i.id} className="min-w-0 flex-1 truncate rounded-full bg-surface-2 px-2.5 py-1 text-xs text-muted">
              <Glyph name={i.icon} size="xs" bare /> <span className={`font-bold ${i.tone === "warn" ? "text-warn" : "text-ink"}`}>{i.stat}</span> {i.title}
            </li>
          ))}
        </ul>
      )}
    </Link>
  );
}

const KIND_GLYPH: Record<string, string> = { income: "income", bill: "bill", subscription: "Subscriptions", loan_payment: "Debt", card_payment: "card", savings_transfer: "save", expense: "spend" };

/** The next 7 days, scheduled: bills, paydays and transfers. */
function ComingUp({ m, today }: { m: ReturnType<typeof buildDashboard>; today: ISODate }) {
  const end = addDays(today, 6);
  // Spending that already happened today isn't "coming up".
  const ahead = m.upcoming.filter((it) => !(it.source === "one_time" && it.date <= today));
  const scheduled = ahead.filter((it) => it.date <= end);
  const later = ahead.filter((it) => it.date > end).slice(0, 3);
  const amount = (it: (typeof m.upcoming)[number]) => (it.cashEffectCents === 0 ? -it.postings.reduce((t, p) => t + Math.max(0, -p.deltaCents), 0) : it.cashEffectCents);
  const row = (it: (typeof m.upcoming)[number]) => (
    <li key={it.id} className="flex items-center gap-3 py-2">
      <Glyph name={KIND_GLYPH[it.kind] ?? it.category ?? "bill"} size="sm" />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold leading-snug text-ink">{it.label}</span>
        <span className="block text-[11px] text-faint">{it.date === today ? "Today" : it.date === addDays(today, 1) ? "Tomorrow" : `${formatWeekday(it.date)} ${formatShort(it.date)}`}</span>
      </span>
      <Money cents={amount(it)} whole sign tone="auto" className="text-sm font-bold tabular" />
    </li>
  );
  return (
    <Card title="Coming up" action={<span className="text-xs text-faint">7 days</span>}>
      {scheduled.length > 0 ? <ul className="-my-2 divide-y divide-line/60">{scheduled.map(row)}</ul> : <p className="text-sm text-muted">Nothing scheduled this week.</p>}
      {later.length > 0 && (
        <details className="mt-2 text-sm">
          <summary className="cursor-pointer text-xs font-medium text-faint">Later</summary>
          <ul className="divide-y divide-line/60">{later.map(row)}</ul>
        </details>
      )}
    </Card>
  );
}
