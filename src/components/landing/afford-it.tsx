"use client";

import Link from "next/link";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { addDays, dayOfWeek, formatShort, type ISODate } from "@/lib/dates";
import { formatCents, parseDollars } from "@/lib/money";
import { checkAffordability, type PlannedEvent } from "@/lib/engine";
import { toEngineInput, type Snapshot } from "@/lib/data/snapshot";

export const AFFORD_EVENT = "fr-afford";
export const AFFORD_PRESETS = [
  { label: "Concert tickets", short: "Concert", cents: 18_000, emoji: "🎟️" },
  { label: "Weekend trip", short: "Weekend trip", cents: 65_000, emoji: "🏕️" },
  { label: "New laptop", short: "Laptop", cents: 240_000, emoji: "💻" },
  { label: "Car repair", short: "Car repair", cents: 120_000, emoji: "🔧" },
];

/** Smoothly animates between successive values. */
function useTween(value: number, ms = 450) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(value);
      from.current = value;
      return;
    }
    const start = from.current;
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / ms);
      const v = Math.round(start + (value - start) * (1 - Math.pow(1 - p, 3)));
      setShown(v);
      from.current = v;
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, ms]);
  return shown;
}

const LOOK = {
  yes: { panel: "border-brand/50 bg-brand/[0.07]", word: "text-brand", icon: "✓" },
  yes_with_plan: { panel: "border-warn/50 bg-warn/[0.07]", word: "text-warn", icon: "↺" },
  not_yet: { panel: "border-danger/40 bg-danger/[0.06]", word: "text-danger", icon: "✕" },
} as const;

