"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { formatCents } from "@/lib/money";
import { addDays, dayOfWeek, formatShort, type ISODate } from "@/lib/dates";
import { checkAffordability, previewOption, type AffordAction, type AffordCheck, type PlannedEvent } from "@/lib/engine";
import { toEngineInput, type Snapshot } from "@/lib/data/snapshot";
import type { LandingData } from "@/lib/view/landing";
import { Glyph } from "@/components/icon";
import { Info } from "@/components/info";
import { BillRoom } from "@/components/bill-room";
import { billNotes, explain } from "../afford-result";
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

/** Before → after, with a bar and a limit tick. */
function Meter({ label, when, before, after, limit, sub, tone }: { label: string; when: string; before: number; after: number; limit?: number; sub: string; tone: string }) {
  const scale = Math.max(1, before, after, limit ?? 0);
  return (
    <div className="min-w-0 rounded-2xl bg-white p-3 shadow-[0_1px_2px_rgba(31,69,49,0.06),0_8px_20px_-12px_rgba(31,69,49,0.25)]">
      <p className="text-[11px] font-bold" style={{ color: C.body }}>{label}</p>
      <p className="text-[10px]" style={{ color: C.muted }}>{when}</p>
      <p className="mt-1 flex items-baseline gap-1.5">
        <span className="font-num text-2xl" style={{ color: C.ink }}>{usd(after)}</span>
        {after !== before && <span className="text-xs line-through" style={{ color: C.muted }}>{usd(before)}</span>}
      </p>
      <div className="relative mt-1.5 h-1.5 rounded-full" style={{ background: "#ebe4d2" }}>
        <div className="h-1.5 rounded-full" style={{ width: `${Math.max(2, Math.min(100, (Math.max(0, after) / scale) * 100))}%`, background: tone }} />
        {limit != null && <span className="absolute -inset-y-1 w-0.5 rounded" style={{ left: `${Math.min(100, (limit / scale) * 100)}%`, background: C.body }} />}
      </div>
      <p className="mt-1 text-[11px] font-semibold leading-tight" style={{ color: tone }}>{sub}</p>
    </div>
  );
}

