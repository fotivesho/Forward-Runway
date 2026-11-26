"use client";

import { useMemo, useState } from "react";
import { buildForecast, HORIZONS } from "@/lib/engine";
import { formatShort, type ISODate } from "@/lib/dates";
import { toEngineInput, type Snapshot } from "@/lib/data/snapshot";
import { FlowChart, ForecastChart } from "./forecast-chart";
import { Money } from "./privacy";
import { Timeline } from "./timeline";
import { Badge, Card, Disclosure, EmptyState, PageHeader } from "./ui";

export function ForecastView({ snapshot, today }: { snapshot: Snapshot; today: ISODate }) {
  const [horizon, setHorizon] = useState<number>(snapshot.settings.defaultHorizonDays);
  const [selected, setSelected] = useState<string | null>(null);
  const [mode, setMode] = useState<"balance" | "flow">("balance");
  const f = useMemo(() => buildForecast(toEngineInput(snapshot, today), horizon), [snapshot, today, horizon]);
  const jump = (d: string) => {
    setSelected(d);
    document.getElementById(`day-${d}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  };
  if (snapshot.accounts.length === 0) return <EmptyState title="No accounts yet">Add an account to see a forecast.</EmptyState>;

  return (
    <>
      <PageHeader
        title="Cash forecast"
        subtitle={`${formatShort(f.startDate)} – ${formatShort(f.endDate)} · spendable cash`}
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
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-5 sm:gap-3">
          <Stat icon="💵" label="Cash today" value={<Money cents={f.startingCashCents} whole />} />
          <Stat icon="⬆" label="Money in" value={<Money cents={f.totalInflowsCents} whole tone="in" />} />
          <Stat icon="⬇" label="Money out" value={<Money cents={-f.totalOutflowsCents} whole tone="out" />} />
          <Stat icon="▼" label={`Lowest · ${formatShort(f.lowest.date)}`} value={<Money cents={f.lowest.cents} whole className={f.lowest.cents < f.floorCents ? "text-warn" : ""} />} />
          <Stat icon="🏁" label={`On ${formatShort(f.endDate)}`} value={<Money cents={f.endingCashCents} whole />} className="col-span-2 sm:col-span-1" />
        </ul>
        <Card>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div role="group" aria-label="Chart view" className="flex rounded-lg border border-line p-0.5">
              {([["balance", "Balance"], ["flow", "Money in & out"]] as const).map(([id, label]) => (
                <button key={id} type="button" onClick={() => setMode(id)} aria-pressed={mode === id}
                  className={`min-h-9 rounded-md px-3 text-sm font-medium ${mode === id ? "bg-brand text-brand-ink" : "text-muted hover:text-ink"}`}>
                  {label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {f.complete ? <Badge tone="good">Inputs complete</Badge> : <Badge tone="warn">Incomplete: {f.issues.filter((i) => i.makesIncomplete).length} input(s) missing or stale</Badge>}
              {f.firstNegative ? <Badge tone="bad">Goes below $0 on {formatShort(f.firstNegative)}</Badge> : f.firstBelowFloor ? <Badge tone="warn">Below your floor on {formatShort(f.firstBelowFloor)}</Badge> : <Badge tone="good">Stays above your floor</Badge>}
            </div>
          </div>
          {mode === "balance" ? (
            <ForecastChart days={f.days} floorCents={f.floorCents} lowest={f.lowest} height={280} onSelect={jump} />
          ) : (
            <FlowChart days={f.days} height={280} onSelect={jump} />
          )}
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
          <Timeline days={f.days} selected={selected} mode={mode} />
        </Card>
      </div>
    </>
  );
}

function Stat({ icon, label, value, className = "" }: { icon: string; label: string; value: React.ReactNode; className?: string }) {
  return (
    <li className={`card min-w-0 p-2.5 sm:p-3 ${className}`}>
      <p className="flex items-center gap-1.5 truncate text-[11px] text-faint sm:text-xs"><span aria-hidden>{icon}</span>{label}</p>
      <p className="mt-0.5 truncate text-lg font-bold tabular text-ink sm:text-xl">{value}</p>
    </li>
  );
}
