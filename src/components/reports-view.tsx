"use client";

import { useMemo, useState } from "react";
import { formatShort } from "@/lib/dates";
import { GROUPS, type CategoryItem, type SpendingReport } from "@/lib/view/budget";
import type { CategoryGroup } from "@/lib/data/snapshot";
import { Glyph } from "@/components/icon";
import { Info } from "./info";
import { Money, useHideAmounts } from "./privacy";
import { Modal } from "./modal";
import { AvgLine, shortMoney } from "./avg-line";
import { TrendingDown, TrendingUp, Minus } from "lucide-react";
import { useTxnDrill } from "./txn-drill";
import { CategoryEditButton } from "./category-editor";
import { MerchantDrill } from "./transaction-list";

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
        const avg = avgSince(full, c);
        return { c, avg, now: target.categories[c] ?? 0, total: data.reduce((t, m) => t + (m.categories[c] ?? 0), 0) };
      })
      .sort((a, b) => b.now - a.now || b.total - a.total);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, full, focus, groupOf, picked]);

  const title = focus === "all" ? "Spending by group" : GROUPS.find((g) => g.id === focus)!.label;
  const periodName = (m: SpendingReport[number]) => (by === "month" ? `${m.label} ${m.month.slice(0, 4)}` : m.label);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <section className="card p-4 sm:p-5" aria-labelledby="rep-title">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="rep-title" className="text-base font-bold text-ink">{title}</h2>
          {(pick || focus !== "all") && (
            <button type="button" className="text-xs font-medium text-brand" onClick={() => { setPick(null); setFocus("all"); }}>Clear filters</button>
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
          {avgTotal > 0 && <AvgLine bottom={`calc(1.5rem + ${(avgTotal / max) * 10}rem)`} label={`avg ${hide ? "" : short(Math.round(avgTotal))}`} />}
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
          {focus === "all" && GROUPS.map((g) => <span key={g.id}><span className={`mr-1 inline-block h-2 w-2 rounded-full ${COLOR[g.id]}`} />{g.label}</span>)}
          <Info label="Reading the chart">Each bar is one {by === "month" ? "month" : "pay period"}, split into needs, wants and savings. Tap a bar to see that {by === "month" ? "month" : "pay period"}'s categories below. The dashed line is your average.</Info>
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
            return (
              <li key={r.c}>
                <button type="button" onClick={() => setCat(r.c)} aria-haspopup="dialog" className="flex w-full items-center gap-3 rounded-lg px-1 py-2 text-left transition hover:bg-surface-2/60">
                  <Glyph name={r.c} size="md" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink">{r.c}</span>
                    <span className="block text-[11px] text-muted">{GROUPS.find((g) => g.id === (groupOf[r.c] ?? "wants"))!.label} · avg <Money cents={r.avg} whole />/{by === "month" ? "mo" : "period"}</span>
                  </span>
                  <span className="text-right text-sm tabular">
                    <Money cents={r.now} whole className="font-semibold text-ink" />
                    {r.avg > 0 && <span className={`block text-[11px] ${pace > 1.1 ? "text-warn" : "text-muted"}`}>{Math.round(pace * 100)}% of avg</span>}
                  </span>
                  <span aria-hidden className="text-faint">›</span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {cat && (
        <Modal open onClose={() => setCat(null)} icon={cat} title={cat} action={<CategoryEditButton name={cat} onChanged={() => setCat(null)} />} subtitle={<>{GROUPS.find((g) => g.id === (groupOf[cat] ?? "wants"))!.label} · last {range} {by === "month" ? "months" : "pay periods"}</>}>
          <CategoryReport cat={cat} data={data} items={items[cat] ?? []} by={by} periodName={periodName} />
        </Modal>
      )}
    </div>
  );
}

/** A category's average, counted only from the first period it showed up (earlier ones are before your history). */
function avgSince(periods: SpendingReport, c: string): number {
  const first = periods.findIndex((m) => (m.categories[c] ?? 0) > 0);
  if (first < 0) return 0;
  const list = periods.slice(first);
  return Math.round(list.reduce((t, m) => t + (m.categories[c] ?? 0), 0) / list.length);
}

/**
 * One category, up close: how it's trending, a bar for each period with the average as a dotted
 * line, and its transactions below. Tap a bar to list just that period.
 */
export const monthPeriodName = (m: SpendingReport[number]) => `${m.label} ${m.month.slice(0, 4)}`;

export function CategoryReport({ cat, data, items, by = "month", periodName = monthPeriodName, children }: { cat: string; data: SpendingReport; items: CategoryItem[]; by?: "month" | "period"; periodName?: (m: SpendingReport[number]) => string; children?: React.ReactNode }) {
  const hide = useHideAmounts();
  const [pick, setPick] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  const drillCtx = useTxnDrill();
  const [drill, setDrill] = useState<string | null>(null);
  const full = data.filter((m) => !m.current);
  const avg = avgSince(full, cat);
  const vals = data.map((m) => m.categories[cat] ?? 0);
  const first = vals.findIndex((v) => v > 0);
  const shown = first < 0 ? data : data.slice(Math.min(first, Math.max(0, data.length - 3)));
  const max = Math.max(1, avg, ...shown.map((m) => m.categories[cat] ?? 0));
  const now = data[data.length - 1]!;
  const nowCents = now.categories[cat] ?? 0;
  // Trend: the last three finished periods against the three before.
  const doneP = full.slice(Math.max(0, first));
  const done = doneP.map((m) => m.categories[cat] ?? 0);
  const recent = done.slice(-3);
  const before = done.slice(-6, -3);
  const nameOf = (m: SpendingReport[number]) => (by === "month" ? m.label : `${Number(m.month.slice(5, 7))}/${Number(m.month.slice(8))}`);
  const spanOf = (ps: SpendingReport) => (ps.length ? (ps.length === 1 ? nameOf(ps[0]!) : `${nameOf(ps[0]!)}–${nameOf(ps[ps.length - 1]!)}`) : "");
  const trendLabel = `${spanOf(doneP.slice(-3))} vs ${spanOf(doneP.slice(-6, -3))}`;
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  const trend = recent.length >= 2 && before.length >= 2 && mean(before) > 0 ? Math.round(((mean(recent) - mean(before)) / mean(before)) * 100) : null;
  const top = shown.reduce((m, x) => ((x.categories[cat] ?? 0) > (m.categories[cat] ?? 0) ? x : m), shown[0]!);
  const unit = by === "month" ? "month" : "pay period";
  const picked = data.find((m) => m.month === pick) ?? null;
  const from = picked?.month ?? shown[0]!.month;
  const to = picked?.end ?? now.end;
  const list = items.filter((i) => i.date >= from && i.date <= to);
  const rows = all ? list : list.slice(0, 8);
  const total = list.reduce((t, i) => t + i.cents, 0);
  const year = now.end.slice(0, 4);
  const yearCents = items.filter((i) => i.date.startsWith(year)).reduce((t, i) => t + i.cents, 0);
  const pace = avg ? nowCents / avg : 0;
  const TrendIcon = trend == null || Math.abs(trend) < 10 ? Minus : trend > 0 ? TrendingUp : TrendingDown;
  const trendTone = trend == null || Math.abs(trend) < 10 ? "text-muted" : trend > 0 ? "text-warn" : "text-brand";

  // A level deeper: one name's history, with a way back to the category.
  if (drill) return <MerchantDrill txnId={drill} onBack={() => setDrill(null)} />;
  return (
    <div className="space-y-4">
      <ul className="grid grid-cols-3 gap-2 text-center">
        <li className="rounded-xl bg-surface-2/60 px-1 py-2">
          <span className="block text-[11px] text-faint">This {unit}</span>
          <span className={`block font-num text-lg leading-tight ${pace > 1.1 ? "text-warn" : "text-display"}`}><Money cents={nowCents} whole /></span>
          <span className="block text-[10px] text-faint">{avg ? `${Math.round(pace * 100)}% of avg` : "so far"}</span>
        </li>
        <li className="rounded-xl bg-surface-2/60 px-1 py-2">
          <span className="block text-[11px] text-faint">Average</span>
          <span className="block font-num text-lg leading-tight text-display"><Money cents={avg} whole /></span>
          <span className="block text-[10px] text-faint">a {unit}</span>
        </li>
        <li className="rounded-xl bg-surface-2/60 px-1 py-2">
          <span className="block text-[11px] text-faint">Trend</span>
          <span className={`flex items-center justify-center gap-1 font-num text-lg leading-tight ${trendTone}`}>
            <TrendIcon size={16} strokeWidth={2.4} aria-hidden />{trend == null ? "—" : Math.abs(trend) < 10 ? "Steady" : trend >= 200 ? `${Math.round(trend / 100 + 1)}×` : `${Math.abs(trend)}%`}
          </span>
          <span className="block text-[10px] text-faint">{trend == null ? "needs 4+ months" : trendLabel}</span>
        </li>
      </ul>
      {(trend != null || top) && (
        <p className="text-xs text-muted">
          {trend != null && (Math.abs(trend) < 10 ? `Holding steady (${trendLabel}). ` : trend >= 200 ? `Way up: ${Math.round(trend / 100 + 1)}× as much in ${spanOf(doneP.slice(-3))} as in ${spanOf(doneP.slice(-6, -3))}. ` : trend > 0 ? `Climbing: up ${trend}% in ${spanOf(doneP.slice(-3))} vs ${spanOf(doneP.slice(-6, -3))}. ` : `Easing off: down ${Math.abs(trend)}% in ${spanOf(doneP.slice(-3))} vs ${spanOf(doneP.slice(-6, -3))}. `)}
          {top && (top.categories[cat] ?? 0) > avg * 1.3 && <>Highest was {periodName(top)} at <Money cents={top.categories[cat] ?? 0} whole />.</>}
        </p>
      )}

      {children}
      <div className="relative pt-2">
        {avg > 0 && <AvgLine bottom={`calc(1.5rem + ${(avg / max) * 8}rem)`} label={`avg ${hide ? "" : shortMoney(avg)}`} />}
        <ol className="grid items-end gap-1.5" style={{ gridTemplateColumns: `repeat(${shown.length}, minmax(0, 1fr))` }} aria-label={`${cat} by ${unit}. Tap a bar to list it.`}>
          {shown.map((m) => {
            const v = m.categories[cat] ?? 0;
            const on = pick === m.month;
            const dim = pick != null && !on;
            return (
              <li key={m.month}>
                <button type="button" onClick={() => setPick(on ? null : m.month)} aria-pressed={on} aria-label={`${periodName(m)}: ${hide ? "hidden" : shortMoney(v)}`} className="flex w-full flex-col items-center">
                  <span className="flex h-32 w-full items-end justify-center">
                    <span className={`w-full max-w-[22px] rounded-full transition ${m.current ? "opacity-60" : ""} ${dim ? "opacity-25" : ""}`} style={{ height: `${Math.max(v ? 4 : 0, (v / max) * 100)}%`, background: `linear-gradient(to top, color-mix(in srgb, var(${v > avg * 1.1 && avg > 0 ? "--color-warn" : "--color-brand"}) 50%, transparent), var(${v > avg * 1.1 && avg > 0 ? "--color-warn" : "--color-brand"}))`, boxShadow: on ? "0 0 12px -2px var(--color-brand)" : undefined }} />
                  </span>
                  <span className={`mt-1 h-4 text-[10px] ${on ? "font-bold text-ink" : "text-faint"}`}>{by === "month" ? m.label : `${Number(m.month.slice(5, 7))}/${Number(m.month.slice(8))}`}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>
      <p className="-mt-2 text-[11px] text-faint">Amber = above average · faded = still going · tap a bar to list it</p>

      <div>
        <div className="mb-1 flex items-baseline justify-between gap-2">
          {picked ? (
            <p className="text-sm font-bold text-ink">{periodName(picked)} <Money cents={total} whole className="ml-1 font-semibold" /></p>
          ) : (
            <p className="text-sm text-muted">{year} so far <Money cents={yearCents} whole className="ml-1 font-num text-base text-ink" /></p>
          )}
          {picked && <button type="button" onClick={() => setPick(null)} className="text-xs font-semibold text-brand">Show all</button>}
        </div>
        {list.length === 0 ? (
          <p className="text-sm text-muted">Nothing here.</p>
        ) : (
          <div className="space-y-3">
            {monthsIn(rows).map((key) => {
              const these = rows.filter((i) => i.date.startsWith(key));
              const all = list.filter((i) => i.date.startsWith(key));
              return (
                <section key={key}>
                  <div className="sticky top-0 z-10 -mx-1 mb-1 flex items-baseline justify-between bg-surface/95 px-1 py-1.5 backdrop-blur">
                    <span className="text-xs font-bold text-ink">{monthYear(key)}</span>
                    <Money cents={all.reduce((t, i) => t + i.cents, 0)} whole className="text-xs font-semibold text-ink" />
                  </div>
                  <ul className="divide-y divide-line rounded-xl border border-line">
            {these.map((i, k) => {
              const body = (
                <>
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-ink">{i.label}</span>
                    <span className="block text-[11px] text-muted">{formatShort(i.date)} · {i.account}{i.repeating ? " · repeating" : ""}{i.pending ? " · pending" : ""}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    <Money cents={-i.cents} sign tone="auto" className="font-semibold" />
                    {i.txnId && drillCtx && <span aria-hidden className="text-faint">›</span>}
                  </span>
                </>
              );
              return (
                <li key={`${i.date}-${k}`}>
                  {i.txnId && drillCtx ? (
                    <button type="button" onClick={() => setDrill(i.txnId!)} className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition hover:bg-surface-2/60">{body}</button>
                  ) : (
                    <div className="flex items-center justify-between gap-2 px-3 py-2 text-sm">{body}</div>
                  )}
                </li>
              );
            })}
                  </ul>
                </section>
              );
            })}
          </div>
        )}
        {list.length > 8 && (
          <button type="button" onClick={() => setAll((x) => !x)} className="mt-1.5 text-xs font-semibold text-brand">{all ? "Show fewer" : `Show all ${list.length}`}</button>
        )}
      </div>
    </div>
  );
}

/** The months a list covers, newest first ("2026-11"). */
function monthsIn(items: CategoryItem[]): string[] {
  return [...new Set(items.map((i) => i.date.slice(0, 7)))].sort((a, b) => (a < b ? 1 : -1));
}
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const monthYear = (key: string) => `${MONTH_NAMES[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`;
