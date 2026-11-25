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

/** One answer tile: label, big number with a small note beside it, a bar, and a status line. */
function Tile({
  label,
  value,
  aside,
  status,
  tone = "muted",
  children,
}: {
  label: React.ReactNode;
  value: string;
  aside?: string;
  status: React.ReactNode;
  tone?: "muted" | "good" | "warn" | "bad";
  children: React.ReactNode;
}) {
  const toneClass = { muted: "text-muted", good: "text-brand", warn: "font-semibold text-warn", bad: "font-semibold text-danger" }[tone];
  return (
    <div className="rounded-xl bg-surface/80 px-2.5 py-1.5 sm:p-3">
      <p className="text-[11px] text-faint sm:text-xs">{label}</p>
      <p className="flex flex-wrap items-baseline gap-x-1">
        <span className="text-2xl font-bold tabular text-ink sm:text-3xl">{value}</span>
        {aside && <span className="text-[11px] text-muted sm:text-xs">{aside}</span>}
      </p>
      <div className="relative mt-1 h-1.5 rounded-full bg-surface-3" aria-hidden>
        {children}
      </div>
      <p className={`mt-0.5 text-[11px] sm:text-xs ${toneClass}`}>{status}</p>
    </div>
  );
}

const pct = (part: number, whole: number) => `${Math.max(0, Math.min(100, (part / Math.max(1, whole)) * 100))}%`;

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
  const tile1After = useTween(result ? (result.card && !result.cash.beyondHorizon ? result.card.withCents : result.room.after) : 0);
  const lowestAfter = useTween(result?.lowest.after.cents ?? 0);
  /** Estimates read better in whole dollars. */
  const dollars = (c: number) => (c < 0 ? "−$" : "$") + Math.abs(Math.round(c / 100)).toLocaleString("en-US");
  /** "Nov 25–28" within a month, "Nov 29–Dec 12" across months. */
  const span = (a: ISODate, b: ISODate) =>
    a === b ? formatShort(a) : a.slice(0, 7) === b.slice(0, 7) ? `${formatShort(a)}–${Number(b.slice(8))}` : `${formatShort(a)}–${formatShort(b)}`;
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
    </>
  );
  const extrasCount = alternatives.length;

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
              <button type="button" onClick={() => setOnCard(true)} aria-pressed={onCard} className={chip(onCard)} title={card.name}>Credit</button>
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
              {result.cash.viaCard ? (
                <>
                  {" "}with <span className="sm:hidden">{result.cash.viaCard.split(" ")[0]}</span>
                  <span className="hidden sm:inline">{result.cash.viaCard}</span> ·{" "}
                  <span className="whitespace-nowrap font-semibold text-ink">
                    {result.cash.beyondHorizon ? "cash leaves after the next 90 days" : `cash leaves ${formatShort(result.cash.date)}`}
                  </span>
                </>
              ) : null}
            </p>
            <p className={`font-display flex items-center gap-2 text-[1.75rem] leading-tight sm:mt-1 sm:text-5xl ${look.word}`}>
              <span aria-hidden className="text-2xl sm:text-3xl">{look.icon}</span>
              {result.headline}
            </p>

            <div className="mt-2 grid grid-cols-2 gap-2 sm:mt-5 sm:gap-3">
              {result.card && !result.cash.beyondHorizon ? (
                (() => {
                  const c = result.card;
                  const purchase = c.withCents - c.usualCents;
                  const scale = Math.max(c.withCents, c.capCents);
                  const over = c.withCents > c.capCents;
                  // The part of this purchase that still fits under the max is green; anything past it is red.
                  const fits = Math.max(0, Math.min(purchase, c.capCents - c.usualCents));
                  // A small overage the next pay period absorbs is amber (still a plain yes); a real one is red.
                  const overColor = result.verdict === "yes" ? "bg-warn" : "bg-danger";
                  return (
                    <Tile
                      label={<>{c.name.split(" ")[0]} statement · {formatShort(c.due)}</>}
                      value={dollars(tile1After)}
                      aside={`of ${dollars(c.capCents)} max`}
                      tone={over ? (result.verdict === "yes" ? "warn" : "bad") : "good"}
                      status={over ? (result.verdict === "yes" ? `${dollars(c.withCents - c.capCents)} over · next period covers it` : `over by ${dollars(c.withCents - c.capCents)}`) : `${dollars(c.capCents - c.withCents)} room left`}
                    >
                      <div className="absolute inset-0 flex overflow-hidden rounded-full">
                        <span className="h-full bg-faint/70" style={{ width: pct(c.onCardCents, scale) }} />
                        <span className="h-full bg-info/70" style={{ width: pct(c.typicalCents, scale) }} />
                        <span className="h-full bg-brand transition-[width] duration-500" style={{ width: pct(fits, scale) }} />
                        <span className={`h-full transition-[width] duration-500 ${overColor}`} style={{ width: pct(purchase - fits, scale) }} />
                      </div>
                    </Tile>
                  );
                })()
              ) : (
                (() => {
                  const r = result.room;
                  const used = r.before - r.after;
                  const overflow = r.shortfall > 0;
                  return (
                    <Tile
                      label={<>Free to spend · {span(r.start, r.end)}</>}
                      value={formatCents(tile1After)}
                      aside={`left of ${dollars(r.before)}`}
                      tone={overflow ? "warn" : r.borrowed > 0 ? "muted" : "good"}
                      status={overflow ? `short ${dollars(r.shortfall)}` : r.borrowed > 0 ? `+${dollars(r.borrowed)} from next period` : "fits this pay period"}
                    >
                      <span
                        className={`absolute inset-y-0 left-0 rounded-full transition-[width] duration-500 ${overflow ? "bg-warn" : "bg-brand"}`}
                        style={{ width: overflow || r.borrowed > 0 ? "100%" : pct(used, r.before) }}
                      />
                    </Tile>
                  );
                })()
              )}
              {(() => {
                const floor = result.floorCents;
                const cushionBefore = result.lowest.before.cents - floor;
                const cushionAfter = result.lowest.after.cents - floor;
                const below = cushionAfter < 0;
                return (
                  <Tile
                    label={<>Lowest<span className="hidden sm:inline"> balance</span>, 90 days · {formatShort(result.lowest.after.date)}</>}
                    value={dollars(lowestAfter)}
                    aside={`floor ${dollars(floor)}`}
                    tone={below ? "bad" : "good"}
                    status={below ? `${dollars(-cushionAfter)} below your floor` : `✓ ${dollars(cushionAfter)} above your floor`}
                  >
                    <span
                      className={`absolute inset-y-0 left-0 rounded-full transition-[width] duration-500 ${below ? "bg-danger" : "bg-brand"}`}
                      style={{ width: below ? "100%" : pct(cushionAfter, cushionBefore) }}
                    />
                  </Tile>
                );
              })()}
            </div>
            {result.card && !result.cash.beyondHorizon && (
              <p className="mt-1.5 flex flex-wrap gap-x-2.5 gap-y-0.5 text-[11px] text-muted sm:gap-x-3 sm:text-xs">
                <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-faint/70 align-middle" />{dollars(result.card.onCardCents)} on card</span>
                {result.card.typicalCents > 0 && (
                  <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-info/70 align-middle" />{dollars(result.card.typicalCents)} expected</span>
                )}
                <span>
                  <span className={`mr-1 inline-block h-2 w-2 rounded-full align-middle ${result.card.withCents <= result.card.capCents ? "bg-brand" : result.verdict === "yes" ? "bg-warn" : "bg-danger"}`} />
                  {dollars(result.card.withCents - result.card.usualCents)} this purchase
                </span>
              </p>
            )}

            <div className="mt-2 rounded-xl border border-line bg-surface px-3 py-2 sm:mt-4 sm:p-4">
              <p className="hidden text-xs font-semibold uppercase tracking-[0.14em] text-faint sm:block">Suggested move</p>
              <p className="text-base font-semibold leading-snug text-ink sm:mt-1 sm:text-lg">{result.action.title}</p>
              <p className="text-[13px] leading-snug text-muted sm:text-sm">{result.action.detail}</p>
              {result.cash.beyondHorizon && (
                <p className="mt-1.5 text-[13px] leading-snug text-warn sm:text-sm">
                  Its card statement is paid after the next 90 days, so that payment isn't in this answer yet. Keep {formatCents(cents!)} in mind for then.
                </p>
              )}
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
