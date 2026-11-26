import { formatShort, type ISODate } from "@/lib/dates";

export interface BillRoomPalette {
  ink: string;
  muted: string;
  good: string;
  warn: string;
  bad: string;
  track: string;
  usual: string;
  box: string;
}

/** App colors (follow the theme). */
export const APP_PALETTE: BillRoomPalette = {
  ink: "var(--color-ink)",
  muted: "var(--color-muted)",
  good: "var(--color-brand)",
  warn: "var(--color-warn)",
  bad: "var(--color-danger)",
  track: "var(--color-surface-3)",
  usual: "color-mix(in srgb, var(--color-muted) 45%, transparent)",
  box: "var(--color-surface)",
};

const usd = (c: number) => `$${Math.round(Math.abs(c) / 100).toLocaleString("en-US")}`;

/**
 * A credit card bill, room first: the big number is how much more fits on this bill before it's
 * more than you can pay in full (or how far over). The bar shows why: what's usually on it (grey),
 * this purchase (green), a little borrowed from next pay period (amber), and over (red stripes),
 * against a line at the most you can pay.
 */
export function BillRoom({
  usualCents,
  withCents,
  capCents,
  due,
  fits,
  palette = APP_PALETTE,
  label = "Card bill",
}: {
  usualCents: number;
  withCents: number;
  capCents: number;
  due: ISODate;
  /** The overall answer is yes: a small overage is borrowed from the next pay period, not "over". */
  fits: boolean;
  palette?: BillRoomPalette;
  label?: string;
}) {
  const p = palette;
  const add = Math.max(0, withCents - usualCents);
  const room = capCents - withCents;
  const over = Math.max(0, -room);
  const borrowed = fits ? over : 0;
  const red = over - borrowed;
  const scale = Math.max(withCents, capCents) * 1.04 || 1;
  const pct = (c: number) => `${Math.max(0, (c / scale) * 100)}%`;
  const color = room >= 0 ? p.good : borrowed ? p.warn : p.bad;
  return (
    <div className="min-w-0 flex-1 rounded-2xl p-3" style={{ background: p.box }}>
      <p className="text-[11px] font-bold" style={{ color: p.ink }}>{label} · {formatShort(due)}</p>
      <p className="mt-1 flex flex-wrap items-baseline gap-x-1.5">
        <span className="font-num text-2xl leading-none" style={{ color }}>{room >= 0 ? usd(room) : borrowed ? usd(borrowed) : `−${usd(over)}`}</span>
        <span className="text-[11px] font-semibold" style={{ color }}>{room >= 0 ? "room left" : borrowed ? "borrowed" : "over"}</span>
      </p>
      <div className="relative mt-2.5 h-2 rounded-full" style={{ background: p.track }} aria-hidden>
        <span className="absolute inset-y-0 left-0 rounded-l-full" style={{ width: pct(Math.min(usualCents, capCents)), background: p.usual }} />
        <span className="absolute inset-y-0" style={{ left: pct(usualCents), width: pct(Math.max(0, Math.min(add, capCents - usualCents))), background: p.good }} />
        {borrowed > 0 && <span className="absolute inset-y-0" style={{ left: pct(capCents), width: pct(borrowed), background: p.warn }} />}
        {red > 0 && (
          <span
            className="absolute inset-y-0 rounded-r-full"
            style={{ left: pct(capCents + borrowed), width: pct(red), background: `repeating-linear-gradient(45deg, ${p.bad}, ${p.bad} 3px, transparent 3px, transparent 6px), ${p.bad}88` }}
          />
        )}
        <span className="absolute -inset-y-1 w-0.5 rounded" style={{ left: pct(capCents), background: p.ink }} />
      </div>
      <p className="mt-1.5 text-[10px] leading-tight" style={{ color: p.muted }}>
        Bill {usd(withCents)} · max {usd(capCents)}
      </p>
    </div>
  );
}
