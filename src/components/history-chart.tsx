"use client";

import type { HistBar } from "@/lib/view/history";
import { Money, useHideAmounts } from "./privacy";
import { AvgLine, shortMoney } from "./avg-line";

/**
 * Past and ahead at a glance: solid bars for what happened, dashed, shaded bars for what's
 * expected, a "today" line between them. Tap a bar to read it (and, for a repeating item, act on it).
 */
export function HistoryChart({
  bars,
  tone,
  selected,
  onSelect,
}: {
  bars: HistBar[];
  tone: "in" | "out";
  selected: string | null;
  onSelect: (key: string) => void;
}) {
  const hide = useHideAmounts();
  const max = Math.max(1, ...bars.map((b) => b.cents));
  const past = bars.filter((b) => b.kind === "past");
  const mean = past.length >= 2 ? past.reduce((t, b) => t + b.cents, 0) / past.length : 0;
  // A line through identical bars (a fixed paycheck) says nothing: only show it when amounts vary.
  const spread = past.length ? Math.max(...past.map((b) => b.cents)) - Math.min(...past.map((b) => b.cents)) : 0;
  const avg = mean > 0 && spread > mean * 0.05 ? mean : 0;
  const solid = tone === "in" ? "bg-in" : "bg-out";
  const color = tone === "in" ? "var(--color-in)" : "var(--color-out)";
  const hatch = { backgroundImage: `repeating-linear-gradient(135deg, color-mix(in srgb, ${color} 28%, transparent) 0 3px, transparent 3px 7px)`, borderColor: color };
  const firstAhead = bars.findIndex((b) => b.kind !== "past");
  const sel = bars.find((b) => b.key === selected) ?? null;

  return (
    <div>
      <p className="flex min-h-5 items-baseline justify-between gap-2 text-sm" aria-live="polite">
        {sel ? (
          <>
            <span className="text-muted">
              {sel.title}
              {sel.kind === "ahead" && <span className="ml-1.5 rounded-full bg-surface-3 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-faint">expected</span>}
            </span>
            <span className="font-num text-lg leading-none text-display">
              {sel.kind === "now" ? <><Money cents={sel.doneCents ?? 0} whole /> <span className="font-sans text-xs text-faint">so far · ~<Money cents={sel.cents} whole /> by month end</span></> : <><Money cents={sel.cents} whole={sel.cents >= 100_000} /></>}
            </span>
          </>
        ) : (
          <span className="text-faint">Tap a bar</span>
        )}
      </p>
      <div className="relative mt-5 flex h-28 items-end gap-1.5" role="group" aria-label="Past and expected amounts">
        {avg > 0 && <AvgLine bottom={`${(avg / max) * 100}%`} label={`avg ${hide ? "" : shortMoney(avg)}`} />}
        {bars.map((b, i) => {
          const h = Math.max(4, (b.cents / max) * 100);
          const on = b.key === selected;
          return (
            <button
              key={b.key}
              type="button"
              onClick={() => onSelect(b.key)}
              aria-pressed={on}
              aria-label={`${b.title}: ${(b.cents / 100).toFixed(0)} dollars${b.kind === "ahead" ? ", expected" : ""}`}
              className={`group relative flex h-full min-w-0 flex-1 flex-col justify-end ${i === firstAhead && i > 0 ? "ml-2" : ""}`}
            >
              {i === firstAhead && i > 0 && (
                <span aria-hidden className="absolute -left-[0.55rem] top-0 h-full border-l border-dashed border-faint/60">
                  <span className="absolute -top-4 -left-3.5 text-[9px] font-semibold uppercase tracking-wide text-faint">today</span>
                </span>
              )}
              {b.kind === "past" && (
                <span className={`block w-full rounded-t-md ${solid} transition ${on ? "opacity-100" : "opacity-55 group-hover:opacity-80"}`} style={{ height: `${h}%` }} />
              )}
              {b.kind === "ahead" && (
                <span className={`block w-full rounded-t-md border border-dashed transition ${on ? "opacity-100" : "opacity-70"}`} style={{ height: `${h}%`, ...hatch }} />
              )}
              {b.kind === "now" && (
                <span className={`flex w-full flex-col justify-end overflow-hidden rounded-t-md transition ${on ? "opacity-100" : "opacity-75"}`} style={{ height: `${h}%` }}>
                  <span className="block w-full flex-1 border border-b-0 border-dashed" style={hatch} />
                  <span className={`block w-full ${solid}`} style={{ height: `${((b.doneCents ?? 0) / Math.max(1, b.cents)) * 100}%` }} />
                </span>
              )}
              {on && <span aria-hidden className="absolute -bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-ink" />}
            </button>
          );
        })}
      </div>
      <div className="mt-2 flex gap-1.5" aria-hidden>
        {bars.map((b, i) => (
          <span key={b.key} className={`min-w-0 flex-1 whitespace-nowrap text-center text-[10px] tabular ${b.key === selected ? "font-bold text-ink" : "text-faint"} ${i === firstAhead && i > 0 ? "ml-2" : ""}`}>{b.label}</span>
        ))}
      </div>
    </div>
  );
}
