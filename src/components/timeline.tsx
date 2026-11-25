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

/**
 * Daily timeline, every day expanded: what moves and where cash ends up.
 * "balance" leads with the closing balance; "flow" leads with money in, out and net.
 */
export function Timeline({ days, selected, mode = "balance", onlyActive = true }: { days: ForecastDay[]; selected?: string | null; mode?: "balance" | "flow"; onlyActive?: boolean }) {
  const [showAll, setShowAll] = useState(!onlyActive);
  const visible = showAll ? days : days.filter((d) => d.items.length || d.nonCashItems.length || d.belowFloor || d.date === days[0]?.date);
  const maxBal = Math.max(1, ...days.map((d) => d.closingCents));
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs text-muted">{showAll ? "Every day" : "Days with activity"}</p>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowAll((v) => !v)} aria-pressed={showAll}>
          {showAll ? "Only days with activity" : "Show every day"}
        </button>
      </div>
      <ol className="space-y-2" aria-label="Daily cash timeline">
        {visible.map((d) => {
          const net = d.inflowsCents - d.outflowsCents;
          const items = [...d.items, ...d.nonCashItems];
          return (
            <li
              key={d.date}
              id={`day-${d.date}`}
              className={`scroll-mt-24 rounded-xl border bg-surface p-3 ${selected === d.date ? "border-brand ring-1 ring-brand" : d.negative ? "border-danger/50" : d.belowFloor ? "border-warn/60" : "border-line"}`}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-medium text-ink">
                  {formatLong(d.date)}
                  {d.negative ? (
                    <span className="ml-2"><Badge tone="bad">Below $0</Badge></span>
                  ) : d.belowFloor ? (
                    <span className="ml-2"><Badge tone="warn">Below floor</Badge></span>
                  ) : null}
                </p>
                {mode === "balance" ? (
                  <p className="text-right">
                    <span className="sr-only">Closing cash </span>
                    <Money cents={d.closingCents} className="text-lg font-bold" />
                  </p>
                ) : (
                  <p className="text-right">
                    <span className="sr-only">Net </span>
                    <Money cents={net} sign tone={net ? "auto" : undefined} className="text-lg font-bold" />
                  </p>
                )}
              </div>
              {mode === "balance" ? (
                <>
                  <div className="mt-1 h-1.5 rounded-full bg-surface-3" aria-hidden>
                    <div className={`h-1.5 rounded-full ${d.negative ? "bg-danger" : d.belowFloor ? "bg-warn" : "bg-brand"}`} style={{ width: `${Math.max(0, Math.min(100, (d.closingCents / maxBal) * 100))}%` }} />
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    Opened at <Money cents={d.openingCents} />
                    {d.inflowsCents > 0 && <> · <Money cents={d.inflowsCents} tone="in" sign /></>}
                    {d.outflowsCents > 0 && <> · <Money cents={-d.outflowsCents} tone="out" sign /></>}
                  </p>
                </>
              ) : (
                <p className="mt-1 text-xs text-muted">
                  <Money cents={d.inflowsCents} tone={d.inflowsCents ? "in" : undefined} sign /> in · <Money cents={-d.outflowsCents} tone={d.outflowsCents ? "out" : undefined} sign /> out · ends at <Money cents={d.closingCents} />
                </p>
              )}
              {items.length > 0 && (
                <ul className="mt-2 divide-y divide-line/60 border-t border-line/60">
                  {items.map((it) => (
                    <ItemRow key={it.id} item={it} />
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
