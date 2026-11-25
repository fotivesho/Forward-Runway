"use client";

import { formatCents } from "@/lib/money";
import { formatShort, type ISODate } from "@/lib/dates";
import type { LandingData } from "@/lib/view/landing";
import { useCountUp, usePrefersReducedMotion } from "./motion";
import { AFFORD_EVENT, AFFORD_PRESETS } from "./afford-it";

const W = 320;
const H = 120;
const PLANE = "M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z";

/** A live "phone" card: today's safe-to-spend counting up and the 30-day forecast drawing itself. */
export function HeroCard({ hero }: { hero: LandingData["hero"] }) {
  const reduce = usePrefersReducedMotion();
  const safe = useCountUp(hero.safeTodayCents, true, 1600);
  const pts = hero.points;
  const vals = pts.map((p) => p.cents);
  const min = Math.min(hero.floorCents, ...vals);
  const max = Math.max(...vals);
  const pad = (max - min) * 0.12 || 1;
  const x = (i: number) => (i / (pts.length - 1)) * W;
  const y = (c: number) => H - ((c - (min - pad)) / (max + pad - (min - pad))) * H;
  // Step line (balances change at the start of a day and hold until the next change).
  let d = `M0 ${y(vals[0]!).toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) d += ` H${x(i).toFixed(1)} V${y(vals[i]!).toFixed(1)}`;
  const area = `${d} V${H} H0 Z`;
  const lowIdx = vals.indexOf(hero.lowest.cents);
  const paydayIdx = hero.nextPayday ? pts.findIndex((p) => p.date === hero.nextPayday) : -1;
  const label = (date: ISODate) => formatShort(date);

  return (
    <div className="glow relative mx-auto w-full max-w-sm rounded-[2rem] border border-white/10 bg-[#fffcf4] p-5 text-[#1d3324] shadow-2xl" aria-label="Example Today screen with sample data" role="group">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#4f6455]">Safe to spend today</span>
        <span className="rounded-full border border-[#2e7346]/40 px-2 py-0.5 text-[11px] font-semibold text-[#2e7346]">On track</span>
      </div>
      <p className="mt-1 text-5xl font-bold tracking-tight tabular">{formatCents(safe)}</p>
      <p className="text-xs text-[#4f6455]">
        {hero.daysToPayday != null ? `Payday in ${hero.daysToPayday} day${hero.daysToPayday === 1 ? "" : "s"} · ` : ""}every bill still covered
      </p>

      <svg viewBox={`0 -14 ${W} ${H + 28}`} className="mt-4 w-full overflow-visible" aria-hidden="true">
        <defs>
          <linearGradient id="hero-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2e8a52" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#2e8a52" stopOpacity="0" />
          </linearGradient>
        </defs>
        <line x1="0" x2={W} y1={y(hero.floorCents)} y2={y(hero.floorCents)} stroke="#b8860b" strokeDasharray="4 4" strokeWidth="1" />
        <text x={W} y={y(hero.floorCents) - 4} textAnchor="end" fontSize="9" fill="#4f6455">your floor</text>
        <path d={area} fill="url(#hero-fill)" className={reduce ? "" : "fade-up"} style={{ animationDelay: "1.2s" }} />
        <path id="hero-line" d={d} fill="none" stroke="#2e8a52" strokeWidth="2.5" strokeLinejoin="round" className="draw-line" style={{ ["--len" as string]: 1400 }} />
        {lowIdx >= 0 && (
          <g className={reduce ? "" : "fade-up"} style={{ animationDelay: "2.4s" }}>
            <circle cx={x(lowIdx)} cy={y(vals[lowIdx]!)} r="4" fill="#2e8a52" stroke="#fffcf4" strokeWidth="2" />
            <text x={x(lowIdx)} y={y(vals[lowIdx]!) + 16} textAnchor="middle" fontSize="9" fill="#4f6455">lowest · {label(hero.lowest.date)}</text>
          </g>
        )}
        {paydayIdx > 0 && (
          <text x={x(paydayIdx)} y={-4} textAnchor="middle" fontSize="9" fontWeight="600" fill="#2e7346">payday</text>
        )}
        {!reduce && (
          <g fill="#182d26">
            <path d={PLANE} transform="rotate(90) translate(-12 -12) scale(0.7)" />
            <animateMotion dur="2.4s" begin="0.3s" fill="freeze" rotate="auto" keyPoints="0;1" keyTimes="0;1" calcMode="spline" keySplines="0.35 0.1 0.25 1">
              <mpath href="#hero-line" />
            </animateMotion>
          </g>
        )}
      </svg>

      <ul className="mt-4 space-y-1.5 text-xs">
        {hero.upcoming.slice(0, 3).map((u) => (
          <li key={u.date + u.label} className="flex justify-between gap-2">
            <span className="truncate text-[#4f6455]">
              <span className="mr-1.5 font-semibold text-[#1d3324] tabular">{label(u.date)}</span>
              {u.label}
            </span>
            <span className={`shrink-0 font-semibold tabular ${u.amountCents > 0 ? "text-[#2e7346]" : "text-[#a8502a]"}`}>
              {formatCents(u.amountCents, { sign: true })}
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-4 border-t border-[#ddd3bb] pt-3">
        <p className="text-xs font-semibold text-[#1d3324]">Can I afford…</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {AFFORD_PRESETS.slice(0, 3).map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => {
                window.dispatchEvent(new CustomEvent(AFFORD_EVENT, { detail: p.cents }));
                document.getElementById("afford-title")?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
              }}
              className="min-h-9 rounded-full border border-[#2e7346]/40 bg-[#e4eedc] px-3 text-xs font-semibold text-[#1d3324] transition hover:bg-[#2e7346] hover:text-white"
            >
              <span aria-hidden>{p.emoji} </span>
              {p.short} {formatCents(p.cents)}?
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
