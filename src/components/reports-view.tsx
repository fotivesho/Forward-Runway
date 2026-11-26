"use client";

import { useMemo, useState } from "react";
import { iconFor } from "@/lib/categories";
import { formatCents } from "@/lib/money";
import { GROUPS, type SpendingReport } from "@/lib/view/budget";
import type { CategoryGroup } from "@/lib/data/snapshot";
import { Money, useHideAmounts } from "./privacy";

const COLOR: Record<CategoryGroup, string> = { needs: "bg-info", wants: "bg-brand", savings: "bg-warn" };
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const label = (m: string) => MONTHS[Number(m.slice(5, 7)) - 1]!;
const seg = (active: boolean) => `min-h-9 flex-1 rounded-md px-2 text-xs font-medium sm:text-sm ${active ? "bg-brand text-brand-ink" : "text-muted hover:text-ink"}`;

/** Slice and dice: everything by group, one group by category, or one category over time. */
export function ReportsView({ report6, report12, groupOf }: { report6: SpendingReport; report12: SpendingReport; groupOf: Record<string, CategoryGroup> }) {
  const hide = useHideAmounts();
  const [range, setRange] = useState<6 | 12>(6);
  const [focus, setFocus] = useState<"all" | CategoryGroup>("all");
  const [cat, setCat] = useState<string | null>(null);
  const data = range === 6 ? report6 : report12;
  const full = data.filter((m) => !m.current);

  // Categories in view, biggest first, with their average and this month vs average.
  const rows = useMemo(() => {
    const names = new Set<string>();
    for (const m of data) for (const c of Object.keys(m.categories)) if (focus === "all" || groupOf[c] === focus) names.add(c);
    return [...names]
      .map((c) => {
        const avg = full.length ? Math.round(full.reduce((t, m) => t + (m.categories[c] ?? 0), 0) / full.length) : 0;
        const now = data[data.length - 1]!.categories[c] ?? 0;
        return { c, avg, now, total: data.reduce((t, m) => t + (m.categories[c] ?? 0), 0) };
      })
      .sort((a, b) => b.total - a.total);
  }, [data, full, focus, groupOf]);

  // Bars: one category, a group split by its top categories, or everything split by group.
  const series = (m: SpendingReport[number]): Array<{ key: string; cents: number; cls: string }> => {
    if (cat) return [{ key: cat, cents: m.categories[cat] ?? 0, cls: COLOR[groupOf[cat] ?? "wants"] }];
    if (focus === "all") return GROUPS.map((g) => ({ key: g.id, cents: m.groups[g.id], cls: COLOR[g.id] }));
    return [{ key: focus, cents: m.groups[focus], cls: COLOR[focus] }];
  };
  const max = Math.max(1, ...data.map((m) => series(m).reduce((t, x) => t + x.cents, 0)));
  const avgTotal = full.length ? full.reduce((t, m) => t + series(m).reduce((a, x) => a + x.cents, 0), 0) / full.length : 0;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
      <section className="card p-4 sm:p-5" aria-labelledby="rep-title">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="rep-title" className="text-base font-semibold text-ink">{cat ? <>{iconFor(cat)} {cat}</> : focus === "all" ? "Spending by group" : GROUPS.find((g) => g.id === focus)!.label}</h2>
          <div className="flex rounded-lg border border-line p-0.5" role="group" aria-label="Range">
            <button type="button" className={seg(range === 6)} aria-pressed={range === 6} onClick={() => setRange(6)}>6 mo</button>
            <button type="button" className={seg(range === 12)} aria-pressed={range === 12} onClick={() => setRange(12)}>12 mo</button>
          </div>
        </div>
        <div className="mt-3 flex rounded-lg border border-line p-0.5" role="group" aria-label="Show">
          <button type="button" className={seg(focus === "all" && !cat)} onClick={() => { setFocus("all"); setCat(null); }}>All</button>
          {GROUPS.map((g) => (
            <button key={g.id} type="button" className={seg(focus === g.id && !cat)} onClick={() => { setFocus(g.id); setCat(null); }}>{g.label}</button>
          ))}
        </div>

        <div className="relative mt-4">
          {avgTotal > 0 && (
            <span className="pointer-events-none absolute inset-x-0 border-t border-dashed border-faint" style={{ bottom: `calc(1.25rem + ${(avgTotal / max) * 10}rem)` }} aria-hidden>
              <span className="absolute -top-4 right-0 text-[10px] text-faint">avg {hide ? "" : formatCents(Math.round(avgTotal), { compact: true })}</span>
            </span>
          )}
          <ol className="grid items-end gap-1.5" style={{ gridTemplateColumns: `repeat(${data.length}, minmax(0, 1fr))` }} aria-label="Spending by month">
            {data.map((m) => {
              const parts = series(m);
              const total = parts.reduce((t, x) => t + x.cents, 0);
              return (
                <li key={m.month} className="flex flex-col items-center" title={`${label(m.month)}: ${hide ? "hidden" : formatCents(total)}`}>
                  <span className="mb-1 text-[9px] tabular text-muted sm:text-[10px]">{hide ? "" : formatCents(total, { compact: true })}</span>
                  <span className={`flex h-40 w-full max-w-9 flex-col overflow-hidden rounded-t ${m.current ? "opacity-60" : ""}`}>
                    <span className="flex-1" />
                    {[...parts].reverse().map((x) => <span key={x.key} className={`shrink-0 ${x.cls}`} style={{ height: `${(x.cents / max) * 100}%` }} />)}
                  </span>
                  <span className={`mt-1 h-4 text-[10px] ${m.current ? "font-semibold text-ink" : "text-faint"}`}>{label(m.month)}</span>
                </li>
              );
            })}
          </ol>
        </div>
        {focus === "all" && !cat && (
          <p className="mt-2 flex flex-wrap gap-x-3 text-[11px] text-muted">
            {GROUPS.map((g) => <span key={g.id}><span className={`mr-1 inline-block h-2 w-2 rounded-full ${COLOR[g.id]}`} />{g.label}</span>)}
            <span>· faded = this month so far</span>
          </p>
        )}
      </section>

      <section className="card p-4 sm:p-5" aria-labelledby="cats-title">
        <h2 id="cats-title" className="text-base font-semibold text-ink">Categories</h2>
        <p className="text-xs text-muted">Tap one to see it over time. This month so far vs your monthly average.</p>
        <ul className="mt-2 divide-y divide-line">
          {rows.map((r) => {
            const pace = r.avg ? r.now / r.avg : 0;
            return (
              <li key={r.c}>
                <button type="button" onClick={() => setCat(cat === r.c ? null : r.c)} aria-pressed={cat === r.c} className={`flex w-full items-center gap-3 py-2 text-left ${cat === r.c ? "text-brand" : ""}`}>
                  <span aria-hidden className="text-lg">{iconFor(r.c)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink">{r.c}</span>
                    <span className="block text-[11px] text-muted">{GROUPS.find((g) => g.id === (groupOf[r.c] ?? "wants"))!.label} · avg <Money cents={r.avg} whole />/mo</span>
                  </span>
                  <span className="text-right text-sm tabular">
                    <Money cents={r.now} whole className="font-semibold text-ink" />
                    {r.avg > 0 && <span className={`block text-[11px] ${pace > 1 ? "text-warn" : "text-muted"}`}>{Math.round(pace * 100)}% of avg</span>}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
