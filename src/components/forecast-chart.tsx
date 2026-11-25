"use client";

import { Area, CartesianGrid, ComposedChart, Line, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatShort, formatLong } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import type { ForecastDay } from "@/lib/engine";
import { useHideAmounts } from "./privacy";
import { useResolvedTheme } from "./theme";

// Both palettes validated with the dataviz palette checker against their surfaces
// (light #fffcf4, dark #18231c): lightness band, chroma, CVD separation and contrast all pass.
const PALETTES = {
  light: { balance: "#2e8a52", allowance: "#3a78c2", floor: "#b8860b", grid: "#e6dcc6", tick: "#4f6455", label: "#1d3324", ring: "#fffcf4", tipBg: "#fffcf4" },
  dark: { balance: "#45b06b", allowance: "#5d9be0", floor: "#e8c26a", grid: "#2b3d31", tick: "#bfc6b4", label: "#efe9d8", ring: "#18231c", tipBg: "#1f2c24" },
} as const;

interface Point {
  date: string;
  closing: number;
  afterAllowance?: number;
  inflows: number;
  outflows: number;
}

export function ForecastChart({
  days,
  floorCents,
  allowanceByDay,
  lowest,
  onSelect,
  height = 240,
}: {
  days: ForecastDay[];
  floorCents: number;
  /** Cumulative flexible allowance through each day (same length as days). */
  allowanceByDay?: number[];
  lowest: { date: string; cents: number };
  onSelect?: (date: string) => void;
  height?: number;
}) {
  const hide = useHideAmounts();
  const c = PALETTES[useResolvedTheme()];
  const SERIES_BALANCE = c.balance;
  const SERIES_ALLOWANCE = c.allowance;
  const FLOOR = c.floor;
  const GRID = c.grid;
  const TICK = c.tick;
  const LABEL = c.label;
  const RING = c.ring;
  const data: Point[] = days.map((d, i) => ({
    date: d.date,
    closing: d.closingCents / 100,
    afterAllowance: allowanceByDay ? (d.closingCents - allowanceByDay[i]!) / 100 : undefined,
    inflows: d.inflowsCents,
    outflows: d.outflowsCents,
  }));
  const fmtAxis = (v: number) => (hide ? "" : formatCents(Math.round(v * 100), { compact: true }));
  const summary = `Projected cash from ${formatShort(days[0]!.date)} to ${formatShort(days[days.length - 1]!.date)}. Lowest ${
    hide ? "hidden" : formatCents(lowest.cents)
  } on ${formatShort(lowest.date)}. Cash floor ${hide ? "hidden" : formatCents(floorCents)}. The daily timeline below lists every value.`;

  return (
    <figure className="m-0">
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted" aria-hidden>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4 rounded" style={{ background: SERIES_BALANCE }} /> Projected cash
        </span>
        {allowanceByDay && (
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block w-4 border-t-2 border-dashed" style={{ borderColor: SERIES_ALLOWANCE }} /> If you spend your full daily allowance
          </span>
        )}
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-4 border-t border-dashed" style={{ borderColor: FLOOR }} /> Cash floor
        </span>
      </div>
      <div role="img" aria-label={summary} style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={data}
            margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
            onClick={(e) => {
              const label = (e as { activeLabel?: string } | null)?.activeLabel;
              if (label && onSelect) onSelect(String(label));
            }}
          >
            <defs>
              <linearGradient id="fr-balance" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={SERIES_BALANCE} stopOpacity={0.22} />
                <stop offset="100%" stopColor={SERIES_BALANCE} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={GRID} strokeOpacity={0.5} vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={formatShort}
              tick={{ fill: TICK, fontSize: 11 }}
              axisLine={{ stroke: GRID }}
              tickLine={false}
              minTickGap={24}
            />
            <YAxis tickFormatter={fmtAxis} tick={{ fill: TICK, fontSize: 11 }} axisLine={false} tickLine={false} width={hide ? 8 : 52} />
            <Tooltip
              cursor={{ stroke: TICK, strokeWidth: 1 }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0]!.payload as Point;
                const money = (c: number) => (hide ? "$•••" : formatCents(c));
                return (
                  <div className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-xs shadow-lg">
                    <p className="mb-1 font-semibold text-ink">{formatLong(p.date)}</p>
                    <p className="text-ink">
                      <strong className="tabular">{money(Math.round(p.closing * 100))}</strong> <span className="text-muted">closing cash</span>
                    </p>
                    {p.afterAllowance != null && (
                      <p className="text-ink">
                        <strong className="tabular">{money(Math.round(p.afterAllowance * 100))}</strong> <span className="text-muted">after full allowance</span>
                      </p>
                    )}
                    {(p.inflows > 0 || p.outflows > 0) && (
                      <p className="mt-1 text-muted">
                        {p.inflows > 0 && <span className="tabular text-in">+{money(p.inflows)} in </span>}
                        {p.outflows > 0 && <span className="tabular text-out">−{money(p.outflows)} out</span>}
                      </p>
                    )}
                  </div>
                );
              }}
            />
            <ReferenceLine
              y={floorCents / 100}
              stroke={FLOOR}
              strokeDasharray="4 4"
              label={{ value: hide ? "Floor" : `Floor ${formatCents(floorCents, { compact: true })}`, fill: LABEL, fontSize: 11, position: "insideBottomRight" }}
            />
            <Area type="stepAfter" dataKey="closing" stroke={SERIES_BALANCE} strokeWidth={2} fill="url(#fr-balance)" isAnimationActive={false} activeDot={{ r: 5, stroke: RING, strokeWidth: 2 }} />
            {allowanceByDay && (
              <Line type="stepAfter" dataKey="afterAllowance" stroke={SERIES_ALLOWANCE} strokeWidth={2} strokeDasharray="6 4" dot={false} isAnimationActive={false} activeDot={{ r: 4, stroke: RING, strokeWidth: 2 }} />
            )}
            <ReferenceDot
              x={lowest.date}
              y={lowest.cents / 100}
              r={5}
              fill={SERIES_BALANCE}
              stroke={RING}
              strokeWidth={2}
              label={{ value: "Lowest", position: "top", fill: LABEL, fontSize: 11 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="sr-only">{summary}</figcaption>
    </figure>
  );
}
