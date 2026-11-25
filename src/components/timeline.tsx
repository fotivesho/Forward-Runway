"use client";

import { useState } from "react";
import { formatLong, formatShort } from "@/lib/dates";
import type { ForecastDay, ForecastItem } from "@/lib/engine";
import { Money } from "./privacy";
import { Badge } from "./ui";

const KIND_LABEL: Record<string, string> = {
  income: "Income",
  bill: "Bill",
  subscription: "Subscription",
  loan_payment: "Loan payment",
  savings_transfer: "Savings",
  card_payment: "Card payment",
  transfer: "Transfer",
  expense: "Spending",
  card_purchase: "On card",
  refund: "Refund",
  goal_reserve: "Savings (planned)",
};

export function ItemRow({ item, showDate }: { item: ForecastItem; showDate?: boolean }) {
  const nonCash = item.cashEffectCents === 0;
  const amount = nonCash ? -item.postings.reduce((s, p) => s + Math.max(0, -p.deltaCents), 0) : item.cashEffectCents;
  return (
    <li className="flex items-start justify-between gap-3 py-2">
      <div className="min-w-0">
        <p className="truncate text-sm text-ink">
          {showDate && <span className="mr-2 text-faint tabular">{formatShort(item.date)}</span>}
          {item.label}
        </p>
        <div className="mt-0.5 flex flex-wrap gap-1">
          <Badge tone={item.kind === "income" ? "good" : item.kind === "card_payment" ? "info" : "neutral"}>{KIND_LABEL[item.kind] ?? item.kind}</Badge>
          {item.isEstimate && <Badge tone="warn" title="Not a confirmed amount">Estimate</Badge>}
          {nonCash && item.kind === "card_purchase" && <Badge title="Paid later with the card statement — doesn't reduce cash today">Cash later</Badge>}
          {nonCash && item.kind !== "card_purchase" && <Badge title="Moves money between accounts without changing spendable cash">No cash change</Badge>}
          {item.movedFrom && <Badge tone="info">Moved from {formatShort(item.movedFrom)}</Badge>}
        </div>
        {item.note && <p className="mt-0.5 text-xs text-faint">{item.note}</p>}
      </div>
      <Money cents={amount} sign className={`shrink-0 text-sm font-semibold ${nonCash ? "text-faint" : ""}`} tone={nonCash ? undefined : "auto"} />
    </li>
  );
}

/** Daily timeline: one row per day with opening, in, out, closing. Doubles as the chart's table view. */
export function Timeline({ days, selected, onlyActive = true }: { days: ForecastDay[]; selected?: string | null; onlyActive?: boolean }) {
  const [showAll, setShowAll] = useState(!onlyActive);
  const visible = showAll ? days : days.filter((d) => d.items.length || d.nonCashItems.length || d.belowFloor || d.date === days[0]?.date);
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs text-muted">{showAll ? "Every day" : "Days with activity"}</p>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowAll((v) => !v)} aria-pressed={showAll}>
          {showAll ? "Only days with activity" : "Show every day"}
        </button>
      </div>
      <ol className="divide-y divide-line rounded-xl border border-line" aria-label="Daily cash timeline">
        {visible.map((d) => (
          <li key={d.date} id={`day-${d.date}`} className={`p-3 ${selected === d.date ? "bg-surface-3" : ""} ${d.belowFloor ? "border-l-4 border-l-warn" : ""}`}>
            <details open={selected === d.date || undefined}>
              <summary className="flex min-h-11 cursor-pointer list-none flex-wrap items-center justify-between gap-2">
                <span className="font-medium text-ink">
                  {formatLong(d.date)}
                  {d.negative ? (
                    <span className="ml-2"><Badge tone="bad">Below $0</Badge></span>
                  ) : d.belowFloor ? (
                    <span className="ml-2"><Badge tone="warn">Below floor</Badge></span>
                  ) : null}
                </span>
                <span className="text-sm">
                  <span className="sr-only">Closing cash </span>
                  <Money cents={d.closingCents} className="font-semibold" />
                </span>
              </summary>
              <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
                <div><dt className="text-faint">Opening</dt><dd><Money cents={d.openingCents} /></dd></div>
                <div><dt className="text-faint">In</dt><dd><Money cents={d.inflowsCents} tone="in" /></dd></div>
                <div><dt className="text-faint">Out</dt><dd><Money cents={-d.outflowsCents} tone={d.outflowsCents ? "out" : undefined} /></dd></div>
                <div><dt className="text-faint">Closing</dt><dd><Money cents={d.closingCents} className="font-semibold" /></dd></div>
              </dl>
              {(d.items.length > 0 || d.nonCashItems.length > 0) && (
                <ul className="mt-2 divide-y divide-line/60">
                  {[...d.items, ...d.nonCashItems].map((it) => (
                    <ItemRow key={it.id} item={it} />
                  ))}
                </ul>
              )}
            </details>
          </li>
        ))}
      </ol>
    </div>
  );
}
