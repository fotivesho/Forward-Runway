"use client";

import { useState } from "react";
import type { FlowBucket } from "@/lib/view/spend";
import { Money, useHideAmounts } from "./privacy";
import { Info } from "./info";
import { formatCents } from "@/lib/money";

const toggle = (active: boolean) =>
  `min-h-8 rounded-md px-3 text-xs font-medium sm:text-sm ${active ? "bg-brand text-brand-ink" : "text-muted hover:text-ink"}`;
/** "$459", "$1.4k": short enough to sit above a bar without wrapping. */
const compact = (c: number, hide: boolean) =>
  hide ? "•••" : c >= 100_000 ? "$" + (c / 100_000).toFixed(1).replace(/\.0$/, "") + "k" : "$" + Math.round(c / 100).toLocaleString("en-US");

/** Money in vs out by month or pay period, with the net on top of each pair of bars. */
export function CashFlowCard({ months, periods }: { months: FlowBucket[]; periods: FlowBucket[] | null }) {
  const hide = useHideAmounts();
  const [mode, setMode] = useState<"month" | "period">("month");
  const data = mode === "period" && periods ? periods : months;
  const [sel, setSel] = useState<number | null>(null);
  const idx = sel != null && sel < data.length ? sel : data.length - 1;
  const max = Math.max(1, ...data.flatMap((b) => [b.inCents, b.outCents]));
  const b = data[idx]!;
  const net = b.inCents - b.outCents;
  return (
    <section className="card p-4 sm:p-5" aria-labelledby="flow-title">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 id="flow-title" className="text-base font-bold text-ink">Net cash flow</h2>
        {periods && (
          <div role="group" aria-label="Group by" className="flex rounded-lg border border-line p-0.5">
            <button type="button" className={toggle(mode === "month")} aria-pressed={mode === "month"} onClick={() => { setMode("month"); setSel(null); }}>By month</button>
            <button type="button" className={toggle(mode === "period")} aria-pressed={mode === "period"} onClick={() => { setMode("period"); setSel(null); }}>By pay period</button>
          </div>
        )}
      </div>
      <ol className="grid h-44 items-end gap-1.5 sm:gap-3" style={{ gridTemplateColumns: `repeat(${data.length}, minmax(0, 1fr))` }} aria-label="Money in and out">
        {data.map((d, i) => {
          const n = d.inCents - d.outCents;
          const active = i === idx;
          return (
            <li key={d.start} className="flex h-full flex-col">
              <button
                type="button"
                onClick={() => setSel(i)}
                aria-pressed={active}
                aria-label={`${d.label}: ${hide ? "hidden" : `${formatCents(d.inCents)} in, ${formatCents(d.outCents)} out`}`}
                className={`flex h-full flex-col items-center justify-end rounded-lg px-0.5 pb-1 pt-1 transition ${active ? "bg-surface-3" : "hover:bg-surface-2"}`}
              >
                <span className={`mb-1 whitespace-nowrap text-[10px] font-semibold tabular sm:text-xs ${n >= 0 ? "text-in" : "text-out"}`}>{n >= 0 ? "+" : "−"}{compact(Math.abs(n), hide)}</span>
                <span className="flex w-full flex-1 items-end justify-center gap-0.5">
                  <span className={`w-1/2 max-w-4 rounded-t bg-in ${d.current ? "opacity-60" : ""}`} style={{ height: `${(d.inCents / max) * 100}%` }} />
                  <span className={`w-1/2 max-w-4 rounded-t bg-out ${d.current ? "opacity-60" : ""}`} style={{ height: `${(d.outCents / max) * 100}%` }} />
                </span>
              </button>
              <span className={`mt-1 truncate text-center text-[10px] sm:text-xs ${active ? "font-semibold text-ink" : "text-faint"}`}>{d.label}</span>
            </li>
          );
        })}
      </ol>
      <div className="mt-3 rounded-xl border border-line bg-surface-2/50 p-3 text-sm">
        <p className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="font-semibold text-ink">{b.label}{b.current && <Info label="This period">So far, plus what&apos;s still scheduled before it ends.</Info>}</span>
          <span className={`text-lg font-bold ${net >= 0 ? "text-in" : "text-out"}`}><Money cents={net} whole sign /></span>
        </p>
        <p className="mt-0.5 text-muted">
          <Money cents={b.inCents} whole tone="in" /> in · <Money cents={-b.outCents} whole tone="out" /> out
          {b.savingsCents > 0 && <Info label="Money out">Includes <Money cents={b.savingsCents} whole /> moved to savings. That money is still yours, just set aside.</Info>}
        </p>
      </div>
    </section>
  );
}

