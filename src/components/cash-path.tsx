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
 * Where cash is headed, as a few clean lines (no axes, no grid): today on the left, the end on the
 * right, a dashed floor, and the value each line ends at in the legend.
 */
export function CashPath({ dates, lines, floorCents, height = 96, endLabel }: { dates: ISODate[]; lines: PathLine[]; floorCents?: number; height?: number; endLabel?: string }) {
  const all = lines.flatMap((l) => l.cents);
  if (!all.length || dates.length < 2) return null;
  const lo = Math.min(...all, floorCents ?? Infinity);
  const hi = Math.max(...all);
  const pad = (hi - lo) * 0.08 || 100;
  const W = 300;
  const y = (c: number) => height - ((c - lo + pad) / (hi - lo + 2 * pad)) * height;
  const x = (i: number) => (i / (dates.length - 1)) * W;
  const path = (cs: number[]) => cs.map((c, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(c).toFixed(1)}`).join("");
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" className="block w-full overflow-visible" style={{ height }} role="img" aria-label={lines.map((l) => `${l.label} ends at $${Math.round(l.cents[l.cents.length - 1]! / 100)}`).join("; ")}>
        {floorCents != null && <line x1="0" x2={W} y1={y(floorCents)} y2={y(floorCents)} className="text-warn/70" stroke="currentColor" strokeDasharray="3 4" strokeWidth="1" vectorEffect="non-scaling-stroke" />}
        {lines.map((l) => (
          <path key={l.id} d={path(l.cents)} fill="none" stroke="currentColor" className={`${l.color} ${l.faint ? "opacity-40" : ""}`} strokeWidth={l.faint ? 1.5 : 2.5} strokeDasharray={l.dashed ? "5 4" : undefined} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        ))}
      </svg>
      <figcaption className="mt-1 flex justify-between text-[10px] text-faint">
        <span>Today</span>
        <span>{endLabel ?? formatShort(dates[dates.length - 1]!)}</span>
      </figcaption>
      <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
        {lines.map((l) => (
          <li key={l.id} className="flex items-center gap-1 text-muted">
            <span className={`inline-block h-0.5 w-3 rounded ${l.color} ${l.faint ? "opacity-40" : ""}`} style={{ background: "currentColor" }} />
            {l.label} <Money cents={l.cents[l.cents.length - 1]!} whole className="font-semibold text-ink" />
          </li>
        ))}
        {floorCents != null && <li className="flex items-center gap-1 text-muted"><span className="inline-block w-3 border-t border-dashed border-warn" />Floor</li>}
      </ul>
    </figure>
  );
}