export function AffordIt({
  snapshot,
  today,
  nextPayday,
  events,
  calendarIncomplete,
}: {
  snapshot: Snapshot;
  today: ISODate;
  nextPayday: ISODate | null;
  events: PlannedEvent[];
  calendarIncomplete: boolean;
}) {
  const ctx = useMemo(() => ({ input: toEngineInput(snapshot, today), events, calendarIncomplete, nextPayday }), [snapshot, today, events, calendarIncomplete, nextPayday]);
  const card = snapshot.accounts.find((a) => a.kind === "credit_card");
  const saturday = addDays(today, (6 - dayOfWeek(today) + 7) % 7 || 7);
  const whenOptions: Array<{ id: string; label: string; date: ISODate }> = [
    { id: "today", label: "Today", date: today },
    { id: "weekend", label: `Sat ${formatShort(saturday)}`, date: saturday },
    ...(nextPayday && nextPayday > today ? [{ id: "payday", label: `Payday ${formatShort(nextPayday)}`, date: nextPayday }] : []),
  ];
  const [amount, setAmount] = useState(String(AFFORD_PRESETS[0]!.cents / 100));
  const [when, setWhen] = useState("weekend");
  const [onCard, setOnCard] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // The hero card's chips hand an amount to this checker.
  useEffect(() => {
    const onPick = (e: Event) => {
      const cents = (e as CustomEvent<number>).detail;
      if (typeof cents === "number") setAmount(String(cents / 100));
    };
    window.addEventListener(AFFORD_EVENT, onPick);
    return () => window.removeEventListener(AFFORD_EVENT, onPick);
  }, []);

  const cents = parseDollars(useDeferredValue(amount));
  const valid = cents != null && cents > 0 && cents <= 5_000_000;
  const date = whenOptions.find((w) => w.id === when)?.date ?? today;
  const result = useMemo(
    () => (valid ? checkAffordability(ctx, { amountCents: cents!, date, paymentAccountId: onCard ? card?.id : null }) : null),
    [ctx, valid, cents, date, onCard, card?.id],
  );
  const safeAfter = useTween(result?.safeToday.after ?? 0);
  const lowAfter = useTween(result?.lowest.after.cents ?? 0);
  const look = result ? LOOK[result.verdict] : null;
  const chip = (active: boolean) =>
    `min-h-10 rounded-full border px-3.5 text-sm font-medium transition ${active ? "border-brand bg-brand text-brand-ink" : "border-line bg-surface text-muted hover:border-brand/60 hover:text-ink"}`;

  return (
    <div ref={rootRef} id="afford" className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-6">
      {/* Inputs */}
      <div className="card p-4 sm:p-5">
        <p className="text-sm font-medium text-ink">What do you want to buy?</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {AFFORD_PRESETS.map((p) => {
            const active = cents === p.cents;
            return (
              <button
                key={p.label}
                type="button"
                onClick={() => setAmount(String(p.cents / 100))}
                aria-pressed={active}
                className={`flex min-h-14 items-center gap-2 rounded-xl border px-3 text-left text-sm transition ${active ? "border-brand bg-brand/10 ring-1 ring-brand" : "border-line bg-surface-2/60 hover:border-brand/60"}`}
              >
                <span aria-hidden className="text-xl">{p.emoji}</span>
                <span className="min-w-0">
                  <span className="block truncate font-medium text-ink">{p.label}</span>
                  <span className="tabular text-muted">{formatCents(p.cents)}</span>
                </span>
              </button>
            );
          })}
        </div>
        <label htmlFor="afford-amount" className="mt-4 block text-sm font-medium text-ink">Or type any amount</label>
        <div className="relative mt-1">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">$</span>
          <input id="afford-amount" className="input pl-7 text-lg font-semibold tabular" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} aria-describedby="afford-hint" />
        </div>
        <p id="afford-hint" className="mt-1 min-h-4 text-xs text-faint">{valid ? "" : "Enter an amount like 250."}</p>
        <fieldset className="mt-2">
          <legend className="text-sm font-medium text-ink">When</legend>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {whenOptions.map((w) => (
              <button key={w.id} type="button" onClick={() => setWhen(w.id)} aria-pressed={when === w.id} className={chip(when === w.id)}>
                {w.label}
              </button>
            ))}
          </div>
        </fieldset>
        {card && (
          <fieldset className="mt-3">
            <legend className="text-sm font-medium text-ink">Pay with</legend>
            <div className="mt-1.5 flex flex-wrap gap-2">
              <button type="button" onClick={() => setOnCard(false)} aria-pressed={!onCard} className={chip(!onCard)}>Debit</button>
              <button type="button" onClick={() => setOnCard(true)} aria-pressed={onCard} className={chip(onCard)}>{card.name}</button>
            </div>
          </fieldset>
        )}
      </div>

      {/* The answer: one tight block */}
      <div id="afford-result" className="scroll-mt-4" aria-live="polite" aria-atomic="true">
        {!result || !look ? (
          <div className="card flex min-h-64 items-center justify-center p-6 text-muted">Pick something or enter an amount.</div>
        ) : (
          <div className={`rounded-2xl border-2 p-5 transition-colors duration-300 sm:p-6 ${look.panel}`}>
            <p className="text-sm text-muted">
              <span className="font-semibold text-ink tabular">{formatCents(cents!)}</span> on {formatShort(date)}
              {onCard && card ? ` with ${card.name}` : ""}
            </p>
            <p className={`font-display mt-1 flex items-center gap-2 text-4xl sm:text-5xl ${look.word}`}>
              <span aria-hidden className="text-3xl">{look.icon}</span>
              {result.headline}
            </p>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-surface/80 p-3">
                <p className="text-xs text-faint">Safe to spend today</p>
                <p className="mt-1 text-sm text-muted line-through decoration-1 tabular">{formatCents(result.safeToday.before)}</p>
                <p className={`text-3xl font-bold tabular ${result.safeToday.after < result.safeToday.before ? "text-ink" : "text-brand"}`}>{formatCents(safeAfter)}</p>
              </div>
              <div className="rounded-xl bg-surface/80 p-3">
                <p className="text-xs text-faint">Lowest balance ahead</p>
                <p className="mt-1 text-sm text-muted line-through decoration-1 tabular">{formatCents(result.lowest.before.cents)}</p>
                <p className="text-3xl font-bold tabular text-ink">{formatCents(lowAfter)}</p>
                <p className="text-xs text-muted">{formatShort(result.lowest.after.date)}</p>
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-line bg-surface p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-faint">Suggested move</p>
              <p className="mt-1 text-lg font-semibold text-ink">{result.action.title}</p>
              <p className="text-sm text-muted">{result.action.detail}</p>
              {result.alternatives.length > 0 && (
                <ul className="mt-3 space-y-1 border-t border-line pt-3 text-sm">
                  {result.alternatives.map((a) => (
                    <li key={a.title} className="text-muted">
                      <span className="font-medium text-ink">Or:</span> {a.title}. {a.detail}
                    </li>
                  ))}
                </ul>
              )}
              {result.plan.cardNote && onCard && <p className="mt-3 border-t border-line pt-3 text-xs text-muted">{result.plan.cardNote}</p>}
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <Link href="/demo" className="btn btn-primary">See the full picture in the demo →</Link>
              <span className="text-xs text-faint">Sample budget. The wedding fund is protected and never suggested.</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
