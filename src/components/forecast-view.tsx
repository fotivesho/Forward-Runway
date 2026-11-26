"use client";

import { useMemo, useState } from "react";
import { buildForecast, HORIZONS } from "@/lib/engine";
import { addDays, formatShort, formatWeekday, type ISODate } from "@/lib/dates";
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
  const realOn = (d: ISODate) => life.real[f.days.findIndex((x) => x.date === d)] ?? 0;

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
                  Your spendable cash, with paychecks, bills, card payments and plans{life.hasModel ? ", plus your usual everyday spending learned from your patterns" : ""}. The faint line is scheduled items only.
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
                    {k.low ? <Money cents={life.low.cents} whole /> : <>→ <Money cents={realOn(k.date)} whole /></>}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </section>

        {f.cards.length > 0 && (
          <section className="card p-4" aria-labelledby="cards-title">
            <h2 id="cards-title" className="text-base font-bold text-ink">
              Cards <Info label="Cards">Card purchases don't touch cash until you pay the bill. These are the bills in this window.</Info>
            </h2>
            <ul className="mt-2 space-y-1.5">
              {f.cards.flatMap((c) =>
                c.statements.map((s) => (
                  <li key={c.accountId + s.closingDate} className="flex items-center gap-2.5">
                    <Glyph name="card" size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-ink">{c.name.split(" ")[0]} bill</span>
                      <span className="block text-[11px] text-muted">due {formatShort(s.dueDate)}{s.isProjected ? " · projected" : ""}</span>
                    </span>
                    <Money cents={s.balanceCents} whole className="text-sm font-bold tabular text-ink" />
                  </li>
                )),
              )}
            </ul>
          </section>
        )}

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
