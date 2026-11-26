"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { addDays, diffDays, formatShort, formatWeekday, type ISODate } from "@/lib/dates";
import type { Snapshot } from "@/lib/data/snapshot";
import { buildDashboard } from "@/lib/view/dashboard";
import { buildBudget } from "@/lib/view/budget";
import { iconFor } from "@/lib/categories";
import { EventCard, QuestionCard, QuickLog } from "./advisor";
import { ForecastChart } from "./forecast-chart";
import { Money } from "./privacy";
import { ItemRow } from "./timeline";
import { Badge, Card, Disclosure, EmptyState } from "./ui";
import { ago, SnapshotTiles } from "./snapshot";
import { AddPlanButton, PlanProvider } from "./calendar-forms";

export function Dashboard({ snapshot, today, nowIso, demo = false }: { snapshot: Snapshot; today: ISODate; nowIso: string; demo?: boolean }) {
  const [horizon, setHorizon] = useState<number>(snapshot.settings.defaultHorizonDays);
  const now = useMemo(() => new Date(nowIso), [nowIso]);
  const m = useMemo(() => buildDashboard(snapshot, today, horizon, now), [snapshot, today, horizon, now]);
  const { plan, forecast } = m;
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

  // Cumulative allowance per forecast day, for the "if you spend your allowance" line.
  let acc = 0;
  const allowanceByDay = forecast.days.map((d) => {
    const p = allowance.periods.find((x) => d.date >= x.start && d.date <= x.end);
    acc += p?.dailyRateCents ?? 0;
    return acc;
  });
  const daysToPayday = m.nextPayday ? diffDays(today, m.nextPayday) : null;
  const incomplete = !m.forecast90.complete;
  // Plans that cost something (meetings and "not spending" events are left to the Calendar tab).
  const costly = m.events.filter((v) => v.plannedCents > 0 || v.estimate.needsInput);

  return (
    <PlanProvider value={{ snapshot, today, nextPayday: m.nextPayday, events: m.planned, calendarIncomplete: m.coverage.incomplete }}>
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
      {/* Snapshot: the whole picture first */}
      <section aria-labelledby="snapshot-title" className="card p-4 sm:p-5 lg:col-span-2">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 id="snapshot-title" className="text-sm font-semibold uppercase tracking-wide text-muted">Snapshot</h2>
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
                    <span className="truncate text-ink">{g.goal.protected ? "🔒 " : ""}{g.goal.name}</span>
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

      <div className="flex flex-col gap-4">
        {m.question && <QuestionCard question={m.question} accounts={accounts} today={today} />}

        {/* Safe to spend */}
        <section aria-labelledby="safe-title" className="card overflow-hidden">
          <div className="bg-gradient-to-br from-surface-3 to-surface p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="safe-title" className="text-sm font-semibold uppercase tracking-wide text-muted">
                Safe to spend today
              </h2>
              <div className="flex gap-1">
                {allowance.status === "shortfall" && <Badge tone="bad">Shortfall</Badge>}
                {allowance.status === "tight" && <Badge tone="warn">Tight</Badge>}
                {allowance.status === "ok" && <Badge tone="good">On track</Badge>}
                {incomplete && <Badge tone="warn" title="Some inputs are missing or out of date">Incomplete data</Badge>}
              </div>
            </div>
            <p className="mt-2 text-5xl font-bold tracking-tight text-ink">
              <Money cents={plan.todayCap.capCents} />
            </p>
            <p className="mt-1 text-sm text-muted">
              {allowance.status === "shortfall" ? (
                <><Money cents={allowance.shortfallCents} whole /> short on {formatShort(allowance.shortfallDate!)}</>
              ) : (
                <>
                  <Money cents={plan.poolCents} whole /> left until {formatShort(allowance.current.end)}
                  {daysToPayday != null && ` · payday in ${daysToPayday}d`}
                </>
              )}
              {plan.todayCap.spentCents > 0 && <> · <Money cents={plan.todayCap.spentCents} whole /> spent today</>}
            </p>
          </div>
          <div className="p-4 sm:p-5">
            {allowance.status === "shortfall" && (
              <div className="mb-3">
                <details className="rounded-xl border border-danger/50 bg-danger/5 p-3 text-sm">
                  <summary className="cursor-pointer font-semibold text-ink">Why $0 today ›</summary>
                  <p className="mt-1 text-muted">{allowance.explanation[0]}</p>
                  <p className="mt-1 text-muted">{allowance.explanation[1]}</p>
                  <Link href={base + "/what-if"} className="mt-1 inline-block font-semibold text-brand underline">Fix it with savings →</Link>
                </details>
              </div>
            )}
            <DailyCaps m={m} today={today} />
            {plan.notes.filter((n) => n !== allowance.explanation[0]).length > 0 && (
              <details className="mt-3 text-xs text-muted">
                <summary className="cursor-pointer">Notes</summary>
                <ul className="mt-1 space-y-1">
                  {plan.notes.filter((n) => n !== allowance.explanation[0]).map((n) => <li key={n}>• {n}</li>)}
                </ul>
              </details>
            )}
            <div className="mt-3">
              <Link href={base + "/what-if#afford"} className="btn btn-secondary btn-sm">
                Can I afford it? →
              </Link>
            </div>
            {!demo && (
              <div className="mt-3">
                <QuickLog accounts={accounts} today={today} />
              </div>
            )}
          </div>
        </section>

        {/* Forecast */}
        <Card
          id="forecast"
          title="Cash forecast"
          action={
            <div role="group" aria-label="Forecast horizon" className="flex rounded-lg border border-line p-0.5">
              {[30, 60, 90].map((h) => (
                <button
                  key={h}
                  type="button"
                  onClick={() => setHorizon(h)}
                  aria-pressed={horizon === h}
                  className={`min-h-9 rounded-md px-2.5 text-sm font-medium ${horizon === h ? "bg-brand text-brand-ink" : "text-muted hover:text-ink"}`}
                >
                  {h}d
                </button>
              ))}
            </div>
          }
        >
          <dl className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Cash today" value={<Money cents={forecast.startingCashCents} />} />
            <Stat
              label="Lowest"
              value={<Money cents={forecast.lowest.cents} className={forecast.lowest.cents < forecast.floorCents ? "text-warn" : ""} />}
              sub={formatShort(forecast.lowest.date)}
            />
            <Stat label={`In ${forecast.horizonDays} days`} value={<Money cents={forecast.endingCashCents} />} sub={formatShort(forecast.endDate)} />
            <Stat label="Your floor" value={<Money cents={forecast.floorCents} />} sub={forecast.firstBelowFloor ? `Breached ${formatShort(forecast.firstBelowFloor)}` : "Never breached"} />
          </dl>
          <ForecastChart days={forecast.days} floorCents={forecast.floorCents} lowest={forecast.lowest} allowanceByDay={allowanceByDay} />
          <div className="mt-2 flex justify-end">
            <Link href={base + "/forecast"} className="btn btn-ghost btn-sm">Daily timeline →</Link>
          </div>
        </Card>

        {/* Plans */}
        <Card
          id="plans"
          title="Plans"
          action={
            <span className="flex items-center gap-1">
              <AddPlanButton snapshot={snapshot} today={today} nextPayday={m.nextPayday} events={m.planned} calendarIncomplete={m.coverage.incomplete} className="btn btn-secondary btn-sm" />
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
      </div>

      <div className="flex flex-col gap-4">
        {/* Coming up */}
        <Card title="Coming up">
          {m.upcoming.length === 0 ? (
            <p className="text-sm text-muted">Nothing scheduled.</p>
          ) : (
            <ul className="divide-y divide-line">
              {m.upcoming.map((it) => (
                <ItemRow key={it.id} item={it} showDate />
              ))}
            </ul>
          )}
        </Card>

        {/* Spending */}
        <SpendingVsBudget m={m} snapshot={snapshot} today={today} base={base} />
      </div>
    </div>
    </PlanProvider>
  );
}

function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="rounded-xl bg-surface-2/60 p-2.5">
      <dt className="text-xs text-faint">{label}</dt>
      <dd className="text-lg font-semibold text-ink">{value}</dd>
      {sub && <dd className="text-xs text-muted">{sub}</dd>}
    </div>
  );
}




