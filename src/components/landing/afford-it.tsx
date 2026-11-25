"use client";

import Link from "next/link";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { addDays, dayOfWeek, formatShort, type ISODate } from "@/lib/dates";
import { formatCents, parseDollars } from "@/lib/money";
import { checkAffordability, type PlannedEvent } from "@/lib/engine";
import { toEngineInput, type Snapshot } from "@/lib/data/snapshot";

export const AFFORD_EVENT = "fr-afford";
export interface AffordPreset {
  label: string;
  short?: string;
  cents: number;
  emoji: string;
  /** A calendar plan's own date: picking it also sets "when". */
  date?: ISODate;
  /** Amount already set aside for this calendar plan in the daily caps (never counted twice). */
  reservedCents?: number;
}

export const AFFORD_PRESETS: AffordPreset[] = [
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
  presets = AFFORD_PRESETS,
  cta = { href: "/demo", label: "See the full picture in the demo →", short: "Full demo →" },
  note = "Sample budget. The wedding fund is protected and never suggested.",
}: {
  snapshot: Snapshot;
  today: ISODate;
  nextPayday: ISODate | null;
  events: PlannedEvent[];
  calendarIncomplete: boolean;
  presets?: AffordPreset[];
  /** `short` is used on phones, where space is tight. */
  cta?: { href: string; label: string; short?: string } | null;
  note?: string;
}) {
  const ctx = useMemo(() => ({ input: toEngineInput(snapshot, today), events, calendarIncomplete, nextPayday }), [snapshot, today, events, calendarIncomplete, nextPayday]);
  const card = snapshot.accounts.find((a) => a.kind === "credit_card");
  const saturday = addDays(today, (6 - dayOfWeek(today) + 7) % 7 || 7);
  const [amount, setAmount] = useState(String((presets[0] ?? AFFORD_PRESETS[0]!).cents / 100));
  const [planDate, setPlanDate] = useState<ISODate | null>(presets[0]?.date ?? null);
  const [reservedCents, setReservedCents] = useState<number>(presets[0]?.reservedCents ?? 0);
  const [when, setWhen] = useState(presets[0]?.date ? "plan" : "weekend");
  // `short` is the phone label; the answer always shows the full date.
  const whenOptions: Array<{ id: string; label: string; short: string; date: ISODate }> = [
    ...(planDate ? [{ id: "plan", label: `${formatShort(planDate)} (the plan)`, short: formatShort(planDate), date: planDate }] : []),
    { id: "today", label: "Today", short: "Today", date: today },
    { id: "weekend", label: `Sat ${formatShort(saturday)}`, short: "Sat", date: saturday },
    ...(nextPayday && nextPayday > today ? [{ id: "payday", label: `Payday ${formatShort(nextPayday)}`, short: "Payday", date: nextPayday }] : []),
  ];
  const pick = (p: AffordPreset) => {
    setAmount(String(p.cents / 100));
    setReservedCents(p.reservedCents ?? 0);
    if (p.date) {
      setPlanDate(p.date);
      setWhen("plan");
    } else {
      setPlanDate(null);
      if (when === "plan") setWhen("weekend");
    }
  };
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
    () => (valid ? checkAffordability(ctx, { amountCents: cents!, date, paymentAccountId: onCard ? card?.id : null, reservedCents: when === "plan" ? reservedCents : 0 }) : null),
    [ctx, valid, cents, date, onCard, card?.id, reservedCents, when],
  );
  const safeAfter = useTween(result?.safeToday.after ?? 0);
  const lowAfter = useTween(result?.lowest.after.cents ?? 0);
  const look = result ? LOOK[result.verdict] : null;
  // Phones get tighter spacing and sizes so the choices and the answer fit on one screen;
  // from the sm breakpoint up, everything is as before.
  const chip = (active: boolean) =>
    `min-h-9 rounded-full border px-3 text-[13px] font-medium transition sm:min-h-10 sm:px-3.5 sm:text-sm ${active ? "border-brand bg-brand text-brand-ink" : "border-line bg-surface text-muted hover:border-brand/60 hover:text-ink"}`;
  const alternatives = result?.alternatives ?? [];
  const extras = (
    <>
      {alternatives.map((a) => (
        <li key={a.title} className="text-muted">
          <span className="font-medium text-ink">Or:</span> {a.title}. {a.detail}
        </li>
      ))}
      {result?.plan.cardNote && onCard && <li className="text-xs text-muted">{result.plan.cardNote}</li>}
    </>
  );
  const extrasCount = alternatives.length + (result?.plan.cardNote && onCard ? 1 : 0);

  return (
    <div ref={rootRef} id="afford" className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:gap-4 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-6">
      {/* Inputs */}
      <div className="card p-3 sm:p-5">
        <p className="text-sm font-medium text-ink">What do you want to buy?</p>
        <div className="mt-2 grid grid-cols-2 gap-1.5 sm:mt-3 sm:gap-2">
          {presets.map((p) => {
            const active = cents === p.cents && (!p.date || (when === "plan" && planDate === p.date));
            return (
              <button
                key={p.label + (p.date ?? "")}
                type="button"
                onClick={() => pick(p)}
                aria-pressed={active}
                className={`flex min-h-12 items-center gap-2 rounded-xl border px-2.5 py-1 text-left text-[13px] leading-tight transition sm:min-h-14 sm:px-3 sm:text-sm ${active ? "border-brand bg-brand/10 ring-1 ring-brand" : "border-line bg-surface-2/60 hover:border-brand/60"}`}
              >
                <span aria-hidden className="text-lg sm:text-xl">{p.emoji}</span>
                <span className="min-w-0">
                  <span className="block truncate font-medium text-ink">{p.label}</span>
                  <span className="tabular text-muted">{formatCents(p.cents)}{p.date ? ` · ${formatShort(p.date)}` : ""}</span>
                </span>
              </button>
            );
          })}
        </div>
        <label htmlFor="afford-amount" className="sr-only sm:not-sr-only sm:mt-4 sm:block sm:text-sm sm:font-medium sm:text-ink">Or type any amount</label>
        <div className="relative mt-2 sm:mt-1">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">$</span>
          <input
            id="afford-amount"
            className="input pl-7 text-base font-semibold tabular sm:text-lg"
            inputMode="decimal"
            placeholder="Or type any amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            aria-describedby="afford-hint"
          />
        </div>
        <p id="afford-hint" className={`mt-1 text-xs text-faint ${valid ? "sr-only sm:not-sr-only sm:min-h-4" : ""}`}>{valid ? "" : "Enter an amount like 250."}</p>
        <div role="group" aria-labelledby="afford-when" className="mt-2 flex items-start gap-2 sm:mt-2 sm:block">
          <span id="afford-when" className="w-11 shrink-0 pt-2 text-sm font-medium text-ink sm:block sm:w-auto sm:pt-0">When</span>
          <div className="flex flex-wrap gap-1.5 sm:mt-1.5 sm:gap-2">
            {whenOptions.map((w) => (
              <button key={w.id} type="button" onClick={() => setWhen(w.id)} aria-pressed={when === w.id} aria-label={w.label} className={chip(when === w.id)}>
                <span className="sm:hidden">{w.short}</span>
                <span className="hidden sm:inline">{w.label}</span>
              </button>
            ))}
          </div>
        </div>
        {card && (
          <div role="group" aria-labelledby="afford-pay" className="mt-2 flex items-start gap-2 sm:mt-3 sm:block">
            <span id="afford-pay" className="w-11 shrink-0 pt-2 text-sm font-medium text-ink sm:block sm:w-auto sm:pt-0">Pay<span className="hidden sm:inline"> with</span></span>
            <div className="flex flex-wrap gap-1.5 sm:mt-1.5 sm:gap-2">
              <button type="button" onClick={() => setOnCard(false)} aria-pressed={!onCard} className={chip(!onCard)}>Debit</button>
              <button type="button" onClick={() => setOnCard(true)} aria-pressed={onCard} className={chip(onCard)}>{card.name}</button>
            </div>
          </div>
        )}
      </div>

      {/* The answer: one tight block */}
      <div id="afford-result" className="scroll-mt-4" aria-live="polite" aria-atomic="true">
        {!result || !look ? (
          <div className="card flex min-h-40 items-center justify-center p-6 text-muted sm:min-h-64">Pick something or enter an amount.</div>
        ) : (
          <div className={`rounded-2xl border-2 p-3.5 transition-colors duration-300 sm:p-6 ${look.panel}`}>
            <p className="text-xs text-muted sm:text-sm">
              <span className="font-semibold text-ink tabular">{formatCents(cents!)}</span> on {formatShort(date)}
              {onCard && card ? ` with ${card.name}` : ""}
            </p>
            <p className={`font-display flex items-center gap-2 text-3xl leading-tight sm:mt-1 sm:text-5xl ${look.word}`}>
              <span aria-hidden className="text-2xl sm:text-3xl">{look.icon}</span>
              {result.headline}
            </p>

            <div className="mt-2.5 grid grid-cols-2 gap-2 sm:mt-5 sm:gap-3">
              <div className="rounded-xl bg-surface/80 px-2.5 py-2 sm:p-3">
                <p className="text-[11px] text-faint sm:text-xs">Safe to spend today</p>
                <p className="text-xs text-muted line-through decoration-1 tabular sm:mt-1 sm:text-sm">{formatCents(result.safeToday.before)}</p>
                <p className={`text-2xl font-bold tabular sm:text-3xl ${result.safeToday.after < result.safeToday.before ? "text-ink" : "text-brand"}`}>{formatCents(safeAfter)}</p>
              </div>
              <div className="rounded-xl bg-surface/80 px-2.5 py-2 sm:p-3">
                <p className="text-[11px] text-faint sm:text-xs">
                  Lowest<span className="hidden sm:inline"> balance</span> ahead · {formatShort(result.lowest.after.date)}
                </p>
                <p className="text-xs text-muted line-through decoration-1 tabular sm:mt-1 sm:text-sm">{formatCents(result.lowest.before.cents)}</p>
                <p className="text-2xl font-bold tabular text-ink sm:text-3xl">{formatCents(lowAfter)}</p>
              </div>
            </div>

            <div className="mt-2.5 rounded-xl border border-line bg-surface px-3 py-2.5 sm:mt-4 sm:p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-faint sm:text-xs">Suggested move</p>
              <p className="text-base font-semibold leading-snug text-ink sm:mt-1 sm:text-lg">{result.action.title}</p>
              <p className="text-[13px] leading-snug text-muted sm:text-sm">{result.action.detail}</p>
              {extrasCount > 0 && (
                <>
                  <ul className="mt-3 hidden space-y-1 border-t border-line pt-3 text-sm sm:block">{extras}</ul>
                  <details className="mt-2 border-t border-line pt-2 text-[13px] sm:hidden">
                    <summary className="flex cursor-pointer items-center justify-between gap-2 font-medium text-brand">
                      <span className="whitespace-nowrap">▸ {extrasCount} other option{extrasCount === 1 ? "" : "s"}</span>
                      {cta && (
                        <Link href={cta.href} className="whitespace-nowrap font-semibold text-brand underline-offset-2 hover:underline" onClick={(e) => e.stopPropagation()}>
                          {cta.short ?? cta.label}
                        </Link>
                      )}
                    </summary>
                    <ul className="mt-1.5 space-y-1">{extras}</ul>
                  </details>
                </>
              )}
              {extrasCount === 0 && cta && (
                <Link href={cta.href} className="mt-2 block border-t border-line pt-2 text-right text-[13px] font-semibold text-brand sm:hidden">
                  {cta.short ?? cta.label}
                </Link>
              )}
            </div>

            <div className="mt-5 hidden flex-wrap items-center gap-3 sm:flex">
              {cta && <Link href={cta.href} className="btn btn-primary">{cta.label}</Link>}
              <span className="text-xs text-faint">{note}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
