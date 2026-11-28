"use client";

import { useMemo, useState } from "react";
import { avgDailyCardSpend, buildForecast, everydayCash, HORIZONS } from "@/lib/engine";
import { addDays, diffDays, eachDay, formatShort, formatWeekday, type ISODate } from "@/lib/dates";
import { toEngineInput, type Snapshot } from "@/lib/data/snapshot";
import { predict, spendModel } from "@/lib/view/patterns";
import { CashPath } from "./cash-path";
import { Glyph } from "./icon";
import { Info } from "./info";
import { Money } from "./privacy";
import { EmptyState, PageHeader } from "./ui";
import { buildDashboard } from "@/lib/view/dashboard";
import { CardRoomView } from "./card-room";
import { cardRoom } from "@/lib/view/card-room";
import { ChevronDown, Sparkles } from "lucide-react";

const KIND_GLYPH: Record<string, string> = { income: "income", bill: "bill", subscription: "Subscriptions", loan_payment: "Debt", card_payment: "card", savings_transfer: "save", expense: "spend" };

/**
 * Where your cash is going, insight first: the number at the end (with real life in it), one clean
 * chart, the few days that matter, and the full day-by-day only if you want it.
 */
export function ForecastView({ snapshot, today }: { snapshot: Snapshot; today: ISODate }) {
  const [horizon, setHorizon] = useState<number>(snapshot.settings.defaultHorizonDays);
  const f = useMemo(() => buildForecast(toEngineInput(snapshot, today), horizon), [snapshot, today, horizon]);
  const model = useMemo(() => spendModel(snapshot, today), [snapshot, today]);
  const life = useMemo(() => {
    const p = model ? predict(model, today, f.endDate) : null;
    const usual = f.days.reduce((t, d) => t + (p?.byDay[d.date] ?? 0), 0);
    const cash = everydayCash(toEngineInput(snapshot, today), f, (d) => p?.byDay[d] ?? 0);
    const real = f.days.map((d, i) => d.closingCents - cash.cumulative[i]!);
    const low = real.reduce((b, c, i) => (c < real[b]! ? i : b), 0);
    return { real, everyday: usual, low: { cents: real[low]!, date: f.days[low]!.date }, hasModel: !!p, byDay: p?.byDay ?? {} };
  }, [model, f, today]);
  if (snapshot.accounts.length === 0) return <EmptyState title="No accounts yet">Add an account to see a forecast.</EmptyState>;

  const end = life.real.at(-1) ?? f.endingCashCents;
  const below = life.low.cents < f.floorCents;
  const items = f.days.flatMap((d) => d.items.map((it) => ({ ...it, day: d })));
  const paydays = items.filter((i) => i.kind === "income" && i.cashEffectCents > 0);
  const bills = items.filter((i) => i.cashEffectCents < 0);
  const realOn = (d: ISODate): number | null => {
    const i = f.days.findIndex((x) => x.date === d);
    return i < 0 ? null : life.real[i]!;
  };

  return (
    <>
      <PageHeader title="Plan" />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
        <section className="card overflow-hidden" aria-labelledby="fc-title">
          <div className="bg-gradient-to-br from-surface-3 to-surface p-4 sm:p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 id="fc-title" className="text-sm font-bold text-muted">
                Lowest ahead
                <Info label="How this is worked out">
                  The lowest your checking balance will get, looking ahead. We start from today&apos;s balance, add each paycheck, subtract each bill, card payment and plan{life.hasModel ? ", and also subtract your usual everyday spending (learned from your habits)" : ""}. The lowest point is when money is tightest. If it stays above your cushion, you&apos;re safe. The faint line shows scheduled items only.
                </Info>
              </h2>
              <div role="group" aria-label="Forecast horizon" className="flex rounded-full bg-surface-3 p-1">
                {HORIZONS.map((h) => (
                  <button key={h} type="button" onClick={() => setHorizon(h)} aria-pressed={horizon === h}
                    className={`min-h-8 rounded-full px-3.5 text-xs font-bold transition ${horizon === h ? "bg-brand text-brand-ink shadow" : "text-faint hover:text-ink"}`}>
                    {h}d
                  </button>
                ))}
              </div>
            </div>
            <p className={`font-num mt-3 text-6xl leading-none tracking-tight tabular ${below ? "text-warn" : "text-display"}`}><Money cents={life.low.cents} whole sign={life.low.cents < 0} /></p>
            <p className="mt-2 text-sm">
              <span className={`font-semibold ${below ? "text-warn" : "text-brand"}`}>
                {below ? <><Money cents={f.floorCents - life.low.cents} whole /> under your floor</> : <><Money cents={life.low.cents - f.floorCents} whole /> above your floor</>}
              </span>
              <span className="text-faint"> · {formatShort(life.low.date)}</span>
            </p>
            <div className="mt-4">
              <CashPath
                dates={f.days.map((d) => d.date)}
                floorCents={f.floorCents}
                height={150}
                markLowest
                lines={[
                  ...(life.hasModel ? [{ id: "sched", label: "Scheduled", cents: f.days.map((d) => d.closingCents), color: "text-muted", faint: true }] : []),
                  { id: "real", label: life.hasModel ? "Real life" : "Cash", cents: life.real, color: below ? "text-warn" : "text-brand" },
                ]}
              />
            </div>
          </div>
          <p className="flex items-center justify-between gap-2 border-t border-line px-4 py-2.5 text-sm">
            <span className="text-muted">On {formatShort(f.endDate)}</span>
            <span><Money cents={end} whole className="font-semibold text-ink" /> <span className="text-xs text-faint">after {paydays.length} payday{paydays.length === 1 ? "" : "s"} and {bills.length} bills</span></span>
          </p>
        </section>

        <DayByDay f={f} snapshot={snapshot} today={today} realOn={realOn} usualOn={(d) => life.byDay[d] ?? 0} horizon={horizon} setHorizon={setHorizon} lowDate={life.low.date} />
        {f.cards.map((c) => (
          <div key={c.accountId} className="grid gap-3">
            <CardBillForecast card={c} snapshot={snapshot} today={today} realOn={realOn} />
            <CardRoomView rooms={cardRoom(snapshot, today, c.accountId)} />
          </div>
        ))}

        {(f.issues.length > 0 || f.assumptions.length > 0) && (
          <p className="px-1 text-xs text-muted">
            {f.complete ? "Inputs complete" : `${f.issues.filter((i) => i.makesIncomplete).length} input(s) missing or stale`}
            <Info label="Assumptions">
              {f.issues.map((i) => i.message).join(" ")} {f.assumptions.join(" ")}
            </Info>
          </p>
        )}
      </div>
    </>
  );
}