/** Daily caps until payday. Tap a day to see what makes up its cap and what else happens that day. */
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
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-ink">Daily caps until payday</h3>
        {days.length > 7 && (
          <button type="button" className="text-xs font-medium text-brand" onClick={() => setShowAll((v) => !v)} aria-expanded={showAll}>
            {showAll ? "Next 7 days" : `All ${days.length} days`}
          </button>
        )}
      </div>
      <ol className="grid gap-1 text-center" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }} aria-label="Daily spending caps">
        {visible.map((d) => {
          const active = selected === d.date;
          return (
            <li key={d.date}>
              <button
                type="button"
                onClick={() => setSelected(active ? null : d.date)}
                aria-pressed={active}
                className={`w-full rounded-lg border p-1.5 transition ${active ? "border-brand bg-brand/15 ring-1 ring-brand" : d.date === today ? "border-brand/60 bg-brand/5" : "border-line hover:border-brand/50"}`}
              >
                <span className="block text-[11px] text-faint">{d.date === today ? "Today" : formatWeekday(d.date)}</span>
                <Money cents={d.capCents} whole className="block text-sm font-semibold" />
                {d.eventIds.length > 0 ? <span className="block text-[10px] text-info">● plan</span> : <span className="block text-[10px] text-transparent">·</span>}
              </button>
            </li>
          );
        })}
      </ol>
      {sel && (
        <div className="mt-2 rounded-xl border border-line bg-surface-2/50 p-3 text-sm" aria-live="polite">
          <p className="flex justify-between gap-2 font-semibold text-ink">
            <span>{sel.date === today ? "Today" : formatWeekday(sel.date)}, {formatShort(sel.date)}</span>
            <span>{sel.spentCents > 0 ? "left " : "cap "}<Money cents={sel.capCents} /></span>
          </p>
          <ul className="mt-1.5 space-y-1 text-muted">
            <li className="flex justify-between gap-2"><span>Everyday</span><Money cents={sel.baseCents} /></li>
            {sel.eventIds.map((id) => {
              const v = planById.get(id);
              return (
                <li key={id} className="flex justify-between gap-2">
                  <span className="text-info">📅 {v?.event.title ?? "Plan"}</span>
                  <Money cents={v?.advice?.capCents ?? 0} />
                </li>
              );
            })}
            {sel.spentCents > 0 && (
              <li className="flex justify-between gap-2"><span>Spent</span><Money cents={-sel.spentCents} sign /></li>
            )}
          </ul>
          {fday && fday.items.length > 0 && (
            <>
              <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-faint">{sel.date === today ? "Today" : sel.date === addDays(today, 1) ? "Tomorrow" : formatShort(sel.date)}</p>
              <ul className="mt-1 space-y-1">
                {fday.items.map((it) => (
                  <li key={it.id} className="flex justify-between gap-2">
                    <span className="truncate text-ink">{it.cashEffectCents > 0 ? "💰" : "🧾"} {it.label}</span>
                    <Money cents={it.cashEffectCents} sign tone="auto" />
                  </li>
                ))}
              </ul>
            </>
          )}
          {fday && (
            <p className="mt-2 border-t border-line pt-1.5 text-xs text-muted">
              End of day <Money cents={fday.closingCents} whole className="font-semibold text-ink" />
              {fday.belowFloor && <span className="text-warn"> · below your floor</span>}
            </p>
          )}
        </div>
      )}
    </div>
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
        <span className={`block text-[10px] ${stale ? "text-warn" : "text-faint"}`}>{stale ? "⚠ " : ""}{fresh.replace(" ago", "")}</span>
      </span>
    </li>
  );
}

