"use client";

import { useMemo, useState } from "react";
import { formatLong } from "@/lib/dates";
import { GROUPS, type CategoryItem, type SpendingReport } from "@/lib/view/budget";
import type { CategoryGroup } from "@/lib/data/snapshot";
import { Glyph } from "@/components/icon";
import { Money, useHideAmounts } from "./privacy";

const COLOR: Record<CategoryGroup, string> = { needs: "bg-info", wants: "bg-brand", savings: "bg-warn" };
const seg = (active: boolean) => `min-h-9 flex-1 rounded-md px-2 text-xs font-medium sm:text-sm ${active ? "bg-brand text-brand-ink" : "text-muted hover:text-ink"}`;
/** "$557", "$3.5k": short enough to sit above a bar. */
const short = (c: number) => (c >= 100_000 ? `$${(c / 100_000).toFixed(1).replace(/\.0$/, "")}k` : `$${Math.round(c / 100)}`);

/**
 * Slice and dice. Everything filters everything: tap a group, a category or a bar.
 * Monthly or by pay period; 6 or 12 of them.
 */
export function ReportsView({
  byMonth,
  byPeriod,
  groupOf,
  items,
}: {
  byMonth: SpendingReport;
  byPeriod: SpendingReport;
  groupOf: Record<string, CategoryGroup>;
  items: Record<string, CategoryItem[]>;
}) {
  const hide = useHideAmounts();
  const [by, setBy] = useState<"month" | "period">("month");
  const [range, setRange] = useState<6 | 12>(6);
  const [focus, setFocus] = useState<"all" | CategoryGroup>("all");
  const [cat, setCat] = useState<string | null>(null);
  const [pick, setPick] = useState<string | null>(null); // a period's start date
  const source = by === "month" ? byMonth : byPeriod;
  const data = source.slice(-range);
  const full = data.filter((m) => !m.current);
  const picked = data.find((m) => m.month === pick) ?? null;
  const inGroup = (c: string) => focus === "all" || groupOf[c] === focus;

  // Chart: one category, one group, or everything stacked by group.
  const series = (m: SpendingReport[number]): Array<{ key: string; cents: number; cls: string }> => {
    if (cat) return [{ key: cat, cents: m.categories[cat] ?? 0, cls: COLOR[groupOf[cat] ?? "wants"] }];
    if (focus === "all") return GROUPS.map((g) => ({ key: g.id, cents: m.groups[g.id], cls: COLOR[g.id] }));
    return [{ key: focus, cents: m.groups[focus], cls: COLOR[focus] }];
  };
  const totals = data.map((m) => series(m).reduce((t, x) => t + x.cents, 0));
  const max = Math.max(1, ...totals);
  const avgTotal = full.length ? full.reduce((t, m) => t + series(m).reduce((a, x) => a + x.cents, 0), 0) / full.length : 0;

  // Categories: amounts for the picked period (or the latest), against the average.
  const rows = useMemo(() => {
    const names = new Set<string>();
    for (const m of data) for (const c of Object.keys(m.categories)) if (inGroup(c)) names.add(c);
    const target = picked ?? data[data.length - 1]!;
    return [...names]
      .map((c) => {
        const avg = full.length ? Math.round(full.reduce((t, m) => t + (m.categories[c] ?? 0), 0) / full.length) : 0;
        return { c, avg, now: target.categories[c] ?? 0, total: data.reduce((t, m) => t + (m.categories[c] ?? 0), 0) };
      })
      .sort((a, b) => b.now - a.now || b.total - a.total);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, full, focus, groupOf, picked]);

  // Transactions for the selected category, in the picked period or across the range.
  const txns = useMemo(() => {
    if (!cat) return [];
    const from = picked?.month ?? data[0]!.month;
    const to = picked?.end ?? data[data.length - 1]!.end;
    return (items[cat] ?? []).filter((i) => i.date >= from && i.date <= to);
  }, [cat, picked, data, items]);

  const title = cat ? cat : focus === "all" ? "Spending by group" : GROUPS.find((g) => g.id === focus)!.label;
  const periodName = (m: SpendingReport[number]) => (by === "month" ? `${m.label} ${m.month.slice(0, 4)}` : m.label);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
      <section className="card p-4 sm:p-5" aria-labelledby="rep-title">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="rep-title" className="text-base font-bold text-ink">{title}</h2>
          {(cat || pick || focus !== "all") && (
            <button type="button" className="text-xs font-medium text-brand" onClick={() => { setCat(null); setPick(null); setFocus("all"); }}>Clear filters</button>
          )}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="flex rounded-lg border border-line p-0.5" role="group" aria-label="Group by">
            <button type="button" className={seg(by === "month")} aria-pressed={by === "month"} onClick={() => { setBy("month"); setPick(null); }}>Monthly</button>
            <button type="button" className={seg(by === "period")} aria-pressed={by === "period"} onClick={() => { setBy("period"); setPick(null); }} disabled={byPeriod.length === 0}>Pay period</button>
          </div>
          <div className="flex rounded-lg border border-line p-0.5" role="group" aria-label="How many">
            <button type="button" className={seg(range === 6)} aria-pressed={range === 6} onClick={() => { setRange(6); setPick(null); }}>Last 6</button>
            <button type="button" className={seg(range === 12)} aria-pressed={range === 12} onClick={() => { setRange(12); setPick(null); }}>Last 12</button>
          </div>
        </div>
        <div className="mt-2 flex rounded-lg border border-line p-0.5" role="group" aria-label="Group">
          <button type="button" className={seg(focus === "all")} aria-pressed={focus === "all"} onClick={() => { setFocus("all"); setCat(null); }}>All</button>
          {GROUPS.map((g) => (
            <button key={g.id} type="button" className={seg(focus === g.id)} aria-pressed={focus === g.id} onClick={() => { setFocus(g.id); setCat(null); }}>{g.label}</button>
          ))}
        </div>

        <div className="relative mt-4">
          {avgTotal > 0 && (
            <span className="pointer-events-none absolute inset-x-0 z-10 border-t border-dashed border-faint" style={{ bottom: `calc(1.5rem + ${(avgTotal / max) * 10}rem)` }} aria-hidden>
              <span className="absolute -top-4 right-0 rounded bg-surface px-1 text-[10px] text-faint">avg {hide ? "" : short(Math.round(avgTotal))}</span>
            </span>
          )}
          <ol className="grid items-end gap-1" style={{ gridTemplateColumns: `repeat(${data.length}, minmax(0, 1fr))` }} aria-label="Spending by period. Tap a bar to see that period.">
            {data.map((m, i) => {
              const parts = series(m);
              const selected = pick === m.month;
              const dim = pick != null && !selected;
              return (
                <li key={m.month} className="flex min-w-0 flex-col items-center">
                  <button
                    type="button"
                    onClick={() => setPick(selected ? null : m.month)}
                    aria-pressed={selected}
                    aria-label={`${periodName(m)}: ${hide ? "hidden" : short(totals[i]!)}`}
                    className={`flex w-full flex-col items-center rounded-md transition ${selected ? "bg-surface-3" : ""}`}
                  >
                    <span className={`mb-0.5 h-3.5 truncate text-[9px] tabular sm:text-[10px] ${dim ? "text-faint/50" : "text-muted"}`}>{hide || !totals[i] || (data.length > 8 && !selected) ? "" : short(totals[i]!)}</span>
                    <span className={`flex h-40 w-full max-w-9 flex-col overflow-hidden rounded-t transition ${m.current ? "opacity-70" : ""} ${dim ? "opacity-30" : ""}`}>
                      <span className="flex-1" />
                      {[...parts].reverse().map((x) => <span key={x.key} className={`shrink-0 ${x.cls}`} style={{ height: `${(x.cents / max) * 100}%` }} />)}
                    </span>
                  </button>
                  <span className={`mt-1 h-5 w-full truncate text-center text-[9px] sm:text-[10px] ${selected || (m.current && !pick) ? "font-semibold text-ink" : "text-faint"}`}>
                    {by === "month" ? m.label : `${Number(m.month.slice(5, 7))}/${Number(m.month.slice(8))}`}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
        <p className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-muted">
          {!cat && focus === "all" && GROUPS.map((g) => <span key={g.id}><span className={`mr-1 inline-block h-2 w-2 rounded-full ${COLOR[g.id]}`} />{g.label}</span>)}
          <span>Tap a bar to see that {by === "month" ? "month" : "pay period"}{data.length > 8 ? " and its total" : ""}.</span>
        </p>
      </section>

      <section className="card p-4 sm:p-5" aria-labelledby="cats-title">
        <div className="flex items-baseline justify-between gap-2">
          <h2 id="cats-title" className="text-base font-bold text-ink">Categories</h2>
          <span className="text-xs text-muted">{picked ? periodName(picked) : by === "month" ? "This month so far" : "This pay period so far"} vs avg</span>
        </div>
        <ul className="mt-2 divide-y divide-line">
          {rows.map((r) => {
            const pace = r.avg ? r.now / r.avg : 0;
            const active = cat === r.c;
            const dim = cat != null && !active;
            return (
              <li key={r.c} className={`transition ${dim ? "opacity-40" : ""}`}>
                <button type="button" onClick={() => setCat(active ? null : r.c)} aria-pressed={active} className={`flex w-full items-center gap-3 rounded-lg px-1 py-2 text-left ${active ? "bg-brand/10 ring-1 ring-brand" : ""}`}>
                  <Glyph name={r.c} size="md" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink">{r.c}</span>
                    <span className="block text-[11px] text-muted">{GROUPS.find((g) => g.id === (groupOf[r.c] ?? "wants"))!.label} · avg <Money cents={r.avg} whole />/{by === "month" ? "mo" : "period"}</span>
                  </span>
                  <span className="text-right text-sm tabular">
                    <Money cents={r.now} whole className="font-semibold text-ink" />
                    {r.avg > 0 && <span className={`block text-[11px] ${pace > 1.1 ? "text-warn" : "text-muted"}`}>{Math.round(pace * 100)}% of avg</span>}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {cat && (
        <section className="card p-4 sm:p-5" aria-labelledby="txn-title">
          <div className="flex items-baseline justify-between gap-2">
            <h2 id="txn-title" className="text-base font-bold text-ink"><Glyph name={cat} size="xs" /> {cat} transactions</h2>
            <span className="text-xs text-muted">{picked ? periodName(picked) : `last ${range} ${by === "month" ? "months" : "pay periods"}`}</span>
          </div>
          {txns.length === 0 ? (
            <p className="mt-2 text-sm text-muted">Nothing in this period.</p>
          ) : (
            <ul className="mt-2 divide-y divide-line">
              {txns.map((i, k) => (
                <li key={`${i.date}-${k}`} className="flex items-center justify-between gap-2 py-1.5 text-sm">
                  <span className="min-w-0">
                    <span className="block truncate text-ink">{i.label}</span>
                    <span className="block text-[11px] text-muted">{formatLong(i.date)} · {i.account}{i.repeating ? " · repeating" : ""}{i.pending ? " · pending" : ""}</span>
                  </span>
                  <Money cents={-i.cents} sign tone="auto" className="shrink-0 tabular" />
                </li>
              ))}
              <li className="flex justify-between pt-2 text-sm font-semibold text-ink">
                <span>Total</span>
                <Money cents={txns.reduce((t, i) => t + i.cents, 0)} />
              </li>
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
