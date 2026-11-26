"use client";

import { useMemo, useState } from "react";
import { avgDailyCardSpend, buildForecast, HORIZONS } from "@/lib/engine";
import { addDays, diffDays, eachDay, formatShort, formatWeekday, type ISODate } from "@/lib/dates";
import { toEngineInput, type Snapshot } from "@/lib/data/snapshot";
import { predict, spendModel } from "@/lib/view/patterns";
import { CashPath } from "./cash-path";
import { Glyph } from "./icon";
import { Info } from "./info";
import { Money } from "./privacy";
import { Timeline } from "./timeline";
import { Disclosure, EmptyState, PageHeader } from "./ui";

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
    let usual = 0;
    const real = f.days.map((d) => d.closingCents - (usual += p?.byDay[d.date] ?? 0));
    const low = real.reduce((b, c, i) => (c < real[b]! ? i : b), 0);
    return { real, everyday: usual, low: { cents: real[low]!, date: f.days[low]!.date }, hasModel: !!p };
  }, [model, f, today]);
  if (snapshot.accounts.length === 0) return <EmptyState title="No accounts yet">Add an account to see a forecast.</EmptyState>;

  const end = life.real.at(-1) ?? f.endingCashCents;
  const below = life.low.cents < f.floorCents;
  const items = f.days.flatMap((d) => d.items.map((it) => ({ ...it, day: d })));
  const paydays = items.filter((i) => i.kind === "income" && i.cashEffectCents > 0);
  const bills = items.filter((i) => i.cashEffectCents < 0);
  const inCents = paydays.reduce((a, i) => a + i.cashEffectCents, 0);
  const outCents = -bills.reduce((a, i) => a + i.cashEffectCents, 0);
  // The days that matter: paydays, anything $100+, and the low point.
  const moments = [
    ...items.filter((i) => Math.abs(i.cashEffectCents) >= 10_000).map((i) => ({ key: i.id, date: i.date, glyph: KIND_GLYPH[i.kind] ?? i.category ?? "bill", label: i.label, cents: i.cashEffectCents as number | null, low: false })),
    { key: "low", date: life.low.date, glyph: "⚠", label: "Lowest point", cents: null, low: true },
  ].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.low ? 1 : -1));
  const realOn = (d: ISODate): number | null => {
    const i = f.days.findIndex((x) => x.date === d);
    return i < 0 ? null : life.real[i]!;
  };

  return (
    <>
      <PageHeader title="Forecast" />
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
          <dl className="grid grid-cols-4 divide-x divide-line border-t border-line text-center">
            {[
              { label: "Paydays", v: inCents, tone: "in" as const, sub: `${paydays.length}×` },
              { label: "Out", v: -outCents, tone: "out" as const, sub: `${bills.length} items` },
              { label: "Everyday", v: -life.everyday, tone: "out" as const, sub: life.hasModel ? "expected" : "—" },
              { label: `On ${formatShort(f.endDate)}`, v: end, tone: undefined, sub: "end" },
            ].map((t) => (
              <div key={t.label} className="min-w-0 px-1 py-2">
                <dt className="truncate text-[11px] font-bold text-ink">{t.label}</dt>
                <dd className="truncate text-sm font-extrabold tabular"><Money cents={t.v} whole tone={t.tone} /></dd>
                <dd className="truncate text-[10px] text-faint">{t.sub}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* The days that matter */}
        <section className="card p-4" aria-labelledby="moments-title">
          <h2 id="moments-title" className="text-base font-bold text-ink">Key days</h2>
          <ol className="mt-2">
            {moments.slice(0, 12).map((k) => (
              <li key={k.key} className={`flex items-center gap-2.5 py-1.5 ${k.low ? "rounded-lg bg-warn/10 px-1.5" : ""}`}>
                <Glyph name={k.glyph} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold leading-snug text-ink">{k.label}</span>
                  <span className="block text-[11px] text-muted">{k.date === today ? "Today" : k.date === addDays(today, 1) ? "Tomorrow" : `${formatWeekday(k.date)} ${formatShort(k.date)}`}</span>
                </span>
                <span className="text-right">
                  {k.cents != null && <Money cents={k.cents} whole sign tone="auto" className="block text-sm font-bold tabular" />}
                  <span className={`block text-[11px] tabular ${k.low ? "font-bold text-warn" : "text-faint"}`}>
                    {k.low ? <Money cents={life.low.cents} whole /> : <>→ <Money cents={realOn(k.date) ?? 0} whole /></>}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </section>

        {f.cards.map((c) => (
          <CardBillForecast key={c.accountId} card={c} snapshot={snapshot} today={today} realOn={realOn} />
        ))}

        <Disclosure summary="Every day">
          <Timeline days={f.days} mode="balance" />
        </Disclosure>
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
