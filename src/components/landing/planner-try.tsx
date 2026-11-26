"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { diffDays, formatShort, type ISODate } from "@/lib/dates";
import type { ExploreData } from "@/lib/view/explore";
import { CONFIDENCE_LABEL, estimatePlan } from "@/lib/view/estimate";
import { Glyph } from "@/components/icon";
import { Info } from "@/components/info";
import { PeopleStepper } from "@/components/estimate-ui";

const KINDS: Array<{ id: string; label: string; cat: string; people: number; nights?: number; icon: string }> = [
  { id: "dinner", label: "Dinner out", cat: "Dining", people: 2, icon: "Dining" },
  { id: "birthday", label: "Birthday", cat: "Celebrations", people: 1, icon: "Celebrations" },
  { id: "weekend", label: "Getaway", cat: "Travel", people: 2, nights: 2, icon: "Travel" },
  { id: "concert", label: "Concert", cat: "Entertainment", people: 2, icon: "Entertainment" },
];
const usd = (c: number) => `$${Math.round(Math.abs(c) / 100).toLocaleString("en-US")}`;

/**
 * The planner on the landing page, about cost (not yes/no, which the card up top already does):
 * pick a paycheck, a plan and how many people, and see what it will likely cost you, why, and what
 * it leaves of that paycheck.
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
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-2">
      <div className="card space-y-4 p-4 sm:p-5">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-faint">1 · Which paycheck</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {periods.map((p, i) => (
              <button key={p.start} type="button" onClick={() => setPi(i)} aria-pressed={pi === i} className={chip(pi === i)}>
                {formatShort(p.start)} – {formatShort(p.end)} · {usd(p.freeCents)} free
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-faint">2 · What&apos;s the plan</p>
          <div className="mt-2 grid grid-cols-4 gap-1.5">
            {KINDS.map((k) => (
              <button key={k.id} type="button" onClick={() => { setKind(k); setPeople(k.people); setOpt(0); }} aria-pressed={kind.id === k.id}
                className={`flex flex-col items-center gap-1 rounded-2xl px-1 py-2 text-[11px] font-semibold transition ${kind.id === k.id ? "bg-ink text-bg shadow" : "bg-surface-2/70 text-muted hover:text-ink"}`}>
                <Glyph name={k.icon} size="sm" />
                <span className="w-full truncate text-center">{k.label}</span>
              </button>
            ))}
          </div>
          <div className="mt-2"><PeopleStepper value={people} onChange={(n) => { setPeople(n); setOpt(0); }} /></div>
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-faint">3 · How nice</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {est.options.map((o, i) => (
              <button key={o.label} type="button" onClick={() => setOpt(i)} aria-pressed={opt === i} className={chip(opt === i)}>
                {o.label} {usd(o.cents)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="card flex flex-col p-4 sm:p-5" aria-live="polite">
        <p className="text-xs font-bold uppercase tracking-wide text-faint">
          Will likely cost
          <Info label="How we estimated">
            {est.reasons.map((r) => <span key={r} className="block">• {r}</span>)}
            <span className="mt-1.5 block">With your own data, this uses what you really spend, even at specific places, and gets closer with every plan you finish.</span>
          </Info>
        </p>
        <p className="font-num mt-1 text-5xl leading-none text-display">~{usd(amount)}</p>
        <p className="mt-1 text-sm text-muted">
          usually {usd(est.low)}–{usd(est.high)} for {people} {people === 1 ? "person" : "people"}
        </p>
        <p className="mt-1 flex items-center gap-1.5 text-[11px] text-faint">
          <span className={`h-1.5 w-1.5 rounded-full ${est.confidence === "high" ? "bg-brand" : est.confidence === "medium" ? "bg-warn" : "bg-info"}`} />
          {CONFIDENCE_LABEL[est.confidence]}{est.basedOn ? ` (${est.basedOn} purchases)` : ""}
        </p>
        <div className="mt-4 rounded-2xl bg-surface-2/60 p-3">
          {left >= 0 ? (
            <>
              <p className="text-sm text-muted">Leaves <span className="font-num text-xl text-display">{usd(left)}</span> of your {formatShort(period.start)} paycheck</p>
              <p className="text-xs text-faint">about {usd(left / days)} a day for everything else, with every bill still covered</p>
              <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-surface-3" aria-hidden>
                <span className="bg-info" style={{ width: `${(amount / Math.max(1, period.freeCents)) * 100}%` }} />
                <span className="bg-brand" style={{ width: `${(left / Math.max(1, period.freeCents)) * 100}%` }} />
              </div>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold text-warn">{usd(-left)} more than this paycheck has free</p>
              <p className="text-xs text-faint">The app shows the ways to make it work: a later payday, a little from savings, or a smaller version.</p>
            </>
          )}
        </div>
        <Link href="/demo/calendar?add=1" className="btn btn-primary mt-4 self-start">Plan yours in the demo →</Link>
      </div>
    </div>
  );
}