/** A thin ⓘ that opens a small bubble, colors fixed for the cream card. */
function InfoDot({ children, label }: { children: React.ReactNode; label: string }) {
  return <Info label={label} color={C.muted} className="ml-0.5">{children}</Info>;
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
  const [trying, setTrying] = useState<string | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  // After a pick, bring the whole card into view so the answer, numbers and options all fit.
  useEffect(() => {
    if (pick == null || !cardRef.current) return;
    const t = setTimeout(() => cardRef.current?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" }), 60);
    return () => clearTimeout(t);
  }, [pick]);
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

  // Say "credit card", not the card's name: this is about the idea, not one bank.
  // Tap an option: the same answer, with that option done.
  const base = check;
  const opts: AffordAction[] = base && base.verdict !== "yes" ? [base.action, ...base.alternatives].filter((o) => o.kind !== "none" && o.apply).slice(0, 3) : [];
  const tried = opts.find((o) => o.title === trying);
  const shown = base && tried ? (previewOption(ctx, { amountCents: cents, date, paymentAccountId: credit && card ? card.id : null }, tried) ?? base) : base;
  const why = shown ? explain(shown).why.replace(`${card?.name.split(" ")[0] ?? "Card"} bill`, "Credit card bill") : "";
  const r = shown?.room;
  const cushion = shown ? shown.lowest.after.cents - shown.floorCents : 0;
  const bill = shown?.card && !shown.cash.beyondHorizon ? shown.card : null;
  const VERDICT_BG = { yes: "linear-gradient(135deg,#2e7346,#1f5a37)", yes_with_plan: "linear-gradient(135deg,#a87708,#865d00)", not_yet: "linear-gradient(135deg,#c0392b,#8f1f17)" } as const;
  const VERDICT_ICON = { yes: "✓", yes_with_plan: "↺", not_yet: "✕" } as const;
  const dot = (v: AffordCheck["verdict"]) => (v === "yes" ? "#5fbf83" : v === "yes_with_plan" ? "#e0a92a" : "#e5584b");
  const chip = (on: boolean) => (on ? "bg-[#1f4531] text-[#f1e9cf] shadow-md" : "bg-white shadow-[0_1px_2px_rgba(31,69,49,0.08)]");
  const short = (t: string) => t.replace(/\.$/, "").replace(/ from ([A-Z][a-z]+ )?Savings/, " from savings").replace(/ by [A-Z][a-z]{2} \d+$/, "").replace(/ and move /, " + ");
  const reset = (fn: () => void) => { fn(); setTrying(null); };

  return (
    <div
      ref={cardRef}
      className="glow relative mx-auto w-full max-w-md scroll-mt-3 overflow-hidden rounded-[2rem] border border-white/10 shadow-2xl"
      style={{ color: C.body, background: "linear-gradient(180deg,#fbf7ec 0%,#f1efe2 55%,#e9efe0 100%)" }}
      role="group"
      aria-label="Try it: can I afford it? Sample data"
    >
      {/* The number, on deep green */}
      <div className="relative px-5 pb-3 pt-4" style={{ background: "radial-gradient(120% 140% at 100% 0%,#2f6b47 0%,#1f4531 55%,#183a29 100%)", color: "#f1e9cf" }}>
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold opacity-80">Safe to spend today</span>
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-semibold text-[#ddefbf]">Sample</span>
        </div>
        <div className="mt-1 flex items-end justify-between gap-3">
          <p className="font-num text-5xl leading-none sm:text-6xl">{formatCents(safe)}</p>
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-12 w-32 shrink-0 overflow-visible" aria-hidden>
            <line x1="0" x2={W} y1={y(hero.floorCents)} y2={y(hero.floorCents)} stroke="#e8c26a" strokeOpacity="0.45" strokeDasharray="2 5" strokeWidth="1" vectorEffect="non-scaling-stroke" />
            <path d={`${line(after ?? vals)}L${W},${H}L0,${H}Z`} fill="#9be0b1" fillOpacity="0.12" />
            <path d={line(vals)} fill="none" stroke="#9be0b1" strokeOpacity={after ? 0.35 : 1} strokeWidth="1.75" vectorEffect="non-scaling-stroke" />
            {after && shown && <path d={line(after)} fill="none" stroke={dot(shown.verdict)} strokeWidth="2.25" vectorEffect="non-scaling-stroke" />}
          </svg>
        </div>
        <p className="mt-1.5 text-[11px] opacity-75">After every bill, card payment and plan until payday{hero.daysToPayday != null ? ` in ${hero.daysToPayday} days` : ""}.</p>
      </div>

      <div className="space-y-3 p-4">
        <div className="grid grid-cols-3 gap-2">
          {OPTIONS.map((o, i) => (
            <button key={o.label} type="button" onClick={() => reset(() => setPick(i))} aria-pressed={pick === i} className={`flex items-center justify-center gap-1.5 rounded-xl px-1 py-2 transition ${chip(pick === i)}`}>
              <Glyph name={o.icon} size="xs" />
              <span className="text-left leading-tight">
                <span className="block text-[11px] font-semibold">{o.label}</span>
                <span className="block text-sm font-bold tabular">{usd(o.cents)}</span>
              </span>
            </button>
          ))}
        </div>
        {pick == null && <p className="text-center text-sm font-bold">Can I afford it? Tap one.</p>}

        <div aria-live="polite">
          {shown && r && (
            <div className="fade-up space-y-3">
              {/* Debit or credit, first: see the difference */}
              {payChecks.length === 2 && (
                <div className="grid grid-cols-2 gap-1 rounded-xl bg-white/70 p-1 shadow-[inset_0_0_0_1px_rgba(31,69,49,0.08)]" role="group" aria-label="Pay with">
                  {payChecks.map(({ cc, c }) => (
                    <button key={String(cc)} type="button" onClick={() => reset(() => setCredit(cc))} aria-pressed={credit === cc}
                      className={`flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-bold transition ${credit === cc ? "bg-[#1f4531] text-[#f1e9cf] shadow" : ""}`}>
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: dot(c.verdict) }} />
                      {cc ? "Credit" : "Debit"}
                      <span className="font-normal opacity-70">· {cc ? `pays ${formatShort(c.cash.date)}` : "today"}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* The answer, loud */}
              <div className="flex items-center gap-3 rounded-2xl px-3.5 py-2.5 text-white shadow-lg transition-colors" style={{ background: VERDICT_BG[shown.verdict] }}>
                <span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/20 text-base font-bold">{VERDICT_ICON[shown.verdict]}</span>
                <span className="min-w-0">
                  <span className="font-display block text-2xl leading-none">{tried ? (shown.verdict === "yes" ? "Then it fits." : "Closer.") : WORD[shown.verdict]}</span>
                  <span className="mt-0.5 block text-[11px] leading-snug opacity-90">{tried ? `With: ${short(tried.title)}` : why}</span>
                </span>
              </div>

              {/* What it does to your money */}
              <div className="grid grid-cols-2 gap-2">
                {bill ? (
<BillRoom
                    label="Credit card bill"
                    usualCents={bill.usualCents}
                    withCents={bill.withCents}
                    capCents={bill.capCents}
                    due={bill.due}
                    fits={shown.verdict === "yes"}
                    palette={{ ink: C.body, muted: C.muted, good: C.good, warn: "#b07d0a", bad: C.bad, track: "#ebe4d2", usual: "#a9b8ac", box: "#ffffff" }}
                    borrowNote={billNotes(shown).borrow}
                    maxNote={billNotes(shown).max}
                    info={(label, text) => <InfoDot label={label}>{text}</InfoDot>}
                  />
                ) : (
                  <Meter
                    label="Spending money"
                    when={`${formatShort(r.start)}–${formatShort(r.end)}`}
                    before={r.before}
                    after={Math.max(0, r.after)}
                    tone={r.shortfall > 0 ? C.warn : C.good}
                    sub={r.shortfall > 0 ? `${usd(r.shortfall)} short` : `${usd(r.after)} left`}
                  />
                )}
                <Meter
                  label="Lowest balance"
                  when={formatShort(shown.lowest.after.date)}
                  before={shown.lowest.before.cents}
                  after={shown.lowest.after.cents}
                  tone={cushion < 0 ? C.bad : C.good}
                  sub={cushion < 0 ? `${usd(-cushion)} under cushion` : `${usd(cushion)} above cushion`}
                />
              </div>

              {/* Ways to make it work: tap to see it */}
              {opts.length > 0 && (
                <div>
                  <p className="flex items-baseline justify-between text-xs font-bold">
                    Ways to make it work <span className="font-normal" style={{ color: C.muted }}>tap to try</span>
                  </p>
                  <ul className="mt-1.5 space-y-1">
                    {opts.map((o, i) => (
                      <li key={o.title}>
                        <div
                          role="button"
                          tabIndex={0}
                          aria-pressed={trying === o.title}
                          onClick={() => setTrying((t) => (t === o.title ? null : o.title))}
                          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setTrying((t) => (t === o.title ? null : o.title)); } }}
                          className={`flex cursor-pointer items-center gap-2 rounded-xl px-2.5 py-1.5 transition ${chip(trying === o.title)}`}
                        >
                          <Glyph name={OPTION_ICON[o.kind] ?? "plan"} size="xs" />
                          <span className="min-w-0 flex-1 text-[13px] font-bold leading-snug">
                            {i === 0 && <span style={{ color: trying === o.title ? "#e8c26a" : C.warn }}>★ </span>}
                            {short(o.title)}
                          </span>
                          <InfoDot label={`About: ${o.title}`}>{o.detail}</InfoDot>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Best day to buy */}
              {dayChecks.length > 1 && (
                <div>
                  <p className="text-xs font-bold">Best day to buy{firstFit && firstFit.date !== date && base!.verdict !== "yes" && <span className="font-semibold" style={{ color: C.good }}> · fits on {formatShort(firstFit.date)}</span>}</p>
                  <div className="mt-1.5 grid gap-1" style={{ gridTemplateColumns: `repeat(${dayChecks.length}, minmax(0, 1fr))` }}>
                    {dayChecks.map((d) => (
                      <button key={d.date} type="button" onClick={() => reset(() => setDate(d.date))} aria-pressed={date === d.date} className={`flex items-center justify-center gap-1 rounded-lg px-1 py-1.5 text-[11px] font-bold transition ${chip(date === d.date)}`}>
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: dot(d.c.verdict) }} />
                        {d.label === "Today" ? "Today" : formatShort(d.date)}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <Link href="/demo/calendar?add=1" className="flex min-h-11 items-center justify-center rounded-full bg-[#1f4531] px-5 text-sm font-semibold text-[#ddefbf] shadow-lg ring-4 ring-[#2e7346]/20 transition hover:bg-[#2e7346] hover:text-white">
                Try it with your plans in the demo →
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
