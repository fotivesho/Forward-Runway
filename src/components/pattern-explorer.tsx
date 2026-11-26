"use client";

import { useMemo, useState } from "react";
import { formatShort } from "@/lib/dates";
import {
  categoryList,
  DOW_SHORT,
  monthTotals,
  paydayCurve,
  profileCategory,
  profileMonth,
  profileWeekday,
  weekdayTotals,
  type ExploreData,
} from "@/lib/view/explore";
import { Glyph } from "./icon";
import { Info } from "./info";
import { Money } from "./privacy";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const mon = (m: string) => MONTHS[Number(m.slice(5, 7)) - 1]!;
type Lens = "category" | "day" | "month" | "payday";

/** Tappable bars: the selected one is solid, the rest soft. */
function Bars({ items, selected, onSelect, height = 72, tone = "bg-brand" }: { items: Array<{ key: string; label: string; cents: number; hint?: string }>; selected?: string | null; onSelect?: (k: string) => void; height?: number; tone?: string }) {
  const max = Math.max(1, ...items.map((i) => i.cents));
  return (
    <div className="grid items-end gap-1.5" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
      {items.map((i) => {
        const on = selected === i.key;
        const Tag = onSelect ? "button" : "div";
        return (
          <Tag key={i.key} {...(onSelect ? { type: "button" as const, onClick: () => onSelect(i.key), "aria-pressed": on } : {})} className="flex min-w-0 flex-col items-center gap-1">
            <span className={`text-[10px] tabular ${on ? "font-bold text-ink" : "text-faint"}`}>${Math.round(i.cents / 100).toLocaleString("en-US")}</span>
            <span className={`w-full rounded-md transition-all ${on ? tone : `${tone} opacity-35`}`} style={{ height: `${Math.max(4, (i.cents / max) * height)}px` }} />
            <span className={`truncate text-[10px] ${on ? "font-bold text-ink" : "text-muted"}`}>{i.label}</span>
          </Tag>
        );
      })}
    </div>
  );
}

function Stat({ label, children, sub }: { label: string; children: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-2xl bg-surface-2/60 p-2.5">
      <p className="truncate text-[10px] font-bold uppercase tracking-wide text-faint">{label}</p>
      <p className="font-num truncate text-lg text-display">{children}</p>
      {sub && <p className="truncate text-[10px] text-faint">{sub}</p>}
    </div>
  );
}

/** "Ahead" line: always end on what's next. */
function Ahead({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-3 flex items-start gap-2 rounded-2xl bg-brand/10 px-3 py-2.5 text-sm text-ink">
      <span aria-hidden className="mt-0.5 text-brand">→</span>
      <span>{children}</span>
    </p>
  );
}

/**
 * Explore your spending from four angles (what, which day, which month, when after payday). Each
 * starts wide, lets you tap into one thing, and always ends on what it means for the weeks ahead.
 */
