"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { diffDays, formatShort, formatWeekday, type ISODate } from "@/lib/dates";
import type { Snapshot } from "@/lib/data/snapshot";
import { buildDashboard, type AccountView } from "@/lib/view/dashboard";
import { avgDailyCardSpend } from "@/lib/engine";
import { toEngineInput } from "@/lib/data/snapshot";
import { EventCard, QuestionCard, QuickLog } from "./advisor";
import { ForecastChart } from "./forecast-chart";
import { Money } from "./privacy";
import { ItemRow } from "./timeline";
import { Badge, Card, Disclosure, EmptyState, Notice } from "./ui";
import { ago, SnapshotTiles } from "./snapshot";

const SOURCE: Record<string, string> = { manual: "Entered by you", statement: "From a statement", import: "Imported", onboarding: "From setup" };

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
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
      {/* Snapshot: the whole picture first */}
      <section aria-labelledby="snapshot-title" className="card p-4 sm:p-5 lg:col-span-2">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 id="snapshot-title" className="text-sm font-semibold uppercase tracking-wide text-muted">Snapshot</h2>
          <Link href={base + "/accounts"} className="btn btn-ghost btn-sm">Accounts →</Link>
        </div>
        <SnapshotTiles m={m} today={today} nowMs={now.getTime()} />
        <div className="mt-3">
          <Disclosure summary="Every account, balance and when it was updated">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-faint">Spendable cash</h3>
              <AccountList views={m.cash.accounts} nowMs={now.getTime()} />
              <p className="mt-1 flex justify-between border-t border-line pt-2 text-sm">
                <span className="text-muted">Total cash</span>
                <Money cents={m.cash.totalCents} className="font-semibold" />
              </p>
              {m.goals.length > 0 && (
                <>
                  <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-faint">Goals (kept separate from spendable cash)</h3>
                  <ul className="mt-2 space-y-3">
                    {m.goals.map((g) => (
                      <li key={g.goal.id}>
                        <div className="flex justify-between text-sm">
                          <span className="text-ink">
                            {g.goal.name} {g.goal.protected && <Badge title="Never suggested as a funding source unless you allow it">Protected</Badge>}
                          </span>
                          <span>
                            <Money cents={g.balanceCents} /> <span className="text-faint">/ <Money cents={g.goal.targetCents} /></span>
                          </span>
                        </div>
                        <div className="mt-1 h-2 rounded-full bg-surface-3" role="progressbar" aria-valuenow={g.pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${g.goal.name} progress`}>
                          <div className="h-2 rounded-full bg-brand" style={{ width: `${g.pct}%` }} />
                        </div>
                        <p className="mt-1 text-xs text-muted">
                          {g.pct}% · saving <Money cents={g.monthlyPlannedCents} />/mo
                          {g.monthlyNeededCents != null && (
                            <>
                              {" "}· needs <Money cents={g.monthlyNeededCents} />/mo by {formatShort(g.goal.targetDate!)}{" "}
                              {g.onTrack ? <Badge tone="good">On track</Badge> : <Badge tone="warn">Behind</Badge>}
                            </>
                          )}
                        </p>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {m.savings.length > 0 && (
                <>
                  <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-faint">Savings</h3>
                  <AccountList views={m.savings} nowMs={now.getTime()} />
                </>
              )}
              {m.cards.length > 0 && (
                <>
                  <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-faint">Credit cards</h3>
                  <ul className="mt-2 space-y-3">
                    {m.cards.map(({ view, projection }) => {
                      const next = projection?.statements.find((s) => s.dueDate >= today);
                      return (
                        <li key={view.account.id} className="text-sm">
                          <div className="flex justify-between">
                            <span className="text-ink">{view.account.name}</span>
                            <span>
                              <Money cents={view.owedCents} /> <span className="text-faint">owed</span>
                            </span>
                          </div>
                          {next ? (
                            <p className="text-xs text-muted">
                              {next.isProjected ? "Next statement (projected)" : "Statement"} <Money cents={next.balanceCents} />
                              {next.isProjected && (() => {
                                // Typical everyday card spending still to come this cycle (display only; already in your daily caps).
                                const typical = avgDailyCardSpend(toEngineInput(snapshot, today), view.account.id) * Math.max(0, diffDays(today, next.closingDate));
                                return typical > 0 ? <> + ~<Money cents={typical} /> typical spending</> : null;
                              })()}{" "}
                              · closes {formatShort(next.closingDate)} · due {formatShort(next.dueDate)}{" "}
                              {next.status === "projected" ? (
                                <Badge>Projected</Badge>
                              ) : next.paidOrScheduledCents >= next.balanceCents ? (
                                <Badge tone="good">Payment scheduled</Badge>
                              ) : next.autoPaymentCents > 0 ? (
                                <Badge tone="info">Pay in full on due date</Badge>
                              ) : (
                                <Badge tone="warn">Unpaid</Badge>
                              )}
                            </p>
                          ) : (
                            <p className="text-xs text-muted">No statement due in the next 90 days.</p>
                          )}
                          <p className="text-xs text-faint">
                            {SOURCE[view.account.balanceSource]} · updated {ago(view.account.balanceUpdatedAt, now.getTime())}
                            {view.stale && " · out of date"}
                          </p>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
              {m.loans.length > 0 && (
                <>
                  <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-faint">Loans</h3>
                  <ul className="mt-2 space-y-1 text-sm">
                    {m.loans.map((l) => (
                      <li key={l.account.id} className="flex justify-between">
                        <span className="text-ink">
                          {l.account.name}
                          {l.account.aprBps != null && <span className="text-faint"> · {(l.account.aprBps / 100).toFixed(2)}% APR</span>}
                        </span>
                        <Money cents={l.owedCents} />
                      </li>
                    ))}
                  </ul>
                </>
              )}
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
              {plan.todayCap.spentCents > 0 && (
                <>
                  <Money cents={plan.todayCap.spentCents} /> already logged today. {" "}
                </>
              )}
              {allowance.status === "shortfall" ? (
                <>Cash is projected to fall <Money cents={allowance.shortfallCents} /> below your floor on {formatShort(allowance.shortfallDate!)}.</>
              ) : (
                <>
                  <Money cents={plan.poolCents} /> for flexible spending until {formatShort(allowance.current.end)}
                  {daysToPayday != null && ` · payday in ${daysToPayday} day${daysToPayday === 1 ? "" : "s"}`}.
                </>
              )}
            </p>
          </div>
          <div className="p-4 sm:p-5">
            {allowance.status === "shortfall" && (
              <div className="mb-3">
                <Notice tone="bad" title="Bills come before flexible spending">
                  {allowance.explanation[1]}{" "}
                  <Link href={base + "/what-if"} className="font-semibold text-brand underline">
                    See how savings could cover it
                  </Link>
                </Notice>
              </div>
            )}
            <DailyCaps m={m} today={today} />
            {plan.notes.length > 0 && (
              <ul className="mt-3 space-y-1 text-xs text-muted">
                {plan.notes.map((n) => (
                  <li key={n}>• {n}</li>
                ))}
              </ul>
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
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {incomplete ? <Badge tone="warn">Incomplete — see below</Badge> : <Badge tone="good">Inputs complete and fresh</Badge>}
            <Link href={base + "/forecast"} className="btn btn-ghost btn-sm">
              Daily timeline →
            </Link>
          </div>
          <div className="mt-3">
            <Disclosure summary="Assumptions & data freshness">
              {m.issues.length > 0 && (
                <ul className="mb-3 space-y-1 text-sm">
                  {m.issues.map((i, k) => (
                    <li key={k} className="flex gap-2">
                      <Badge tone={i.severity === "critical" ? "bad" : i.severity === "warning" ? "warn" : "info"}>{i.severity}</Badge>
                      <span className="text-muted">{i.message}</span>
                    </li>
                  ))}
                </ul>
              )}
              <ul className="list-disc space-y-1 pl-5 text-xs text-muted">
                {m.forecast90.assumptions.map((a) => (
                  <li key={a}>{a}</li>
                ))}
                {m.coverage.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </Disclosure>
          </div>
        </Card>

        {/* Plans */}
        <Card
          id="plans"
          title="Plans on your calendar"
          action={
            <Link href={base + "/calendar"} className="btn btn-ghost btn-sm">
              Calendars →
            </Link>
          }
        >
          {m.coverage.incomplete && (
            <div className="mb-3">
              <Notice tone="warn" title={m.coverage.status === "none" ? "No calendars connected" : "Some calendars can't be read right now"}>
                {m.coverage.notes.join(" ")} Missing plans are never treated as "no plans".
              </Notice>
            </div>
          )}
          {costly.length === 0 ? (
            <EmptyState title="No plans found in the next 30 days">
              {m.coverage.status === "complete"
                ? "Nothing on your connected calendars costs money soon. Plans that aren't on a calendar aren't included."
                : "Connect a calendar or add a plan so it can be budgeted for."}
            </EmptyState>
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
        <Card title="Coming up (14 days)">
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
        <Card title="Spending by category">
          <SpendingBars title={`This pay period (since ${formatShort(m.spending.periodStart)})`} totals={m.spending.period} total={m.spending.periodTotal} />
          <div className="mt-4">
            <SpendingBars title={`This month`} totals={m.spending.month} total={m.spending.monthTotal} />
          </div>
          <p className="mt-3 text-xs text-faint">Card purchases count once, when you buy. Card payments and transfers aren't spending.</p>
        </Card>
      </div>
    </div>
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

function AccountList({ views, nowMs }: { views: AccountView[]; nowMs: number }) {
  return (
    <ul className="mt-2 space-y-2">
      {views.map((v) => (
        <li key={v.account.id} className="text-sm">
          <div className="flex justify-between gap-2">
            <span className="text-ink">{v.account.name}</span>
            {v.account.balanceCents == null ? <Badge tone="bad">No balance</Badge> : <Money cents={v.valueCents} />}
          </div>
          <p className="text-xs text-faint">
            {SOURCE[v.account.balanceSource]} · {v.account.balanceAsOf ? `as of ${formatShort(v.account.balanceAsOf)}` : "no date"} · updated {ago(v.account.balanceUpdatedAt, nowMs)}
            {v.stale && <span className="text-warn"> · out of date</span>}
          </p>
        </li>
      ))}
    </ul>
  );
}

function SpendingBars({ title, totals, total }: { title: string; totals: { category: string; cents: number; onCardCents: number }[]; total: number }) {
  const max = Math.max(1, ...totals.map((t) => t.cents));
  return (
    <div>
      <div className="mb-2 flex justify-between text-sm">
        <h3 className="font-medium text-ink">{title}</h3>
        <Money cents={total} className="font-semibold" />
      </div>
      {totals.length === 0 ? (
        <p className="text-sm text-muted">No spending recorded yet.</p>
      ) : (
        <ul className="space-y-1.5">
          {totals.slice(0, 8).map((t) => (
            <li key={t.category} className="grid grid-cols-[6.5rem_1fr_auto] items-center gap-2 text-xs">
              <span className="truncate text-muted">{t.category}</span>
              <span className="h-2 rounded-full bg-surface-3" aria-hidden>
                <span className="block h-2 rounded-full bg-brand" style={{ width: `${(t.cents / max) * 100}%` }} />
              </span>
              <Money cents={t.cents} className="text-ink" />
            </li>
          ))}
        </ul>
      )}
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
            <li className="flex justify-between gap-2"><span>Everyday spending</span><Money cents={sel.baseCents} /></li>
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
              <li className="flex justify-between gap-2"><span>Already spent (taken out above)</span><Money cents={-sel.spentCents} sign /></li>
            )}
          </ul>
          {fday && fday.items.length > 0 && (
            <>
              <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-faint">Also that day</p>
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
              Cash at the end of the day, before everyday spending: <Money cents={fday.closingCents} className="font-semibold text-ink" />
              {fday.belowFloor && <span className="text-warn"> · below your floor</span>}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
