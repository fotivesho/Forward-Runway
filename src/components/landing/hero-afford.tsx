"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { formatCents } from "@/lib/money";
import { addDays, dayOfWeek, formatShort, type ISODate } from "@/lib/dates";
import { checkAffordability, type AffordCheck, type PlannedEvent } from "@/lib/engine";
import { toEngineInput, type Snapshot } from "@/lib/data/snapshot";
import type { LandingData } from "@/lib/view/landing";
import { Glyph } from "@/components/icon";
import { explain } from "../afford-result";
import { useCountUp } from "./motion";

const OPTIONS = [
  { label: "Concert", cents: 18_000, icon: "🎟️" },
  { label: "Weekend away", cents: 65_000, icon: "🏕️" },
  { label: "Laptop", cents: 240_000, icon: "💻" },
];

// Fixed colors: this card is always cream, whatever the page theme.
const C = { ink: "#1f4531", body: "#1d3324", muted: "#4f6455", good: "#2e7346", warn: "#9a6a00", bad: "#b3261e", line: "#ddd3bb", soft: "#f3efe2" };
const TONE = { yes: C.good, yes_with_plan: C.warn, not_yet: C.bad } as const;
const WORD = { yes: "Yes. It fits.", yes_with_plan: "Yes, with a plan.", not_yet: "Not yet." } as const;
const SHORT = { yes: "Fits", yes_with_plan: "Plan", not_yet: "Not yet" } as const;
const OPTION_ICON: Record<string, string> = { move: "🛟", skip_plan: "✂️", lean: "🥗", wait: "⏳", goal: "🎯", cheaper: "🏷️", go: "income" };
const usd = (c: number) => (Math.abs(c) >= 100_000 ? formatCents(c, { compact: true }) : `${c < 0 ? "−" : ""}$${Math.round(Math.abs(c) / 100).toLocaleString("en-US")}`);

const W = 320;
const H = 80;

/** Before → after, with a bar. */
function Meter({ label, when, before, after, sub, tone }: { label: string; when: string; before: number; after: number; sub: string; tone: string }) {
  const pct = before > 0 ? Math.max(0, Math.min(100, (after / before) * 100)) : 0;
  return (
    <div className="min-w-0 rounded-2xl bg-white/70 p-3">
      <p className="text-[11px] font-bold" style={{ color: C.body }}>{label}</p>
      <p className="text-[10px]" style={{ color: C.muted }}>{when}</p>
      <p className="mt-1 flex items-baseline gap-1.5">
        <span className="font-num text-2xl" style={{ color: C.ink }}>{usd(after)}</span>
        {after !== before && <span className="text-xs line-through" style={{ color: C.muted }}>{usd(before)}</span>}
      </p>
      <div className="mt-1.5 h-1.5 rounded-full" style={{ background: C.line }}>
        <div className="h-1.5 rounded-full" style={{ width: `${pct}%`, background: tone }} />
      </div>
      <p className="mt-1 text-[11px] font-semibold" style={{ color: tone }}>{sub}</p>
    </div>
  );
}

/**
 * The first thing a visitor touches, and the product in miniature: pick something, and the real
 * engine answers with what it does to this pay period and your lowest balance, the ways to make it
 * work, the best day to buy, and debit vs credit. Sample money only.
 */