/**
 * A card's next bill: what's on it so far this cycle (solid), where it's heading by the closing date
 * (dashed, your usual card spending plus anything scheduled), against a dotted line at the last bill.
 * Then the one thing that matters for cash: how much leaves, and when.
 */
function CardBillForecast({ card, snapshot, today, realOn }: { card: ReturnType<typeof buildForecast>["cards"][number]; snapshot: Snapshot; today: ISODate; realOn: (d: ISODate) => number | null }) {
  const data = useMemo(() => {
    const next = card.statements.find((s) => s.isProjected) ?? card.statements.find((s) => s.dueDate >= today);
    if (!next) return null;
    const prev = snapshot.statements.filter((s) => s.accountId === card.accountId && s.closingDate <= today).sort((a, b) => (a.closingDate < b.closingDate ? 1 : -1))[0];
    const start = prev ? addDays(prev.closingDate, 1) : addDays(next.closingDate, -30);
    const input = toEngineInput(snapshot, today);
    const perDay = avgDailyCardSpend(input, card.accountId);
    const left = Math.max(0, diffDays(today, next.closingDate));
    const expected = next.isProjected ? next.balanceCents + perDay * left : next.balanceCents;
    // On the card so far this cycle.
    const days = eachDay(start, next.closingDate);
    let run = 0;
    const byDay = new Map<string, number>();
    for (const t of snapshot.transactions) {
      if (t.accountId !== card.accountId || t.status !== "posted" || t.date < start || t.date > today) continue;
      byDay.set(t.date, (byDay.get(t.date) ?? 0) + (t.direction === "out" ? t.amountCents : -t.amountCents));
    }
    const actual: number[] = [];
    for (const d of days) {
      if (d > today) break;
      run += byDay.get(d) ?? 0;
      actual.push(run);
    }
    // Match what's actually owed since the last statement (purchases can predate the app's records).
    const owedSince = card.currentOwedCents - (prev && prev.status !== "paid" ? prev.statementBalanceCents - prev.paidCents : 0);
    const end = actual[actual.length - 1] ?? 0;
    if (owedSince > 0 && actual.length > 1 && owedSince !== end) {
      for (let i = 0; i < actual.length; i++) actual[i] = end > 0 ? Math.round((actual[i]! * owedSince) / end) : Math.round((owedSince * i) / (actual.length - 1));
    }
    // Where it's heading: straight from today to the expected bill at closing.
    const tIdx = Math.max(0, actual.length - 1);
    const from = actual[tIdx] ?? 0;
    const proj = days.map((_, i) => (i < tIdx ? null : from + ((expected - from) * (i - tIdx)) / Math.max(1, days.length - 1 - tIdx)));
    return { next, prev, days, actual, proj, expected, perDay };
  }, [card, snapshot, today]);
  if (!data) return null;
  const { next, prev, days, actual, proj, expected } = data;
  const last = prev?.statementBalanceCents ?? null;
  const diff = last != null ? expected - last : 0;
  const trend = last == null ? null : Math.abs(diff) <= last * 0.05 ? "in line with" : diff > 0 ? "above" : "below";
  const W = 300;
  const H = 90;
  const top = Math.max(expected, last ?? 0, ...actual) * 1.12 || 1;
  const x = (i: number) => (i / Math.max(1, days.length - 1)) * W;
  const y = (c: number) => H - (c / top) * H;
  const path = (pts: Array<number | null>) => pts.map((c, i) => (c == null ? "" : `${pts.slice(0, i).some((v) => v != null) ? "L" : "M"}${x(i).toFixed(1)},${y(c).toFixed(1)}`)).join("");
  const name = card.name.split(" ")[0];
  return (
    <section className="card p-4 sm:p-5" aria-labelledby={`bill-${card.accountId}`}>
      <div className="flex items-baseline justify-between gap-2">
        <h2 id={`bill-${card.accountId}`} className="text-base font-bold text-ink">
          {name} next bill
          <Info label="How this is projected">Your card collects purchases for about a month, then &ldquo;closes&rdquo; and sends a bill. This estimates that bill: what&apos;s on the card so far, plus your usual card spending (about {"$"}{Math.round(data.perDay / 100)} a day) and anything scheduled, until it closes {formatShort(next.closingDate)}. You pay it from checking on {formatShort(next.dueDate)}. That&apos;s when the money actually leaves your account. The dotted line is your last bill, so you can see if this one is running higher or lower.</Info>
        </h2>
        <span className="text-xs text-faint">closes {formatShort(next.closingDate)}</span>
      </div>
      <p className="mt-1 flex flex-wrap items-baseline gap-x-2">
        <Money cents={expected} whole className="font-num text-3xl text-display" />
        {trend && (
          <span className={`text-sm font-semibold ${trend === "above" ? "text-warn" : trend === "below" ? "text-brand" : "text-muted"}`}>
            {trend === "in line with" ? "in line with last bill" : <>{trend === "above" ? "↑" : "↓"} <Money cents={Math.abs(diff)} whole /> {trend} last bill</>}
          </span>
        )}
      </p>
      <div className="relative mt-3" style={{ height: H }}>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden>
          {last != null && <line x1="0" x2={W} y1={y(last)} y2={y(last)} stroke="currentColor" className="text-faint" strokeDasharray="2 4" strokeWidth="1.25" vectorEffect="non-scaling-stroke" />}
          <path d={`${path(actual)}L${x(actual.length - 1)},${H}L0,${H}Z`} fill="currentColor" className="text-brand opacity-[0.1]" />
          <path d={path(actual)} fill="none" stroke="currentColor" className="text-brand" strokeWidth="2" vectorEffect="non-scaling-stroke" />
          <path d={path(proj)} fill="none" stroke="currentColor" className={trend === "above" ? "text-warn" : "text-brand"} strokeWidth="2" strokeDasharray="5 4" vectorEffect="non-scaling-stroke" />
        </svg>
        {last != null && (
          <span className="absolute left-0 -translate-y-full text-[10px] text-faint" style={{ top: `${(y(last) / H) * 100}%` }}>
            Last bill <Money cents={last} whole />
          </span>
        )}
      </div>
      <p className="mt-1 flex justify-between text-[10px] text-faint">
        <span>{formatShort(days[0]!)}</span>
        <span>Today</span>
        <span>{formatShort(next.closingDate)}</span>
      </p>
      <div className="mt-3 flex items-center gap-2.5 rounded-2xl bg-surface-2/60 p-3">
        <Glyph name="card" size="sm" />
        <span className="min-w-0 flex-1 text-sm">
          <span className="block font-semibold text-ink">
            <Money cents={-expected} whole sign className="font-bold text-out" /> from cash on {formatShort(next.dueDate)}
          </span>
          {realOn(next.dueDate) != null && (
            <span className="block text-[11px] text-faint">
              Cash after: <Money cents={realOn(next.dueDate)!} whole className="font-semibold text-muted" />
            </span>
          )}
        </span>
      </div>
    </section>
  );
}