export function PatternExplorer({ data, compact = false }: { data: ExploreData; compact?: boolean }) {
  const [lens, setLens] = useState<Lens>("category");
  const cats = useMemo(() => categoryList(data), [data]);
  const [cat, setCat] = useState<string | null>(cats[0]?.cat ?? null);
  const week = useMemo(() => weekdayTotals(data), [data]);
  const [dow, setDow] = useState<number>(() => week.indexOf(Math.max(...week)));
  const months = useMemo(() => monthTotals(data), [data]);
  const [month, setMonth] = useState<string>(() => (months.filter((m) => !m.current).at(-1) ?? months.at(-1))!.month);
  const curve = useMemo(() => paydayCurve(data), [data]);

  const cp = useMemo(() => (cat ? profileCategory(data, cat) : null), [data, cat]);
  const wp = useMemo(() => profileWeekday(data, dow), [data, dow]);
  const mp = useMemo(() => profileMonth(data, month), [data, month]);

  if (!data.txns.length) return null;
  const tab = (id: Lens, label: string) => (
    <button key={id} type="button" onClick={() => setLens(id)} aria-pressed={lens === id}
      className={`min-h-9 flex-1 rounded-full text-xs font-bold transition ${lens === id ? "bg-brand text-brand-ink shadow" : "text-muted hover:text-ink"}`}>
      {label}
    </button>
  );

  return (
    <section className="card p-4 sm:p-5" aria-labelledby="explore-title">
      <h2 id="explore-title" className="text-base font-bold text-ink">
        Explore
        <Info label="Explore your spending">
          Look at your spending from four angles. <strong className="font-semibold">What</strong>: each category, like dining or shopping. <strong className="font-semibold">Day</strong>: which days of the week cost the most. <strong className="font-semibold">Month</strong>: how each month compares to a normal one. <strong className="font-semibold">Payday</strong>: how spending changes in the days after you get paid. Tap anything to zoom in. Each view ends with what it means for the weeks ahead.
        </Info>
      </h2>
      <div role="group" aria-label="Explore by" className="mt-3 flex gap-1 rounded-full bg-surface-2 p-1">
        {tab("category", "What")}
        {tab("day", "Day")}
        {tab("month", "Month")}
        {curve && tab("payday", "Payday")}
      </div>

      {lens === "category" && (
        <div className="mt-4">
          <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
            {cats.map((c) => (
              <button key={c.cat} type="button" onClick={() => setCat(c.cat)} aria-pressed={cat === c.cat}
                className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition ${cat === c.cat ? "bg-ink text-bg" : "bg-surface-2 text-muted hover:text-ink"}`}>
                <Glyph name={c.cat} size="xs" bare /> {c.cat}
              </button>
            ))}
          </div>
          {cp && (
            <div className="fade-up mt-3" key={cp.cat}>
              <p className="flex items-baseline gap-2">
                <Money cents={cp.perWeekCents} whole className="font-num text-3xl text-display" />
                <span className="text-sm text-muted">a week on {cp.cat.toLowerCase()}</span>
              </p>
              <div className="mt-3 grid grid-cols-3 gap-2">
                <Stat label="Each time" sub={<>usually <Money cents={cp.lowCents} whole />–<Money cents={cp.highCents} whole /></>}><Money cents={cp.avgCents} whole /></Stat>
                <Stat label="How often" sub="times a week">{cp.perWeek >= 0.95 ? cp.perWeek.toFixed(1).replace(/\.0$/, "") : `${Math.max(1, Math.round(cp.perWeek * 4.3))}/mo`}</Stat>
                <Stat label="Trend" sub="last 3 months">
                  {cp.trendPct == null ? "—" : <span className={cp.trendPct > 0.1 ? "text-warn" : cp.trendPct < -0.1 ? "text-brand" : ""}>{cp.trendPct > 0 ? "↑" : cp.trendPct < 0 ? "↓" : ""}{Math.abs(Math.round(cp.trendPct * 100))}%</span>}
                </Stat>
              </div>
              {!compact && (<>
              <p className="mt-4 text-xs font-bold text-ink">Month by month</p>
              <div className="mt-1.5">
                <Bars items={cp.months.map((m) => ({ key: m.month, label: m.current ? `${mon(m.month)}*` : mon(m.month), cents: m.cents }))} selected={cp.months.at(-1)!.month} height={56} />
              </div>
              </>)}
              {!compact && (<>
              <p className="mt-4 text-xs font-bold text-ink">
                By day of week{cp.busiestDow != null && <span className="font-normal text-muted"> · most on {DOW_SHORT[cp.busiestDow]}</span>}
              </p>
              <div className="mt-1.5">
                <Bars items={cp.weekday.map((c, i) => ({ key: String(i), label: DOW_SHORT[i]!, cents: c }))} selected={cp.busiestDow != null ? String(cp.busiestDow) : null} height={44} tone="bg-info" />
              </div>
              {cp.paydayShare != null && cp.paydayShare > 0.32 && (
                <p className="mt-3 text-xs text-muted">
                  <span className="font-semibold text-warn">{Math.round(cp.paydayShare * 100)}%</span> of it happens in the 3 days after payday.
                </p>
              )}
              {cp.top.length > 0 && (
                <p className="mt-2 text-xs text-muted">Most often: {cp.top.map((t) => `${t.desc} (${t.n}×)`).join(" · ")}</p>
              )}
              </>)}
              <Ahead>
                At your usual pace, about <Money cents={cp.next30Cents} whole className="font-bold" /> on {cp.cat.toLowerCase()} in the next 30 days.
                {cp.oneLessPerMonthCents > 0 && <> One fewer a week frees up about <Money cents={cp.oneLessPerMonthCents} whole className="font-bold text-brand" /> a month.</>}
              </Ahead>
            </div>
          )}
        </div>
      )}

      {lens === "day" && (
        <div className="mt-4">
          <Bars items={week.map((c, i) => ({ key: String(i), label: DOW_SHORT[i]!, cents: c }))} selected={String(dow)} onSelect={(k) => setDow(Number(k))} />
          <div className="fade-up mt-4" key={dow}>
            <p className="flex items-baseline gap-2">
              <Money cents={wp.avgCents} whole className="font-num text-3xl text-display" />
              <span className="text-sm text-muted">on a usual {wp.name}</span>
            </p>
            <p className="mt-0.5 text-sm">
              <span className={`font-semibold ${wp.ratio >= 1.2 ? "text-warn" : wp.ratio <= 0.8 ? "text-brand" : "text-muted"}`}>
                {wp.ratio >= 1.05 ? `${wp.ratio.toFixed(1)}× an average day` : wp.ratio <= 0.95 ? `${Math.round((1 - wp.ratio) * 100)}% below an average day` : "about an average day"}
              </span>
            </p>
            <ul className="mt-3 space-y-2">
              {wp.cats.map((c) => (
                <li key={c.cat} className="text-sm">
                  <span className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-ink"><Glyph name={c.cat} size="xs" />{c.cat}</span>
                    <span className="text-xs font-semibold text-muted">{Math.round(c.share * 100)}%</span>
                  </span>
                  <span className="mt-1 block h-1.5 rounded-full bg-surface-3"><span className="block h-1.5 rounded-full bg-info" style={{ width: `${c.share * 100}%` }} /></span>
                </li>
              ))}
            </ul>
            <Ahead>
              Your next four {wp.name}s will likely cost about <Money cents={wp.next4Cents} whole className="font-bold" />. Your daily caps already give them that room.
            </Ahead>
          </div>
        </div>
      )}

      {lens === "month" && (
        <div className="mt-4">
          <Bars items={months.map((m) => ({ key: m.month, label: m.current ? `${mon(m.month)}*` : mon(m.month), cents: m.cents }))} selected={month} onSelect={setMonth} />
          <p className="mt-1 text-[10px] text-faint">* this month so far</p>
          <div className="fade-up mt-3" key={month}>
            <p className="flex flex-wrap items-baseline gap-x-2">
              <Money cents={mp.totalCents} whole className="font-num text-3xl text-display" />
              <span className="text-sm text-muted">in {mon(mp.month)}</span>
              {mp.typicalCents > 0 && (
                <span className={`text-sm font-semibold ${mp.totalCents > mp.typicalCents * 1.1 ? "text-warn" : mp.totalCents < mp.typicalCents * 0.9 ? "text-brand" : "text-muted"}`}>
                  {mp.totalCents >= mp.typicalCents ? "+" : "−"}<Money cents={Math.abs(mp.totalCents - mp.typicalCents)} whole /> vs a usual month
                </span>
              )}
            </p>
            <ul className="mt-3 space-y-1.5">
              {mp.cats.map((c) => {
                const diff = c.cents - c.typicalCents;
                return (
                  <li key={c.cat} className="flex items-center gap-2 text-sm">
                    <Glyph name={c.cat} size="xs" />
                    <span className="min-w-0 flex-1 truncate text-ink">{c.cat}</span>
                    <Money cents={c.cents} whole className="font-semibold tabular text-ink" />
                    {c.typicalCents > 0 && Math.abs(diff) > c.typicalCents * 0.15 && (
                      <span className={`w-16 text-right text-[11px] font-semibold ${diff > 0 ? "text-warn" : "text-brand"}`}>{diff > 0 ? "↑" : "↓"}<Money cents={Math.abs(diff)} whole /></span>
                    )}
                    {!(c.typicalCents > 0 && Math.abs(diff) > c.typicalCents * 0.15) && <span className="w-16" />}
                  </li>
                );
              })}
            </ul>
            {mp.bigDays.length > 0 && (
              <p className="mt-3 text-xs text-muted">Biggest days: {mp.bigDays.map((b) => `${formatShort(b.d)} ($${Math.round(b.cents / 100)}, ${b.what.toLowerCase()})`).join(" · ")}</p>
            )}
            <Ahead>
              A usual month runs about <Money cents={mp.typicalCents} whole className="font-bold" /> on everyday things. Your budget for next month starts from that, plus your plans.
            </Ahead>
          </div>
        </div>
      )}

      {lens === "payday" && curve && (
        <div className="mt-4">
          <p className="text-xs font-bold text-ink">Spending by day of the pay period</p>
          <div className="mt-2">
            <Bars items={curve.byDay.map((c, i) => ({ key: String(i), label: i === 0 ? "Pay" : `+${i}`, cents: c }))} selected="0" height={64} tone="bg-warn" />
          </div>
          <p className="mt-3 flex items-baseline gap-2">
            <span className="font-num text-3xl text-display">{Math.round(curve.firstThreeShare * 100)}%</span>
            <span className="text-sm text-muted">of each pay period&apos;s spending happens in the first 3 days</span>
          </p>
          {curve.skew.length > 0 && (
            <p className="mt-2 text-xs text-muted">
              Leans hardest toward payday: {curve.skew.map((s) => `${s.cat} (${Math.round(s.share * 100)}%)`).join(" · ")}
            </p>
          )}
          {curve.next && (
            <Ahead>
              Next payday is {formatShort(curve.next.date)}. The 3 days after it usually cost about <Money cents={curve.next.cents} whole className="font-bold" />. Deciding now what one payday treat will be makes the rest of that paycheck stretch further.
            </Ahead>
          )}
        </div>
      )}
    </section>
  );
}
