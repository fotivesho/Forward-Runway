"use client";

import { useMemo, useState } from "react";
import { diffDays, formatShort, type ISODate } from "@/lib/dates";
import type { ExploreData } from "@/lib/view/explore";
import { estimatePlan } from "@/lib/view/estimate";
import { Glyph } from "@/components/icon";
import { Info } from "@/components/info";
import { PeopleStepper } from "@/components/estimate-ui";

const KINDS: Array<{ id: string; label: string; cat: string; people: number; nights?: number; icon: string }> = [
  { id: "dinner", label: "Dinner", cat: "Dining", people: 2, icon: "Dining" },
  { id: "birthday", label: "Birthday", cat: "Celebrations", people: 1, icon: "Celebrations" },
  { id: "weekend", label: "Getaway", cat: "Travel", people: 2, nights: 2, icon: "Travel" },
  { id: "concert", label: "Concert", cat: "Entertainment", people: 2, icon: "Entertainment" },
];
const usd = (c: number) => `$${Math.round(Math.abs(c) / 100).toLocaleString("en-US")}`;

/**
 * The planner on the landing page, in one compact card: the answer on top (what it will likely
 * cost and what it leaves of that paycheck), the few taps underneath.
 */
export function PlannerTry({ periods, history, bias = {} }: { periods: Array<{ start: ISODate; end: ISODate; freeCents: number }>; history: ExploreData; bias?: Record<string, number> }) {
  const [pi, setPi] = useState(Math.min(1, periods.length - 1));
  const [kind, setKind] = useState(KINDS[0]!);
  const [people, setPeople] = useState(KINDS[0]!.people);
  const [opt, setOpt] = useState(0);
  const period = periods[pi]!;
  const est = useMemo(() => estimatePlan({ category: kind.cat, people, nights: kind.nights ?? null }, history, bias[kind.cat] ?? 1), [kind, people, history, bias]);
  const amount = est.options[Math.min(opt, est.options.length - 1)]!.cents;
  const left = period.freeCents - amount;
  const days = Math.max(1, diffDays(period.start, period.end) + 1);
  const chip = (on: boolean) => `shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition ${on ? "bg-brand text-brand-ink shadow" : "bg-surface-2 text-muted hover:text-ink"}`;

  return (
    <div className="card overflow-hidden">
      {/* The answer */}
      <div className="bg-gradient-to-br from-surface-3 to-surface p-4" aria-live="polite">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide text-faint">
              Will likely cost
              <Info label="How we estimated">
                {est.reasons.map((r) => <span key={r} className="block">• {r}</span>)}
                <span className="mt-1.5 block">With your own data it uses what you really spend, even at specific places, and gets closer with every plan you finish.</span>
              </Info>
            </p>
            <p className="font-num text-4xl leading-none text-display">~{usd(amount)}</p>
            <p className="mt-1 text-xs text-muted">usually {usd(est.low)}–{usd(est.high)}</p>
          </div>
          <div className="text-right">
            {left >= 0 ? (
              <>
                <p className="text-[11px] text-muted">Leaves</p>
                <p className="font-num text-2xl leading-none text-brand">{usd(left)}</p>
                <p className="text-[11px] text-faint">~{usd(left / days)}/day</p>
              </>
            ) : (
              <>
                <p className="text-[11px] text-muted">Short by</p>
                <p className="font-num text-2xl leading-none text-warn">{usd(-left)}</p>
                <p className="text-[11px] text-faint">options in the app</p>
              </>
            )}
          </div>
        </div>
        <div className="mt-3 flex h-1.5 overflow-hidden rounded-full bg-surface-3" aria-hidden>
          <span className="bg-info" style={{ width: `${Math.min(100, (amount / Math.max(1, period.freeCents)) * 100)}%` }} />
          <span className="bg-brand" style={{ width: `${Math.max(0, (left / Math.max(1, period.freeCents)) * 100)}%` }} />
        </div>
      </div>

      {/* The taps */}
      <div className="space-y-3 p-4">
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1">
          {periods.map((p, i) => (
            <button key={p.start} type="button" onClick={() => setPi(i)} aria-pressed={pi === i} className={chip(pi === i)}>
              {formatShort(p.start)} paycheck · {usd(p.freeCents)} free
            </button>
          ))}
        </div>
        <div className="grid grid-cols-4 gap-1.5">
          {KINDS.map((k) => (
            <button key={k.id} type="button" onClick={() => { setKind(k); setPeople(k.people); setOpt(0); }} aria-pressed={kind.id === k.id}
              className={`flex flex-col items-center gap-1 rounded-2xl px-1 py-2 text-[11px] font-semibold transition ${kind.id === k.id ? "bg-ink text-bg shadow" : "bg-surface-2/70 text-muted hover:text-ink"}`}>
              <Glyph name={k.icon} size="sm" />
              {k.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <PeopleStepper value={people} onChange={(n) => { setPeople(n); setOpt(0); }} />
          {est.options.map((o, i) => (
            <button key={o.label} type="button" onClick={() => setOpt(i)} aria-pressed={opt === i} className={chip(opt === i)}>
              {o.label} {usd(o.cents)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
