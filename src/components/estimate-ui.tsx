"use client";

import { Minus, Plus } from "lucide-react";
import { CONFIDENCE_LABEL, type Estimate } from "@/lib/view/estimate";
import { Info } from "./info";
import { Money } from "./privacy";

/** − 2 people + */
export function PeopleStepper({ value, onChange, max = 12 }: { value: number; onChange: (n: number) => void; max?: number }) {
  const btn = "flex h-8 w-8 items-center justify-center rounded-full text-muted transition hover:text-ink active:scale-90 disabled:opacity-30";
  return (
    <span className="inline-flex items-center rounded-full bg-surface-2 p-0.5" role="group" aria-label="People">
      <button type="button" className={btn} onClick={() => onChange(Math.max(1, value - 1))} disabled={value <= 1} aria-label="Fewer people"><Minus size={14} strokeWidth={2.4} /></button>
      <span className="min-w-[4.5rem] text-center text-sm font-bold text-ink">{value} {value === 1 ? "person" : "people"}</span>
      <button type="button" className={btn} onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label="More people"><Plus size={14} strokeWidth={2.4} /></button>
    </span>
  );
}

const CONF_DOT = { high: "bg-brand", medium: "bg-warn", starter: "bg-info" } as const;

/**
 * The estimate in one line: "~$92 · usually $84–$110", how sure we are, and "How we estimated"
 * behind ⓘ. Tapping an option sets the amount.
 */
export function EstimateLine({ e, selected, onPick }: { e: Estimate; selected?: number | null; onPick?: (cents: number) => void }) {
  return (
    <div className="rounded-2xl border border-brand/25 bg-brand/[0.07] p-3">
      <p className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-xs font-bold uppercase tracking-wide text-faint">Likely cost</span>
        <span className="font-num text-2xl text-display">~<Money cents={e.cents} whole /></span>
        <span className="text-xs text-muted">
          usually <Money cents={e.low} whole />–<Money cents={e.high} whole />
        </span>
        <Info label="How we estimated">
          <span className="block">{e.reasons.map((r) => <span key={r} className="block">• {r}</span>)}</span>
          <span className="mt-1.5 block">{CONFIDENCE_LABEL[e.confidence]}. It&apos;s an estimate, not a quote: the more plans you finish, the closer it gets.</span>
        </Info>
      </p>
      <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-faint">
        <span className={`h-1.5 w-1.5 rounded-full ${CONF_DOT[e.confidence]}`} />
        {CONFIDENCE_LABEL[e.confidence]}{e.basedOn ? ` (${e.basedOn})` : ""}
      </p>
      {onPick && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {e.options.map((o) => {
            const on = selected === o.cents;
            return (
              <button key={o.label} type="button" onClick={() => onPick(o.cents)} aria-pressed={on}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${on ? "bg-brand text-brand-ink shadow" : "bg-surface text-muted hover:text-ink"}`}>
                {o.label} <Money cents={o.cents} whole />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
