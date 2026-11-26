"use client";

import { formatCents } from "@/lib/money";
import { formatShort } from "@/lib/dates";
import type { LandingData } from "@/lib/view/landing";
import { useInView } from "./motion";

/** "Your bank shows $X. Here's what it isn't telling you." — the balance walks down item by item. */
export function SpokenFor({ data, listOnly = false }: { data: LandingData["spokenFor"]; listOnly?: boolean }) {
  const { ref, inView } = useInView<HTMLDivElement>(0.25);
  const max = Math.max(data.startCents, ...data.steps.map((s) => s.balanceAfterCents));
  const pct = (c: number) => `${Math.max(2, (c / max) * 100)}%`;
  return (
    <div ref={ref} className={listOnly ? "" : "grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] lg:items-center"}>
      {!listOnly && <div>
        <h2 className="font-display text-3xl leading-tight text-display sm:text-4xl">
          Your bank says <span className="tabular text-brand">{formatCents(data.startCents)}</span>.
          <br />
          That's not the full story.
        </h2>
        <p className="mt-3 text-base text-muted sm:text-lg">
          Rent, the card statement and savings transfers are already spoken for. Walk the money forward and what's truly safe to spend today is{" "}
          <span className="font-semibold text-ink tabular">{formatCents(data.safeTodayCents)}</span>.
        </p>
      </div>}
      <ol className="card space-y-1 p-4 sm:p-5" aria-label="How the balance changes over the next three weeks (example)">
        <li className="flex items-center justify-between gap-3 pb-2 text-sm">
          <span className="font-semibold text-ink">Balance today</span>
          <span className="font-semibold tabular text-ink">{formatCents(data.startCents)}</span>
        </li>
        <li aria-hidden className="h-2.5 rounded-full bg-surface-3">
          <span className="block h-2.5 rounded-full bg-brand" style={{ width: pct(data.startCents) }} />
        </li>
        {data.steps.slice(0, listOnly ? 5 : 6).map((s, i) => (
          <li
            key={s.date + s.label + i}
            className="pt-2 transition-all duration-700"
            style={{ opacity: inView ? 1 : 0, transform: inView ? "none" : "translateX(16px)", transitionDelay: `${150 + i * 140}ms` }}
          >
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="min-w-0 truncate text-muted">
                <span className="mr-2 font-semibold tabular text-ink">{formatShort(s.date)}</span>
                {s.label}
              </span>
              <span className={`shrink-0 font-semibold tabular ${s.amountCents > 0 ? "text-in" : "text-out"}`}>{formatCents(s.amountCents, { sign: true })}</span>
            </div>
            <div aria-hidden className="mt-1 h-2.5 rounded-full bg-surface-3">
              <span
                className={`block h-2.5 rounded-full transition-[width] duration-700 ${s.amountCents > 0 ? "bg-brand" : "bg-out/80"}`}
                style={{ width: inView ? pct(s.balanceAfterCents) : pct(data.startCents), transitionDelay: `${220 + i * 140}ms` }}
              />
            </div>
            <span className="sr-only">Balance after: {formatCents(s.balanceAfterCents)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
