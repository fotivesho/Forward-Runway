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
  const avg = past.length >= 2 ? past.reduce((t, b) => t + b.cents, 0) / past.length : 0;
  const color = tone === "in" ? "var(--color-in)" : "var(--color-out)";
  const grad = `linear-gradient(to top, color-mix(in srgb, ${color} 50%, transparent), ${color})`;
  const glow = `0 0 12px -2px color-mix(in srgb, ${color} 70%, transparent)`;
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
                <span className={`mx-auto block w-full max-w-[22px] rounded-full transition ${on ? "opacity-100" : "opacity-60 group-hover:opacity-85"}`} style={{ height: `${h}%`, background: grad, boxShadow: on ? glow : undefined }} />
              )}
              {b.kind === "ahead" && (
                <span className={`mx-auto block w-full max-w-[22px] rounded-full border border-dashed transition ${on ? "opacity-100" : "opacity-70"}`} style={{ height: `${h}%`, ...hatch }} />
              )}
              {b.kind === "now" && (
                <span className={`mx-auto flex w-full max-w-[22px] flex-col justify-end overflow-hidden rounded-full transition ${on ? "opacity-100" : "opacity-75"}`} style={{ height: `${h}%`, boxShadow: on ? glow : undefined }}>
                  <span className="block w-full flex-1 rounded-t-full border border-b-0 border-dashed" style={hatch} />
                  <span className="block w-full" style={{ height: `${((b.doneCents ?? 0) / Math.max(1, b.cents)) * 100}%`, background: grad }} />
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
