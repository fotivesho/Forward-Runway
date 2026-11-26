"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { formatCents } from "@/lib/money";
import { diffDays, formatShort } from "@/lib/dates";
import { checkAffordability, type AffordCheck, type PlannedEvent } from "@/lib/engine";
import { toEngineInput, type Snapshot } from "@/lib/data/snapshot";
import type { LandingData } from "@/lib/view/landing";
import { Glyph } from "@/components/icon";
import { useCountUp } from "./motion";

const OPTIONS = [
  { label: "Concert", cents: 18_000, icon: "🎟️" },
  { label: "Weekend away", cents: 65_000, icon: "🏕️" },
  { label: "Laptop", cents: 240_000, icon: "💻" },
];

const W = 320;
const H = 96;

/** The verdict in a few words, and the one move that makes it work. */
function answer(c: AffordCheck): { word: string; tone: string; move: string } {
  if (c.verdict === "yes") return { word: "Yes. It fits.", tone: "text-[#2e7346]", move: "Every bill is still covered. Nothing else changes." };
  const move = c.action.title.replace(/\.$/, "");
  if (c.verdict === "yes_with_plan") return { word: "Yes, with a plan.", tone: "text-[#9a6a00]", move };
  return { word: "Not yet.", tone: "text-[#b3261e]", move };
}

/**
 * The first thing a visitor touches: today's safe-to-spend, three things to buy, and the instant
 * answer, with the number and lowest balance moving before their eyes. Real engine, sample money.
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
  today: string;
  events: PlannedEvent[];
  calendarIncomplete: boolean;
}) {
  const ctx = useMemo(() => ({ input: toEngineInput(snapshot, today), events, calendarIncomplete, nextPayday: hero.nextPayday }), [snapshot, today, events, calendarIncomplete, hero.nextPayday]);
  const [pick, setPick] = useState<number | null>(null);
  const check = useMemo(() => (pick == null ? null : checkAffordability(ctx, { amountCents: OPTIONS[pick]!.cents, date: today })), [ctx, pick, today]);

  // Today's number after the purchase: what's left in the pay period, spread over its days.
  // With a plan, show the number after the suggested move (that's the point: it still works).
  const moved = check && check.verdict !== "yes" ? (check.action.apply?.moves ?? []).reduce((t, m) => t + m.cents, 0) : 0;
  const afterSafe = check
    ? Math.max(0, Math.floor((check.room.after + moved - check.room.shortfall) / Math.max(1, diffDays(today, check.room.end) + 1)))
    : hero.safeTodayCents;
  const safe = useCountUp(afterSafe, true, pick == null ? 1400 : 500);
  const lowest = check ? check.lowest.after.cents : hero.lowest.cents;

  // The 30-day line, and the same line with this purchase taken out.
  const vals = hero.points.map((p) => p.cents);
  const after = check ? hero.points.map((p) => p.cents - (p.date >= check.cash.date ? OPTIONS[pick!]!.cents : 0)) : null;
  const all = [...vals, ...(after ?? []), hero.floorCents];
  const min = Math.min(...all);
  const max = Math.max(...all);
  const pad = (max - min) * 0.1 || 1;
  const x = (i: number) => (i / (vals.length - 1)) * W;
  const y = (c: number) => H - ((c - (min - pad)) / (max + pad - (min - pad))) * H;
  const line = (cs: number[]) => cs.map((c, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(c).toFixed(1)}`).join("");
  const a = check ? answer(check) : null;

  return (
    <div className="glow relative mx-auto w-full max-w-md rounded-[2rem] border border-white/10 bg-[#fffcf4] p-5 text-[#1d3324] shadow-2xl sm:p-6" role="group" aria-label="Try it: can I afford it? Sample data">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-[#4f6455]">Safe to spend today</span>
        {check ? (
          <button type="button" onClick={() => setPick(null)} className="text-xs font-semibold text-[#4f6455] underline">Reset</button>
        ) : (
          <span className="rounded-full bg-[#e4eedc] px-2 py-0.5 text-[11px] font-semibold text-[#2e7346]">Sample</span>
        )}
      </div>
      <p className="mt-1 flex items-baseline gap-3">
        <span className="font-num text-6xl leading-none text-[#1f4531] sm:text-7xl">{formatCents(safe)}</span>
        {check && afterSafe !== hero.safeTodayCents && (
          <span className="text-sm font-semibold text-[#4f6455] line-through decoration-[#a8502a]/60">{formatCents(hero.safeTodayCents)}</span>
        )}
      </p>
      {moved > 0 && <p className="text-xs font-semibold text-[#9a6a00]">after moving {formatCents(moved, { compact: true })} from savings</p>}
      <p className="mt-1 text-xs text-[#4f6455]">
        Lowest ahead <span className="font-bold tabular text-[#1d3324]">{formatCents(lowest, { compact: true })}</span>
        {check && check.lowest.after.cents !== check.lowest.before.cents && <span className="text-[#a8502a]"> (was {formatCents(check.lowest.before.cents, { compact: true })})</span>} · {formatShort(check ? check.lowest.after.date : hero.lowest.date)}
      </p>

      <p className="mt-5 text-sm font-bold">Can I afford…</p>
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
            <span className="text-sm font-bold tabular">{formatCents(o.cents, { compact: true })}</span>
          </button>
        ))}
      </div>

      <div aria-live="polite" className="min-h-[1rem]">
        {a && (
          <div className="fade-up mt-4 rounded-2xl bg-[#f3efe2] p-3.5">
            <p className={`font-display text-2xl leading-tight ${a.tone}`}>{a.word}</p>
            <p className="mt-0.5 text-sm font-semibold">{a.move}</p>
          </div>
        )}
      </div>
      {a && (
        <Link href="/demo" className="fade-up mt-4 flex min-h-12 items-center justify-center rounded-full bg-[#182d26] px-5 text-base font-semibold text-[#ddefbf] shadow-lg ring-4 ring-[#2e7346]/20 transition hover:bg-[#2e7346] hover:text-white">
          See the full picture in the demo →
        </Link>
      )}
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="mt-4 h-20 w-full overflow-visible" aria-hidden>
        <line x1="0" x2={W} y1={y(hero.floorCents)} y2={y(hero.floorCents)} stroke="#b8860b" strokeOpacity="0.5" strokeDasharray="2 5" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        <path d={`${line(after ?? vals)}L${W},${H}L0,${H}Z`} fill="#2e8a52" fillOpacity="0.08" />
        <path d={line(vals)} fill="none" stroke="#2e8a52" strokeOpacity={after ? 0.3 : 1} strokeWidth="1.75" vectorEffect="non-scaling-stroke" />
        {after && <path d={line(after)} fill="none" stroke={check!.verdict === "not_yet" ? "#b3261e" : check!.verdict === "yes" ? "#2e8a52" : "#b8860b"} strokeWidth="2" vectorEffect="non-scaling-stroke" />}
      </svg>

    </div>
  );
}