/** This month's spending by category against its budget, with a tick for an even pace; or the pay period so far. */
function SpendingVsBudget({ m, snapshot, today, base }: { m: ReturnType<typeof buildDashboard>; snapshot: Snapshot; today: ISODate; base: string }) {
  const [view, setView] = useState<"month" | "period">("month");
  const budget = useMemo(
    () => buildBudget(snapshot, today, m.allEvents.map((v) => ({ title: v.event.title, date: v.event.date, cents: v.advice?.capCents ?? 0 }))),
    [snapshot, today, m.allEvents],
  );
  const rows =
    view === "month"
      ? budget.categories.filter((c) => c.spentCents > 0 || c.budgetCents > 0).sort((a, b) => b.spentCents - a.spentCents).slice(0, 8)
      : m.spending.period.slice(0, 8).map((t) => ({ category: t.category, spentCents: t.cents, budgetCents: 0 }));
  const max = Math.max(1, ...rows.map((r) => Math.max(r.spentCents, r.budgetCents)));
  const total = view === "month" ? budget.groups.needs.budgetCents + budget.groups.wants.budgetCents : 0;
  const seg = (on: boolean) => `min-h-8 rounded-md px-2.5 text-xs font-medium ${on ? "bg-brand text-brand-ink" : "text-muted"}`;
  return (
    <Card
      title="Spending"
      action={
        <div className="flex rounded-lg border border-line p-0.5" role="group" aria-label="Period">
          <button type="button" className={seg(view === "month")} aria-pressed={view === "month"} onClick={() => setView("month")}>Month</button>
          <button type="button" className={seg(view === "period")} aria-pressed={view === "period"} onClick={() => setView("period")}>Pay period</button>
        </div>
      }
    >
      <p className="mb-2 text-sm">
        <Money cents={view === "month" ? budget.categories.reduce((t, c) => t + c.spentCents, 0) : m.spending.periodTotal} whole className="font-semibold text-ink" />
        {view === "month" ? <span className="text-muted"> of <Money cents={total} whole /> budget</span> : <span className="text-muted"> since {formatShort(m.spending.periodStart)}</span>}
      </p>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">No spending yet.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => {
            const over = r.budgetCents > 0 && r.spentCents > r.budgetCents;
            return (
              <li key={r.category} className="text-xs">
                <span className="flex justify-between gap-2">
                  <span className="truncate text-ink">{iconFor(r.category)} {r.category}</span>
                  <span className="tabular">
                    <Money cents={r.spentCents} whole className={over ? "font-semibold text-danger" : "text-ink"} />
                    {r.budgetCents > 0 && <span className="text-faint"> / <Money cents={r.budgetCents} whole /></span>}
                  </span>
                </span>
                <span className="relative mt-1 block h-1.5 rounded-full bg-surface-3" aria-hidden>
                  {r.budgetCents > 0 && <span className="absolute inset-y-0 left-0 rounded-full bg-surface-3 ring-1 ring-line" style={{ width: `${(r.budgetCents / max) * 100}%` }} />}
                  <span className={`absolute inset-y-0 left-0 rounded-full ${over ? "bg-danger" : "bg-brand"}`} style={{ width: `${(r.spentCents / max) * 100}%` }} />
                  {r.budgetCents > 0 && <span className="absolute -inset-y-0.5 w-0.5 rounded bg-ink/60" style={{ left: `${(r.budgetCents / max) * 100}%` }} />}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <Link href={base + "/spend/budget"} className="btn btn-ghost btn-sm mt-2">Budget →</Link>
    </Card>
  );
}
