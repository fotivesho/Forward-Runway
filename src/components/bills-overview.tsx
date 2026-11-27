"use client";

import { useState } from "react";
import { formatShort } from "@/lib/dates";
import type { HistBar } from "@/lib/view/history";
import type { FlowItem } from "@/lib/view/spend";
import { Glyph } from "@/components/icon";
import { HistoryChart } from "./history-chart";
import { Info } from "./info";
import { Money } from "./privacy";

export interface BillShare {
  name: string;
  category: string | null;
  monthlyCents: number;
  kind: "bill" | "savings" | "debt" | "card";
  /** Charged to a card: already inside that card's bill, so not added again. */
  onCard?: boolean;
  note?: string;
}

/**
 * Where the fixed money goes, two ways: as a share of a month's income (each bill a slice of it,
 * with what's left over), and over time (fixed costs by month, the ones ahead dashed). Tap a month
 * to list what made it up.
 */
export function BillsOverview({ incomeCents, bills, months, byMonth }: { incomeCents: number; bills: BillShare[]; months: HistBar[]; byMonth: Record<string, FlowItem[]> }) {
  const [view, setView] = useState<"share" | "time">("share");
  const [sel, setSel] = useState<string | null>(months.find((m) => m.kind === "now")?.key ?? null);
  const counted = bills.filter((b) => !b.onCard);
  const fixed = counted.reduce((t, b) => t + b.monthlyCents, 0);
  const free = incomeCents - fixed;
  const pct = (c: number) => (incomeCents > 0 ? Math.round((c / incomeCents) * 100) : 0);
  const scale = Math.max(1, incomeCents, fixed);
  const sorted = [...counted].sort((a, b) => b.monthlyCents - a.monthlyCents);
  const inside = bills.filter((b) => b.onCard);
  const picked = sel ? (byMonth[sel] ?? []) : [];
  const seg = (on: boolean) => `min-h-8 whitespace-nowrap rounded-full px-3 text-xs font-semibold transition ${on ? "bg-surface-3 text-ink" : "text-muted hover:text-ink"}`;

  return (
    <section className="card p-4 sm:p-5" aria-labelledby="fixed-title">
      <div className="flex flex-col gap-2">
        <h2 id="fixed-title" className="flex items-center text-base font-bold text-ink">
          Where fixed money goes
          <Info label="Fixed costs">
            Everything that repeats (rent, loans, utilities, subscriptions, savings moves) as a monthly amount, whichever account pays it. Paychecks that come twice a month are added up to a month. Card statements aren&apos;t counted: they pay for things already here (bills on the card) or everyday purchases. What&apos;s left is what you have for everyday life. <b>Share of income</b> shows how much of a typical month&apos;s income each one takes, and what&apos;s left for everyday life. <b>Over time</b> shows what fixed costs actually came to each month, with the next ones ahead dashed. Tap a month to see what made it up.
          </Info>
        </h2>
        <div role="group" aria-label="View" className="flex self-start rounded-full border border-line p-0.5">
          <button type="button" className={seg(view === "share")} aria-pressed={view === "share"} onClick={() => setView("share")}>% of income</button>
          <button type="button" className={seg(view === "time")} aria-pressed={view === "time"} onClick={() => setView("time")}>Over time</button>
        </div>
      </div>

      {view === "share" ? (
        <div className="mt-3">
          {incomeCents > 0 && (
            <dl className="mb-3 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl bg-surface-2/60 py-2"><dt className="text-[11px] text-faint">Income / month</dt><dd className="font-num text-lg text-in"><Money cents={incomeCents} whole /></dd></div>
              <div className="rounded-xl bg-surface-2/60 py-2"><dt className="text-[11px] text-faint">− Bills</dt><dd className="font-num text-lg text-ink"><Money cents={fixed} whole /></dd></div>
              <div className="rounded-xl bg-surface-2/60 py-2"><dt className="text-[11px] text-faint">= Left</dt><dd className={`font-num text-lg ${free < 0 ? "text-danger" : "text-brand"}`}><Money cents={free} whole /></dd></div>
            </dl>
          )}
          <p className="text-sm text-muted">
            {incomeCents > 0 ? (
              <>Fixed costs take <span className={`font-num text-2xl ${pct(fixed) > 60 ? "text-warn" : "text-display"}`}>{pct(fixed)}%</span> of your income</>
            ) : (
              <>Add your paycheck as repeating to see this as a share of income.</>
            )}
          </p>
          <div className="mt-3 flex h-4 overflow-hidden rounded-full bg-surface-3" aria-hidden>
            {sorted.map((b, i) => (
              <span key={b.name} className="h-full border-r border-surface" style={{ width: `${(b.monthlyCents / scale) * 100}%`, background: `color-mix(in srgb, var(--color-out) ${Math.max(35, 95 - i * 9)}%, transparent)` }} />
            ))}
            {free > 0 && <span className="h-full bg-brand" style={{ width: `${(free / scale) * 100}%` }} />}
          </div>
          <ul className="mt-3 space-y-2">
            {sorted.map((b) => (
              <li key={b.name} className="flex items-center gap-3">
                <Glyph name={b.category ?? (b.kind === "savings" ? "save" : b.kind === "debt" ? "Debt" : b.kind === "card" ? "card" : "bill")} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="truncate text-ink">{b.name}{b.note && <span className="ml-1 text-[11px] text-faint">· {b.note}</span>}</span>
                    <span className="shrink-0 tabular"><Money cents={b.monthlyCents} whole className="font-semibold text-ink" /> <span className="text-xs text-faint">{pct(b.monthlyCents)}%</span></span>
                  </span>
                  <span className="mt-1 block h-1 rounded-full bg-surface-3"><span className="block h-1 rounded-full bg-out/80" style={{ width: `${Math.min(100, (b.monthlyCents / Math.max(1, sorted[0]!.monthlyCents)) * 100)}%` }} /></span>
                </span>
              </li>
            ))}
            {inside.length > 0 && (
              <li className="text-[11px] text-faint">
                Already inside your card bill: {inside.map((b) => b.name).join(", ")}
              </li>
            )}
            {incomeCents > 0 && (
              <li className="flex items-center justify-between border-t border-line pt-2 text-sm">
                <span className="flex items-center gap-2 text-muted"><span className="h-2.5 w-2.5 rounded-full bg-brand" /> Left for everything else</span>
                <span className="tabular"><Money cents={free} whole className={`font-semibold ${free < 0 ? "text-danger" : "text-ink"}`} /> <span className="text-xs text-faint">{pct(free)}%</span></span>
              </li>
            )}
          </ul>
        </div>
      ) : (
        <div className="mt-3">
          <HistoryChart bars={months} tone="out" selected={sel} onSelect={setSel} />
          <div className="mt-3">
            <p className="mb-1 text-xs font-semibold text-faint">{months.find((m) => m.key === sel)?.title ?? ""} · {picked.length}</p>
            {picked.length === 0 ? (
              <p className="text-xs text-muted">Nothing fixed this month.</p>
            ) : (
              <ul className="divide-y divide-line rounded-xl border border-line">
                {picked.map((i) => (
                  <li key={i.key} className="flex items-center gap-3 px-3 py-2">
                    <Glyph name={i.category ?? "bill"} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-ink">{i.label}</span>
                      <span className="block text-[11px] text-muted">{formatShort(i.date)}{i.when === "coming" ? " · coming" : ""}</span>
                    </span>
                    <Money cents={-i.cents} sign tone="auto" className={`shrink-0 text-sm font-semibold ${i.when === "coming" ? "opacity-60" : ""}`} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
