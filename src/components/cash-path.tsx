import { formatShort, type ISODate } from "@/lib/dates";
import { Money } from "./privacy";

export interface PathLine {
  id: string;
  label: string;
  cents: number[];
  /** Tailwind text color: the line uses currentColor. */
  color: string;
  dashed?: boolean;
  faint?: boolean;
}

/**
 * Where cash is headed, kept quiet: thin lines (no axes, no grid), a light fill under the main line,
 * the floor as a faint dashed mark, and the lowest point labelled right on the chart.
 */
export function CashPath({
  dates,
  lines,
  floorCents,
  height = 96,
  endLabel,
  markLowest = false,
  legend = true,
}: {
  dates: ISODate[];
  lines: PathLine[];
  floorCents?: number;
  height?: number;
  endLabel?: string;
  /** Dot and label the lowest point of the main (last, non-faint) line. */
  markLowest?: boolean;
  legend?: boolean;
}) {
  const all = lines.flatMap((l) => l.cents);
  if (!all.length || dates.length < 2) return null;
  const lo = Math.min(...all, floorCents ?? Infinity);
  const hi = Math.max(...all);
  const pad = (hi - lo) * 0.12 || 100;
  const W = 300;
  const y = (c: number) => height - ((c - lo + pad) / (hi - lo + 2 * pad)) * height;
  const x = (i: number) => (i / (dates.length - 1)) * W;
  const path = (cs: number[]) => cs.map((c, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(c).toFixed(1)}`).join("");
  const main = [...lines].reverse().find((l) => !l.faint) ?? lines[lines.length - 1]!;
  const lowI = main.cents.reduce((b, c, i) => (c < main.cents[b]! ? i : b), 0);
  const lowPct = (lowI / (dates.length - 1)) * 100;
  const lowTop = (y(main.cents[lowI]!) / height) * 100;
  return (
    <figure>
      <div className="relative" style={{ height }}>
        <svg viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" role="img" aria-label={lines.map((l) => `${l.label} ends at $${Math.round(l.cents[l.cents.length - 1]! / 100)}`).join("; ")}>
          <path d={`${path(main.cents)}L${W},${height}L0,${height}Z`} fill="currentColor" className={`${main.color} opacity-[0.08]`} />
          {floorCents != null && <line x1="0" x2={W} y1={y(floorCents)} y2={y(floorCents)} stroke="currentColor" className="text-faint opacity-50" strokeDasharray="2 5" strokeWidth="1" vectorEffect="non-scaling-stroke" />}
          {lines.map((l) => (
            <path key={l.id} d={path(l.cents)} fill="none" stroke="currentColor" className={`${l.color} ${l.faint ? "opacity-35" : ""}`} strokeWidth={l.faint ? 1.25 : 1.75} strokeDasharray={l.dashed ? "5 4" : undefined} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          ))}
        </svg>
        {markLowest && (
          <>
            <span aria-hidden className={`absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-current ${main.color}`} style={{ left: `${lowPct}%`, top: `${lowTop}%` }} />
            <span
              className={`absolute whitespace-nowrap rounded-md bg-surface/90 px-1.5 py-0.5 text-[10px] font-semibold text-ink shadow-sm ${lowPct > 60 ? "-translate-x-full" : ""}`}
              style={{ left: `calc(${lowPct}% ${lowPct > 60 ? "- 6px" : "+ 6px"})`, top: `calc(${lowTop}% + 4px)` }}
            >
              Lowest <Money cents={main.cents[lowI]!} whole /> · {formatShort(dates[lowI]!)}
            </span>
          </>
        )}
      </div>
      <figcaption className="mt-1 flex justify-between text-[10px] text-faint">
        <span>Today</span>
        <span>{endLabel ?? formatShort(dates[dates.length - 1]!)}</span>
      </figcaption>
      {legend && (
        <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
          {lines.map((l) => (
            <li key={l.id} className="flex items-center gap-1 text-faint">
              <span className={`inline-block h-0.5 w-3 rounded ${l.color} ${l.faint ? "opacity-40" : ""}`} style={{ background: "currentColor" }} />
              {l.label} <Money cents={l.cents[l.cents.length - 1]!} whole className="font-semibold text-muted" />
            </li>
          ))}
          {floorCents != null && <li className="flex items-center gap-1 text-faint"><span className="inline-block w-3 border-t border-dashed border-faint" />Floor</li>}
        </ul>
      )}
    </figure>
  );
}