export function HeroAfford({
  hero,
  snapshot,
  today,
  events,
  calendarIncomplete,
}: {
  hero: LandingData["hero"];
  snapshot: Snapshot;
  today: ISODate;
  events: PlannedEvent[];
  calendarIncomplete: boolean;
}) {
  const ctx = useMemo(() => ({ input: toEngineInput(snapshot, today), events, calendarIncomplete, nextPayday: hero.nextPayday }), [snapshot, today, events, calendarIncomplete, hero.nextPayday]);
  const card = snapshot.accounts.find((a) => a.kind === "credit_card" && !a.archived) ?? null;
  const [pick, setPick] = useState<number | null>(null);
  const [date, setDate] = useState<ISODate>(today);
  const [credit, setCredit] = useState(false);
  const cents = pick == null ? 0 : OPTIONS[pick]!.cents;
  const run = (d: ISODate, cc: boolean) => checkAffordability(ctx, { amountCents: cents, date: d, paymentAccountId: cc && card ? card.id : null });
  const check: AffordCheck | null = useMemo(() => (pick == null ? null : run(date, credit)), [pick, date, credit, ctx]); // eslint-disable-line react-hooks/exhaustive-deps

  // Best day: the same purchase on the days that matter.
  const days = useMemo(() => {
    const sat = addDays(today, (6 - dayOfWeek(today) + 7) % 7 || 7);
    const list: Array<{ label: string; date: ISODate }> = [{ label: "Today", date: today }, { label: "Sat", date: sat }];
    if (hero.nextPayday) list.push({ label: "Payday", date: hero.nextPayday }, { label: "Next payday", date: addDays(hero.nextPayday, 14) });
    const seen = new Set<string>();
    return list.filter((d) => (seen.has(d.date) ? false : (seen.add(d.date), true))).sort((a, b) => (a.date < b.date ? -1 : 1));
  }, [today, hero.nextPayday]);
  const dayChecks = useMemo(() => (pick == null ? [] : days.map((d) => ({ ...d, c: run(d.date, credit) }))), [pick, days, credit, ctx]); // eslint-disable-line react-hooks/exhaustive-deps
  const payChecks = useMemo(() => (pick == null || !card ? [] : [false, true].map((cc) => ({ cc, c: run(date, cc) }))), [pick, date, card, ctx]); // eslint-disable-line react-hooks/exhaustive-deps
  const firstFit = dayChecks.find((d) => d.c.verdict === "yes");

  const safe = useCountUp(hero.safeTodayCents, true, 1400);

  // The 30-day line, and the same line with this purchase taken out when the cash leaves.
  const vals = hero.points.map((p) => p.cents);
  const after = check ? hero.points.map((p) => p.cents - (p.date >= check.cash.date ? cents : 0)) : null;
  const all = [...vals, ...(after ?? []), hero.floorCents];
  const min = Math.min(...all);
  const max = Math.max(...all);
  const pad = (max - min) * 0.1 || 1;
  const x = (i: number) => (i / (vals.length - 1)) * W;
  const y = (c: number) => H - ((c - (min - pad)) / (max + pad - (min - pad))) * H;
  const line = (cs: number[]) => cs.map((c, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(c).toFixed(1)}`).join("");

  const why = check ? explain(check).why : "";
  const options = check && check.verdict !== "yes" ? [check.action, ...check.alternatives].filter((o) => o.kind !== "none").slice(0, 3) : [];
  const r = check?.room;
  const cushion = check ? check.lowest.after.cents - check.floorCents : 0;

  return (
    <div className="glow relative mx-auto w-full max-w-md rounded-[2rem] border border-white/10 bg-[#fffcf4] p-5 shadow-2xl sm:p-6" style={{ color: C.body }} role="group" aria-label="Try it: can I afford it? Sample data">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold" style={{ color: C.muted }}>Safe to spend today</span>
        <span className="rounded-full bg-[#e4eedc] px-2 py-0.5 text-[11px] font-semibold" style={{ color: C.good }}>Sample</span>
      </div>
      <p className="font-num mt-1 text-6xl leading-none sm:text-7xl" style={{ color: C.ink }}>{formatCents(safe)}</p>
      <p className="mt-1.5 text-xs" style={{ color: C.muted }}>
        After every bill, card payment and plan until payday{hero.daysToPayday != null ? ` in ${hero.daysToPayday} days` : ""}.
      </p>

      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="mt-3 h-16 w-full overflow-visible" aria-hidden>
        <line x1="0" x2={W} y1={y(hero.floorCents)} y2={y(hero.floorCents)} stroke="#b8860b" strokeOpacity="0.5" strokeDasharray="2 5" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        <path d={`${line(after ?? vals)}L${W},${H}L0,${H}Z`} fill="#2e8a52" fillOpacity="0.08" />
        <path d={line(vals)} fill="none" stroke="#2e8a52" strokeOpacity={after ? 0.3 : 1} strokeWidth="1.75" vectorEffect="non-scaling-stroke" />
        {after && check && <path d={line(after)} fill="none" stroke={TONE[check.verdict]} strokeWidth="2" vectorEffect="non-scaling-stroke" />}
      </svg>

      <p className="mt-4 text-sm font-bold">Can I afford…</p>
      <div className="mt-2 grid grid-cols-3 gap-2">
        {OPTIONS.map((o, i) => (
          <button
            key={o.label}
            type="button"
            onClick={() => setPick(i)}
            aria-pressed={pick === i}
            className={`flex flex-col items-center gap-1 rounded-2xl border px-1 py-2.5 transition ${pick === i ? "border-[#2e7346] bg-[#2e7346] text-white shadow-lg" : "border-[#2e7346]/25 bg-[#eef3e6] hover:border-[#2e7346]"}`}
          >
            <Glyph name={o.icon} size="sm" />
            <span className="text-xs font-semibold">{o.label}</span>
            <span className="text-sm font-bold tabular">{usd(o.cents)}</span>
          </button>
        ))}
      </div>

      <div aria-live="polite">
        {check && r && (
          <div className="fade-up mt-4 space-y-4">
            {/* The answer, and why */}
            <div>
              <p className="font-display text-[1.7rem] leading-tight" style={{ color: TONE[check.verdict] }}>{WORD[check.verdict]}</p>
              <p className="text-sm" style={{ color: C.muted }}>{why}</p>
            </div>

            {/* What it does to your money */}
            <div className="grid grid-cols-2 gap-2">
              <Meter
                label="Spending money"
                when={`${formatShort(r.start)}–${formatShort(r.end)}`}
                before={r.before}
                after={Math.max(0, r.after)}
                tone={r.shortfall > 0 ? C.warn : C.good}
                sub={r.shortfall > 0 ? `${usd(r.shortfall)} short` : `${usd(r.after)} left`}
              />
              <Meter
                label="Lowest balance"
                when={formatShort(check.lowest.after.date)}
                before={check.lowest.before.cents}
                after={check.lowest.after.cents}
                tone={cushion < 0 ? C.bad : C.good}
                sub={cushion < 0 ? `${usd(-cushion)} under cushion` : `${usd(cushion)} above cushion`}
              />
            </div>

            {/* Ways to make it work */}
            {options.length > 0 && (
              <div>
                <p className="text-sm font-bold">Ways to make it work</p>
                <ul className="mt-2 space-y-1.5">
                  {options.map((o, i) => (
                    <li key={o.title} className="flex items-start gap-2.5 rounded-2xl border bg-white/70 px-3 py-2.5" style={{ borderColor: i === 0 ? C.warn : C.line }}>
                      <Glyph name={OPTION_ICON[o.kind] ?? "plan"} size="sm" />
                      <span className="min-w-0">
                        <span className="block text-sm font-bold leading-snug">{i === 0 && <span style={{ color: C.warn }}>★ </span>}{o.title.replace(/\.$/, "")}</span>
                        <span className="block text-xs leading-snug" style={{ color: C.muted }}>{o.detail}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Best day to buy */}
            {dayChecks.length > 1 && (
              <div>
                <p className="text-sm font-bold">Best day to buy</p>
                <div className="mt-2 grid gap-1.5" style={{ gridTemplateColumns: `repeat(${dayChecks.length}, minmax(0, 1fr))` }}>
                  {dayChecks.map((d) => (
                    <button
                      key={d.date}
                      type="button"
                      onClick={() => setDate(d.date)}
                      aria-pressed={date === d.date}
                      className="rounded-xl border bg-white/70 px-1 py-1.5 text-center transition"
                      style={{ borderColor: date === d.date ? C.body : C.line, boxShadow: date === d.date ? `0 0 0 1px ${C.body}` : undefined }}
                    >
                      <span className="block text-[10px]" style={{ color: C.muted }}>{d.label}</span>
                      <span className="block text-xs font-bold">{formatShort(d.date)}</span>
                      <span className="mt-0.5 flex items-center justify-center gap-1 text-[10px] font-bold" style={{ color: TONE[d.c.verdict] }}>
                        <span className="h-1.5 w-1.5 rounded-full" style={{ background: TONE[d.c.verdict] }} />
                        {SHORT[d.c.verdict]}
                      </span>
                    </button>
                  ))}
                </div>
                {firstFit && firstFit.date !== date && check.verdict !== "yes" && (
                  <p className="mt-1.5 text-xs font-semibold" style={{ color: C.good }}>Wait until {formatShort(firstFit.date)} and it simply fits.</p>
                )}
              </div>
            )}

            {/* Debit or credit */}
            {payChecks.length === 2 && card && (
              <div>
                <p className="text-sm font-bold">Debit or credit</p>
                <div className="mt-2 grid grid-cols-2 gap-1.5">
                  {payChecks.map(({ cc, c }) => (
                    <button
                      key={String(cc)}
                      type="button"
                      onClick={() => setCredit(cc)}
                      aria-pressed={credit === cc}
                      className="rounded-xl border bg-white/70 px-3 py-2 text-left transition"
                      style={{ borderColor: credit === cc ? C.body : C.line, boxShadow: credit === cc ? `0 0 0 1px ${C.body}` : undefined }}
                    >
                      <span className="flex items-center justify-between gap-1">
                        <span className="text-xs font-bold">{cc ? card.name.split(" ")[0] : "Debit"}</span>
                        <span className="flex items-center gap-1 text-[10px] font-bold" style={{ color: TONE[c.verdict] }}>
                          <span className="h-1.5 w-1.5 rounded-full" style={{ background: TONE[c.verdict] }} />
                          {SHORT[c.verdict]}
                        </span>
                      </span>
                      <span className="block text-[10px]" style={{ color: C.muted }}>cash leaves {formatShort(c.cash.date)}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <Link href="/demo" className="flex min-h-12 items-center justify-center rounded-full bg-[#182d26] px-5 text-base font-semibold text-[#ddefbf] shadow-lg ring-4 ring-[#2e7346]/20 transition hover:bg-[#2e7346] hover:text-white">
              Try it with your plans in the demo →
            </Link>
            <button type="button" onClick={() => { setPick(null); setDate(today); setCredit(false); }} className="block w-full text-center text-xs font-semibold underline" style={{ color: C.muted }}>
              Start over
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
