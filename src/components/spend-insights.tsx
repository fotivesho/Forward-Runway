"use client";

import { useState } from "react";
import type { CategoryBucket, FlowBucket } from "@/lib/view/spend";
import { Money, useHideAmounts } from "./privacy";
import { Glyph } from "@/components/icon";
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

/** One category over time: monthly or weekly bars, with your average as a dashed line. */
export function CategoryTrend({ category, month, week, picked, onPick }: { category: string; month: CategoryBucket[]; week: CategoryBucket[]; picked?: string | null; onPick?: (b: CategoryBucket | null) => void }) {
  const hide = useHideAmounts();
  const [mode, setMode] = useState<"month" | "week">("month");
  const data = mode === "month" ? month : week;
  // Average only from the first period it showed up: earlier ones are before your history, not zeros.
  const firstSeen = data.findIndex((d) => d.cents > 0);
  const full = data.filter((d, i) => !d.current && i >= Math.max(0, firstSeen));
  const avg = full.length ? Math.round(full.reduce((t, d) => t + d.cents, 0) / full.length) : 0;
  const max = Math.max(1, avg, ...data.map((d) => d.cents));
  const now = data[data.length - 1]!;
  return (
    <div className="mb-3 rounded-xl border border-line bg-surface-2/50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold text-ink"><Glyph name={category} size="xs" /> {category} over time</p>
        <div role="group" aria-label="Group by" className="flex rounded-lg border border-line bg-surface p-0.5">
          <button type="button" className={toggle(mode === "month")} aria-pressed={mode === "month"} onClick={() => { setMode("month"); onPick?.(null); }}>Monthly</button>
          <button type="button" className={toggle(mode === "week")} aria-pressed={mode === "week"} onClick={() => { setMode("week"); onPick?.(null); }}>Weekly</button>
        </div>
      </div>
      <p className="mt-1 text-sm text-muted">
        {mode === "month" ? "This month" : "Last 7 days"} <Money cents={now.cents} className="font-semibold text-ink" /> · average <Money cents={avg} /> a {mode === "month" ? "month" : "week"}
        {avg > 0 && now.cents > avg && !now.current && <span className="text-warn"> · above average</span>}
      </p>
      {onPick && !picked && <p className="text-[11px] text-faint">Tap a bar to see just those transactions.</p>}
      <div className="relative mt-3">
        {avg > 0 && (
          <span className="pointer-events-none absolute inset-x-0 border-t border-dashed border-info" style={{ bottom: `calc(1.125rem + ${(avg / max) * 7}rem)` }} aria-hidden>
            <span className="absolute -top-4 right-0 text-[10px] text-info">avg</span>
          </span>
        )}
        <ol className="grid items-end gap-1" style={{ gridTemplateColumns: `repeat(${data.length}, minmax(0, 1fr))` }} aria-label={`${category} spending by ${mode}`}>
          {data.map((d) => {
            const on = picked === d.start;
            const dim = picked && !on;
            return (
              <li key={d.start}>
                <button type="button" onClick={() => onPick?.(on ? null : d)} aria-pressed={on} aria-label={`${d.label}: ${hide ? "hidden" : formatCents(d.cents)}. Show these transactions.`} className="flex w-full flex-col items-center">
                  <span className="flex h-28 w-full items-end justify-center">
                    <span className={`w-full max-w-6 rounded-t transition ${d.current ? "bg-brand/50" : "bg-brand"} ${dim ? "opacity-30" : ""} ${on ? "ring-2 ring-ink/70 ring-offset-1 ring-offset-surface" : ""}`} style={{ height: `${Math.max(d.cents ? 3 : 0, (d.cents / max) * 100)}%` }} />
                  </span>
                  <span className={`mt-0.5 h-4 truncate text-[9px] sm:text-[10px] ${on ? "font-bold text-ink" : "text-faint"}`}>{mode === "month" ? d.label : d.label.split(" ")[1]}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
