"use client";

import { useMemo, useState } from "react";
import { buildForecast, HORIZONS } from "@/lib/engine";
import { formatShort, type ISODate } from "@/lib/dates";
import { toEngineInput, type Snapshot } from "@/lib/data/snapshot";
import { ForecastChart } from "./forecast-chart";
import { Money } from "./privacy";
import { Timeline } from "./timeline";
import { Badge, Card, Disclosure, EmptyState, PageHeader } from "./ui";

export function ForecastView({ snapshot, today }: { snapshot: Snapshot; today: ISODate }) {
  const [horizon, setHorizon] = useState<number>(snapshot.settings.defaultHorizonDays);
  const [selected, setSelected] = useState<string | null>(null);
  const f = useMemo(() => buildForecast(toEngineInput(snapshot, today), horizon), [snapshot, today, horizon]);
  if (snapshot.accounts.length === 0) return <EmptyState title="No accounts yet">Add an account to see a forecast.</EmptyState>;

  return (
    <>
      <PageHeader
        title="Cash forecast"
        subtitle={`${formatShort(f.startDate)} – ${formatShort(f.endDate)} · spendable cash only (savings, cards and loans are tracked separately)`}
        action={
          <div role="group" aria-label="Forecast horizon" className="flex rounded-lg border border-line p-0.5">
            {HORIZONS.map((h) => (
              <button key={h} type="button" onClick={() => setHorizon(h)} aria-pressed={horizon === h}
                className={`min-h-10 rounded-md px-3 text-sm font-medium ${horizon === h ? "bg-brand text-brand-ink" : "text-muted hover:text-ink"}`}>
                {h} days
              </button>
            ))}
          </div>
        }
      />
      <div className="grid gap-4">
        <Card>
          <dl className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-5 text-sm">
            <div><dt className="text-faint text-xs">Opening cash</dt><dd className="font-semibold"><Money cents={f.startingCashCents} /></dd></div>
            <div><dt className="text-faint text-xs">Money in</dt><dd className="font-semibold"><Money cents={f.totalInflowsCents} tone="in" /></dd></div>
            <div><dt className="text-faint text-xs">Money out</dt><dd className="font-semibold"><Money cents={-f.totalOutflowsCents} tone="out" /></dd></div>
            <div><dt className="text-faint text-xs">Lowest</dt><dd className="font-semibold"><Money cents={f.lowest.cents} /> <span className="text-xs text-muted">{formatShort(f.lowest.date)}</span></dd></div>
            <div><dt className="text-faint text-xs">Closing cash</dt><dd className="font-semibold"><Money cents={f.endingCashCents} /></dd></div>
          </dl>
          <div className="mb-3 flex flex-wrap gap-2">
            {f.complete ? <Badge tone="good">Inputs complete</Badge> : <Badge tone="warn">Incomplete: {f.issues.filter((i) => i.makesIncomplete).length} input(s) missing or stale</Badge>}
            {f.firstNegative ? <Badge tone="bad">Goes below $0 on {formatShort(f.firstNegative)}</Badge> : f.firstBelowFloor ? <Badge tone="warn">Below your floor on {formatShort(f.firstBelowFloor)}</Badge> : <Badge tone="good">Stays above your floor</Badge>}
          </div>
          <ForecastChart days={f.days} floorCents={f.floorCents} lowest={f.lowest} height={280} onSelect={(d) => { setSelected(d); document.getElementById(`day-${d}`)?.scrollIntoView({ behavior: "smooth", block: "center" }); }} />
          <p className="mt-2 text-xs text-faint">Tap the chart to jump to that day.</p>
        </Card>
        <Disclosure summary="Assumptions, data freshness and open questions">
          <ul className="space-y-1 text-sm">
            {f.issues.map((i, k) => (
              <li key={k} className="flex gap-2"><Badge tone={i.severity === "critical" ? "bad" : i.severity === "warning" ? "warn" : "info"}>{i.severity}</Badge><span className="text-muted">{i.message}{i.question ? ` — ${i.question}` : ""}</span></li>
            ))}
          </ul>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-muted">{f.assumptions.map((a) => <li key={a}>{a}</li>)}</ul>
        </Disclosure>
        {f.cards.length > 0 && (
          <Card title="Credit card statements in this window">
            <ul className="space-y-3 text-sm">
              {f.cards.map((c) => (
                <li key={c.accountId}>
                  <p className="font-medium text-ink">{c.name} · <Money cents={c.currentOwedCents} /> owed today · <Money cents={c.projectedChargesCents} /> of planned charges (not cash)</p>
                  <ul className="mt-1 space-y-0.5 text-xs text-muted">
                    {c.statements.map((s) => (
                      <li key={s.closingDate}>
                        {s.isProjected ? "Projected" : "Statement"} closing {formatShort(s.closingDate)}: <Money cents={s.balanceCents} />, due {formatShort(s.dueDate)} —{" "}
                        {s.autoPaymentCents > 0 ? <>auto-scheduled payment <Money cents={s.autoPaymentCents} /></> : s.paidOrScheduledCents > 0 ? <>covered by your scheduled/recorded payments</> : <>nothing due in this window</>}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </Card>
        )}
        <Card title="Daily timeline">
          <Timeline days={f.days} selected={selected} />
        </Card>
      </div>
    </>
  );
}