/**
 * Every day ahead, one quiet line each: the day, its limit, and where your balance lands. Tap a day
 * for the rest: why the limit is what it is, plans, bills and paychecks, and usual everyday spending.
 */
function DayByDay({ f, snapshot, today, realOn, usualOn, horizon, setHorizon, lowDate }: { f: ReturnType<typeof buildForecast>; snapshot: Snapshot; today: ISODate; realOn: (d: ISODate) => number | null; usualOn: (d: ISODate) => number; horizon: number; setHorizon: (h: number) => void; lowDate?: ISODate }) {
  const m = useMemo(() => buildDashboard(snapshot, today, 30, new Date()), [snapshot, today]);
  const [open, setOpen] = useState<ISODate | null>(null);
  const [all, setAll] = useState(false);
  const capOf = new Map(m.plan.days.map((d) => [d.date, d]));
  const leanSet = new Set(m.leanDates);
  const plansOn = (d: ISODate) => m.allEvents.filter((v) => v.event.date === d);
  const limit = (d: ISODate) => {
    const c = capOf.get(d);
    if (c) return { cents: c.capCents, firm: true, reasons: c.reasons ?? [] };
    const base = m.baselineByDay[d];
    if (base == null) return null;
    return { cents: base + plansOn(d).reduce((t, v) => t + (v.advice?.capCents ?? 0), 0), firm: false, reasons: m.leanReasons[d] ?? ([] as string[]) };
  };
  const days = all ? f.days : f.days.slice(0, 14);
  return (
    <section className="card p-4" aria-labelledby="days-title">
      <div className="flex items-center justify-between gap-2">
      <h2 id="days-title" className="flex items-center text-base font-bold text-ink">
        Day by day
        <Info label="Day by day">Each day&apos;s <b>limit</b> (a reasonable most to spend that day, the same as on Today) and where your balance <b>lands</b> that night. Limits after your next payday are a first look (~) and settle as you get closer. Tap a day for what&apos;s behind it.</Info>
      </h2>
        <div role="group" aria-label="How far ahead" className="flex rounded-full border border-line p-0.5">
          {HORIZONS.map((h) => (
            <button key={h} type="button" onClick={() => { setHorizon(h); setAll(true); }} aria-pressed={horizon === h}
              className={`min-h-7 rounded-full px-2.5 text-[11px] font-bold transition ${horizon === h ? "bg-surface-3 text-ink" : "text-faint hover:text-ink"}`}>
              {h}d
            </button>
          ))}
        </div>
      </div>
      <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto_auto] gap-x-3 px-1 text-[10px] font-semibold uppercase tracking-wide text-faint">
        <span>Day</span><span className="w-16 text-right">Limit</span><span className="w-20 text-right">Lands at</span>
      </div>
      <ul className="mt-1 divide-y divide-line">
        {days.map((d) => {
          const l = limit(d.date);
          const plans = plansOn(d.date);
          const on = open === d.date;
          const land = realOn(d.date);
          const marks = d.items.length + plans.length;
          // What makes the day matter, in a few words: its plan, or its biggest bill or paycheck.
          const big = [...d.items].sort((x, y) => Math.abs(y.cashEffectCents) - Math.abs(x.cashEffectCents))[0];
          const label = plans.find((v) => v.plannedCents > 0)?.event.title ?? (big && Math.abs(big.cashEffectCents) >= 2_500 ? big.label : null);
          const low = d.date === lowDate;
          return (
            <li key={d.date} className={low ? "rounded-xl bg-warn/10" : undefined}>
              <button type="button" onClick={() => setOpen(on ? null : d.date)} aria-expanded={on} className="grid w-full grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-3 px-1 py-2 text-left">
                <span className="flex min-w-0 items-center gap-1.5 text-sm">
                  <span className={`font-semibold ${d.date === today ? "text-brand" : "text-ink"}`}>{d.date === today ? "Today" : formatWeekday(d.date)}</span>
                  <span className="text-xs text-faint">{formatShort(d.date)}</span>
                  {plans.length > 0 && <span className="h-1.5 w-1.5 rounded-full bg-info" aria-label="plan" />}
                  {d.items.some((i) => i.cashEffectCents > 0) && <span className="h-1.5 w-1.5 rounded-full bg-in" aria-label="money in" />}
                  {d.items.some((i) => i.cashEffectCents < 0) && <span className="h-1.5 w-1.5 rounded-full bg-out" aria-label="bill" />}
                  {l?.reasons.some((r) => / likely/.test(r)) && <Sparkles size={11} className="text-warn" aria-label="usual trip likely" />}
                  {leanSet.has(d.date) && <span className="rounded-full bg-warn/15 px-1.5 text-[10px] font-bold text-warn">Lean</span>}
                  {label && <span className="min-w-0 truncate text-[11px] text-muted">{label}</span>}
                  {low && <span className="shrink-0 text-[10px] font-bold uppercase text-warn">Lowest</span>}
                </span>
                <span className="w-16 text-right font-num text-base text-display">{l ? <>{l.firm ? "" : "~"}<Money cents={l.cents} whole /></> : "—"}</span>
                <span className="flex w-20 items-center justify-end gap-1 text-right text-xs tabular text-muted">
                  {land != null && <Money cents={land} whole className={land < f.floorCents ? "text-warn" : ""} />}
                  <ChevronDown size={12} className={`text-faint transition ${on ? "rotate-180" : ""}`} aria-hidden />
                </span>
              </button>
              {on && (
                <div className="fade-up mb-2 space-y-2 rounded-2xl bg-surface-2/60 p-3 text-sm">
                  {l && l.reasons.length > 0 && (
                    <ul className="space-y-0.5">
                      {l.reasons.map((r) => <li key={r} className="flex items-center gap-1.5 text-xs text-muted"><Sparkles size={12} className="shrink-0 text-brand" aria-hidden />{r}</li>)}
                    </ul>
                  )}
                  {marks === 0 && <p className="text-xs text-muted">Nothing scheduled. Just everyday life.</p>}
                  {plans.length > 0 && (
                    <ul className="space-y-1">
                      {plans.map((v) => (
                        <li key={v.event.id} className="flex items-center justify-between gap-2">
                          <span className="flex min-w-0 items-center gap-2"><Glyph name="plan" size="xs" /><span className="truncate text-ink">{v.event.title}</span></span>
                          <Money cents={-(v.advice?.capCents ?? v.estimate.cents)} sign tone="auto" whole className="shrink-0 font-semibold" />
                        </li>
                      ))}
                    </ul>
                  )}
                  {d.items.length > 0 && (
                    <ul className="space-y-1">
                      {d.items.map((it) => (
                        <li key={it.id} className="flex items-center justify-between gap-2">
                          <span className="flex min-w-0 items-center gap-2"><Glyph name={it.cashEffectCents > 0 ? "income" : (KIND_GLYPH[it.kind] ?? it.category ?? "bill")} size="xs" /><span className="truncate text-ink">{it.label}</span></span>
                          <Money cents={it.cashEffectCents} sign tone="auto" className="shrink-0 font-semibold" />
                        </li>
                      ))}
                    </ul>
                  )}
                  <dl className="grid grid-cols-2 gap-2 border-t border-line pt-2 text-xs">
                    <div><dt className="text-faint">Usual everyday</dt><dd className="font-semibold text-ink">~<Money cents={usualOn(d.date)} whole /></dd></div>
                    <div className="text-right"><dt className="text-faint">Balance that night</dt><dd className="font-semibold text-ink">{land != null ? <Money cents={land} whole /> : "—"}</dd></div>
                  </dl>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {f.days.length > 14 && (
        <button type="button" onClick={() => setAll((x) => !x)} className="mt-2 text-xs font-semibold text-brand">{all ? "Show fewer" : `Show all ${f.days.length} days`}</button>
      )}
    </section>
  );
}
