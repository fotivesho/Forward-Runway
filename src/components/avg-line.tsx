/**
 * The app's average marker: a quiet dotted line across a chart with the amount sitting at its end.
 * Place it inside a `relative` chart box; `bottom` is where the average falls (a CSS length or %).
 */
export function AvgLine({ bottom, label, side = "right" }: { bottom: string; label: React.ReactNode; side?: "left" | "right" }) {
  return (
    <span className="pointer-events-none absolute inset-x-0 z-10 border-t border-dotted border-muted/70" style={{ bottom }} aria-hidden>
      <span className={`absolute -top-[9px] ${side === "right" ? "right-0" : "left-0"} rounded bg-surface px-1 text-[10px] font-medium leading-4 tabular text-muted`}>{label}</span>
    </span>
  );
}

/** "$557", "$3.5k": short enough to sit on a line or above a bar. */
export const shortMoney = (c: number) => (Math.abs(c) >= 100_000 ? `$${(c / 100_000).toFixed(1).replace(/\.0$/, "")}k` : `$${Math.round(c / 100)}`);
