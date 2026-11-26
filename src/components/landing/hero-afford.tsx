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
  const [open, setOpen] = useState(false);
  const [top, setTop] = useState(0);
  return (
    <span className="relative inline-flex align-middle">
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        onClick={(e) => { e.stopPropagation(); setTop((e.currentTarget as HTMLElement).getBoundingClientRect().bottom + 8); setOpen((o) => !o); }}
        className="ml-1.5 inline-flex h-[15px] w-[15px] items-center justify-center rounded-full border font-serif text-[10px] italic leading-none"
        style={{ borderColor: "#4f645580", color: C.muted }}
      >
        i
      </button>
      {open && (
        <span role="note" onClick={() => setOpen(false)} className="fixed inset-x-6 z-50 mx-auto max-w-sm rounded-xl p-3 text-xs font-normal leading-snug shadow-xl" style={{ top, background: "#1f4531", color: "#f1e9cf" }}>
          {children}
        </span>
      )}
    </span>
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

  // Say "credit card", not the card's name: this is about the idea, not one bank.
  const why = check ? explain(check).why.replace(`${card?.name.split(" ")[0] ?? "Card"} bill`, "Credit card bill") : "";
  const options = check && check.verdict !== "yes" ? [check.action, ...check.alternatives].filter((o) => o.kind !== "none").slice(0, 3) : [];
  const r = check?.room;
  const cushion = check ? check.lowest.after.cents - check.floorCents : 0;
  // On credit, what matters is the card bill (like the app); on debit, this pay period's spending money.
  const bill = check?.card && !check.cash.beyondHorizon ? check.card : null;
  const VERDICT_BG = { yes: "linear-gradient(135deg,#2e7346,#1f5a37)", yes_with_plan: "linear-gradient(135deg,#a87708,#865d00)", not_yet: "linear-gradient(135deg,#c0392b,#8f1f17)" } as const;
  const VERDICT_ICON = { yes: "✓", yes_with_plan: "↺", not_yet: "✕" } as const;

  return (
    <div
      className="glow relative mx-auto w-full max-w-md overflow-hidden rounded-[2rem] border border-white/10 shadow-2xl"
      style={{ color: C.body, background: "linear-gradient(180deg,#fbf7ec 0%,#f1efe2 55%,#e9efe0 100%)" }}
      role="group"
      aria-label="Try it: can I afford it? Sample data"
    >
      {/* The number, on deep green */}
      <div className="relative px-5 pb-4 pt-5 sm:px-6" style={{ background: "radial-gradient(120% 140% at 100% 0%,#2f6b47 0%,#1f4531 55%,#183a29 100%)", color: "#f1e9cf" }}>
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold opacity-80">Safe to spend today</span>
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-semibold text-[#ddefbf]">Sample</span>
        </div>
        <p className="font-num mt-1 text-6xl leading-none sm:text-7xl">{formatCents(safe)}</p>
        <p className="mt-1.5 text-xs opacity-75">After every bill, card payment and plan until payday{hero.daysToPayday != null ? ` in ${hero.daysToPayday} days` : ""}.</p>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="mt-3 h-16 w-full overflow-visible" aria-hidden>
          <line x1="0" x2={W} y1={y(hero.floorCents)} y2={y(hero.floorCents)} stroke="#e8c26a" strokeOpacity="0.45" strokeDasharray="2 5" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          <path d={`${line(after ?? vals)}L${W},${H}L0,${H}Z`} fill="#9be0b1" fillOpacity="0.12" />
          <path d={line(vals)} fill="none" stroke="#9be0b1" strokeOpacity={after ? 0.35 : 1} strokeWidth="1.75" vectorEffect="non-scaling-stroke" />
          {after && check && <path d={line(after)} fill="none" stroke={check.verdict === "yes" ? "#9be0b1" : check.verdict === "yes_with_plan" ? "#e8c26a" : "#ff9a90"} strokeWidth="2.25" vectorEffect="non-scaling-stroke" />}
        </svg>
      </div>

      <div className="p-5 sm:p-6">
        <p className="text-sm font-bold">Can I afford…</p>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {OPTIONS.map((o, i) => (
            <button
              key={o.label}
              type="button"
              onClick={() => setPick(i)}
              aria-pressed={pick === i}
              className={`flex flex-col items-center gap-1 rounded-2xl px-1 py-2.5 transition ${pick === i ? "bg-[#1f4531] text-[#f1e9cf] shadow-lg" : "bg-white shadow-[0_1px_2px_rgba(31,69,49,0.08)] hover:shadow-md"}`}
            >
              <Glyph name={o.icon} size="sm" />
              <span className="text-xs font-semibold">{o.label}</span>
              <span className="text-sm font-bold tabular">{usd(o.cents)}</span>
            </button>
          ))}
        </div>

        <div aria-live="polite">
          {check && r && (
            <div className="fade-up mt-5 space-y-4">
              {/* The answer, loud */}
              <div className="flex items-center gap-3 rounded-2xl px-4 py-3.5 text-white shadow-lg" style={{ background: VERDICT_BG[check.verdict] }}>
                <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/20 text-xl font-bold">{VERDICT_ICON[check.verdict]}</span>
                <span className="min-w-0">
                  <span className="font-display block text-[1.9rem] leading-none">{WORD[check.verdict]}</span>
                  <span className="mt-1 block text-xs opacity-90">{why}</span>
                </span>
              </div>

              {/* What it does to your money */}
              <div className="grid grid-cols-2 gap-2">
                {bill ? (
                  <Meter
                    label="Credit card bill"
                    when={`due ${formatShort(bill.due)}`}
                    before={bill.usualCents}
                    after={bill.withCents}
                    limit={bill.capCents}
                    tone={check.verdict !== "yes" && bill.withCents > bill.capCents ? C.warn : C.good}
                    sub={check.verdict !== "yes" && bill.withCents > bill.capCents ? `${usd(bill.withCents - bill.capCents)} over what you can pay` : "Paid in full on time"}
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
                  when={formatShort(check.lowest.after.date)}
                  before={check.lowest.before.cents}
                  after={check.lowest.after.cents}
                  tone={cushion < 0 ? C.bad : C.good}
                  sub={cushion < 0 ? `${usd(-cushion)} under cushion` : `${usd(cushion)} above cushion`}
                />
              </div>

              {/* Ways to make it work: titles only, details behind ⓘ */}
              {options.length > 0 && (
                <div>
                  <p className="text-sm font-bold">Ways to make it work</p>
                  <ul className="mt-2 space-y-1.5">
                    {options.map((o, i) => (
                      <li key={o.title} className="flex items-center gap-2.5 rounded-2xl bg-white px-3 py-2.5 shadow-[0_1px_2px_rgba(31,69,49,0.08)]" style={i === 0 ? { boxShadow: `inset 0 0 0 1.5px ${C.warn}` } : undefined}>
                        <Glyph name={OPTION_ICON[o.kind] ?? "plan"} size="sm" />
                        <span className="min-w-0 flex-1 text-sm font-bold leading-snug">
                          {i === 0 && <span style={{ color: C.warn }}>★ </span>}
                          {o.title.replace(/\.$/, "")}
                          <InfoDot label={`About: ${o.title}`}>{o.detail}</InfoDot>
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
                        className={`rounded-xl px-1 py-1.5 text-center transition ${date === d.date ? "bg-[#1f4531] text-[#f1e9cf] shadow-md" : "bg-white shadow-[0_1px_2px_rgba(31,69,49,0.08)]"}`}
                      >
                        <span className="block text-[10px] opacity-75">{d.label}</span>
                        <span className="block text-xs font-bold">{formatShort(d.date)}</span>
                        <span className="mt-0.5 flex items-center justify-center gap-1 text-[10px] font-bold">
                          <span className="h-1.5 w-1.5 rounded-full" style={{ background: d.c.verdict === "yes" ? "#5fbf83" : d.c.verdict === "yes_with_plan" ? "#e0a92a" : "#e5584b" }} />
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
              {payChecks.length === 2 && (
                <div>
                  <p className="text-sm font-bold">Debit or credit</p>
                  <div className="mt-2 grid grid-cols-2 gap-1.5">
                    {payChecks.map(({ cc, c }) => (
                      <button
                        key={String(cc)}
                        type="button"
                        onClick={() => setCredit(cc)}
                        aria-pressed={credit === cc}
                        className={`rounded-xl px-3 py-2 text-left transition ${credit === cc ? "bg-[#1f4531] text-[#f1e9cf] shadow-md" : "bg-white shadow-[0_1px_2px_rgba(31,69,49,0.08)]"}`}
                      >
                        <span className="flex items-center justify-between gap-1">
                          <span className="text-xs font-bold">{cc ? "Credit" : "Debit"}</span>
                          <span className="flex items-center gap-1 text-[10px] font-bold">
                            <span className="h-1.5 w-1.5 rounded-full" style={{ background: c.verdict === "yes" ? "#5fbf83" : c.verdict === "yes_with_plan" ? "#e0a92a" : "#e5584b" }} />
                            {SHORT[c.verdict]}
                          </span>
                        </span>
                        <span className="block text-[10px] opacity-75">cash leaves {formatShort(c.cash.date)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <Link href="/demo" className="flex min-h-12 items-center justify-center rounded-full bg-[#1f4531] px-5 text-base font-semibold text-[#ddefbf] shadow-lg ring-4 ring-[#2e7346]/20 transition hover:bg-[#2e7346] hover:text-white">
                Try it with your plans in the demo →
              </Link>
              <button type="button" onClick={() => { setPick(null); setDate(today); setCredit(false); }} className="block w-full text-center text-xs font-semibold underline" style={{ color: C.muted }}>
                Start over
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
