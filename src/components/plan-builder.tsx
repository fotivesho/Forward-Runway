"use client";

import Link from "next/link";
import { useContext, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { addManualEvent } from "@/app/app/actions";
import { dayOfWeek, eachDay, formatShort, isISODate, type ISODate } from "@/lib/dates";
import { parseDollars } from "@/lib/money";
import { checkAffordability, previewOption, type PlannedEvent } from "@/lib/engine";
import { toEngineInput, type Snapshot } from "@/lib/data/snapshot";
import { buildDashboard } from "@/lib/view/dashboard";
import { DOW_SHORT, exploreData, profileCategory, suggestAmounts } from "@/lib/view/explore";
import { PlanImpact } from "./afford-result";
import { ActionForm, DemoCtx, Submit } from "./form";
import { Glyph } from "./icon";
import { Info } from "./info";
import { Money } from "./privacy";

const KINDS = ["Dining", "Entertainment", "Celebrations", "Travel", "Gifts", "Shopping", "Personal care", "Home", "Health", "Car", "Other"];
const PLACEHOLDER: Record<string, string> = {
  Dining: "Dinner with Sam", Entertainment: "Concert, movie, game", Celebrations: "Birthday, shower, wedding", Travel: "Weekend away, flights",
  Gifts: "Birthday gift", Shopping: "New jacket", "Personal care": "Haircut", Home: "New lamp", Health: "Dentist", Car: "Oil change", Other: "What is it?",
};
const LABEL: Record<string, string> = { Entertainment: "Events", Celebrations: "Parties", "Personal care": "Self-care" };
const BILL_KINDS = new Set(["bill", "subscription", "loan_payment", "expense", "card_payment"]);

/**
 * Add a plan, guided: start from the paycheck it comes out of (what you have, what's already
 * committed, what's free), pick what kind of plan it is (which brings in what you usually spend on
 * it), pick a day and an amount from suggestions, and see the answer before saving.
 */
export function PlanBuilder({ snapshot, today, nextPayday, events, calendarIncomplete, onDone }: {
  snapshot: Snapshot;
  today: ISODate;
  nextPayday: ISODate | null;
  events: PlannedEvent[];
  calendarIncomplete: boolean;
  onDone?: () => void;
}) {
  const demo = useContext(DemoCtx);
  const m = useMemo(() => buildDashboard(snapshot, today, 30, new Date(`${today}T12:00:00Z`)), [snapshot, today]);
  const x = useMemo(() => exploreData(snapshot, today), [snapshot, today]);
  const periods = m.payPeriods.slice(0, 4);
  const [pi, setPi] = useState(0);
  const period = periods[pi] ?? null;
  const [cat, setCat] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState<ISODate | null>(null);
  const [amount, setAmount] = useState("");
  const [payWith, setPayWith] = useState("");
  const cards = snapshot.accounts.filter((a) => !a.archived && a.kind === "credit_card");
  const profile = useMemo(() => (cat ? profileCategory(x, cat) : null), [x, cat]);
  const suggestions = useMemo(() => (cat ? suggestAmounts(profile, cat) : []), [profile, cat]);
  const answerRef = useRef<HTMLDivElement>(null);

  // What this paycheck already has to cover.
  const committed = useMemo(() => {
    if (!period) return null;
    let pay = 0, bills = 0, savings = 0;
    for (const d of m.forecast90.days) {
      if (d.date < period.start || d.date > period.end) continue;
      for (const it of d.items) {
        if (it.kind === "income" && it.cashEffectCents > 0) pay += it.cashEffectCents;
        else if (it.kind === "savings_transfer") savings -= it.cashEffectCents;
        else if (BILL_KINDS.has(it.kind) && it.cashEffectCents < 0) bills -= it.cashEffectCents;
      }
    }
    const plans = m.allEvents.filter((v) => v.event.date >= period.start && v.event.date <= period.end && v.event.decision !== "skip" && (v.advice?.capCents ?? 0) > 0);
    return { pay, bills, savings, plans, plansCents: plans.reduce((a, v) => a + (v.advice?.capCents ?? 0), 0) };
  }, [m, period]);

  // Days you can pick in this pay period, with what's safe to spend each day.
  const days = useMemo(() => (period ? eachDay(period.start < today ? today : period.start, period.end) : []), [period, today]);
  useEffect(() => {
    if (!days.length) return;
    // Default to the first weekend day in the period (most plans happen then), else the first day.
    if (!date || !days.includes(date)) setDate(days.find((d) => dayOfWeek(d) === 5 || dayOfWeek(d) === 6) ?? days[0]!);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days]);

  const ctx = useMemo(() => ({ input: toEngineInput(snapshot, today), events, calendarIncomplete, nextPayday }), [snapshot, today, events, calendarIncomplete, nextPayday]);
  const cents = parseDollars(useDeferredValue(amount));
  const req = cents && cents > 0 && date && isISODate(date) ? { amountCents: cents, date, paymentAccountId: payWith || null } : null;
  const check = useMemo(() => (req && req.amountCents <= 5_000_000 ? checkAffordability(ctx, req) : null), [ctx, req?.amountCents, req?.date, req?.paymentAccountId]); // eslint-disable-line react-hooks/exhaustive-deps
  const sameKind = cat && period ? m.allEvents.filter((v) => v.event.category === cat && v.event.date >= period.start && v.event.date <= period.end && v.plannedCents > 0) : [];
  const name = title.trim() || (cat ? `${cat === "Other" ? "Plan" : cat} plan` : "");
  const chip = (on: boolean) => `shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition ${on ? "bg-brand text-brand-ink shadow" : "bg-surface-2 text-muted hover:text-ink"}`;

  return (
    <ActionForm action={addManualEvent} demoPreview demoNote={false} onSuccess={onDone} className="grid grid-cols-[minmax(0,1fr)] gap-5" aria-label="Add a plan">
      <input type="hidden" name="title" value={name} />
      <input type="hidden" name="date" value={date ?? ""} />
      <input type="hidden" name="estimate" value={amount} />
      <input type="hidden" name="paymentAccountId" value={payWith} />
      <input type="hidden" name="category" value={cat ?? ""} />

      {/* 1. Which paycheck: what you have, what's committed, what's free */}
      {period && committed && (
        <section aria-labelledby="pb-period" className="min-w-0">
          <p id="pb-period" className="flex items-center text-xs font-bold uppercase tracking-wide text-faint">
            1 · From which paycheck
            <Info label="Pay periods">
              A pay period runs from one payday to the day before the next. Each paycheck already has jobs: bills, savings and the plans you&apos;ve made. What&apos;s left is <strong className="font-semibold">free</strong>, and that&apos;s what a new plan comes out of.
            </Info>
          </p>
          <div className="-mx-1 mt-2 flex gap-1.5 overflow-x-auto px-1 pb-1">
            {periods.map((p, i) => (
              <button key={p.start} type="button" onClick={() => setPi(i)} aria-pressed={pi === i} className={chip(pi === i)}>
                {i === 0 ? "Now" : formatShort(p.start)} – {formatShort(p.end)}
              </button>
            ))}
          </div>
          <div className="mt-2 rounded-2xl bg-surface-2/60 p-3">
            <p className="flex items-baseline justify-between gap-2">
              <span className="text-sm text-muted">Free to plan with</span>
              <Money cents={period.freeCents} whole className="font-num text-2xl text-display" />
            </p>
            {(() => {
              const total = Math.max(1, committed.bills + committed.savings + committed.plansCents + period.freeCents);
              const seg = [
                { k: "Bills", c: committed.bills, cls: "bg-out" },
                { k: "Savings", c: committed.savings, cls: "bg-warn" },
                { k: "Plans", c: committed.plansCents, cls: "bg-info" },
                { k: "Free", c: period.freeCents, cls: "bg-brand" },
              ].filter((sg) => sg.c > 0);
              return (
                <>
                  <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-surface-3" aria-hidden>
                    {seg.map((sg) => <span key={sg.k} className={sg.cls} style={{ width: `${(sg.c / total) * 100}%` }} />)}
                  </div>
                  <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted">
                    {committed.pay > 0 && <li>Paycheck <Money cents={committed.pay} whole className="font-semibold text-ink" /></li>}
                    {seg.filter((sg) => sg.k !== "Free").map((sg) => (
                      <li key={sg.k} className="flex items-center gap-1"><span className={`h-1.5 w-1.5 rounded-full ${sg.cls}`} />{sg.k} <Money cents={sg.c} whole className="font-semibold text-ink" /></li>
                    ))}
                    <li>~<Money cents={period.perDayCents} whole className="font-semibold text-ink" />/day</li>
                  </ul>
                </>
              );
            })()}
          </div>
        </section>
      )}

      {/* 2. What kind of plan */}
      <section aria-labelledby="pb-kind" className="min-w-0">
        <p id="pb-kind" className="text-xs font-bold uppercase tracking-wide text-faint">2 · What kind of plan</p>
        <div className="mt-2 grid grid-cols-4 gap-1.5">
          {KINDS.map((k) => (
            <button key={k} type="button" onClick={() => setCat(k)} aria-pressed={cat === k}
              className={`flex flex-col items-center gap-1 rounded-2xl px-1 py-2 text-[11px] font-semibold transition ${cat === k ? "bg-ink text-bg shadow" : "bg-surface-2/70 text-muted hover:text-ink"}`}>
              <Glyph name={k === "Other" ? "plan" : k} size="sm" />
              <span className="w-full truncate text-center">{LABEL[k] ?? k}</span>
            </button>
          ))}
        </div>
        {cat && (
          <div className="fade-up mt-3 rounded-2xl border border-brand/25 bg-brand/[0.07] p-3" key={cat}>
            {profile && profile.count >= 3 ? (
              <>
                <p className="text-sm text-ink">
                  You usually spend <Money cents={profile.avgCents} whole className="font-bold" /> each time on {cat.toLowerCase()}
                  {profile.perWeek >= 0.9 ? <>, about {profile.perWeek.toFixed(1).replace(/\.0$/, "")}× a week</> : null}.
                </p>
                <p className="mt-1 text-xs text-muted">
                  Usually <Money cents={profile.lowCents} whole />–<Money cents={profile.highCents} whole />
                  {profile.busiestDow != null && <> · most on {DOW_SHORT[profile.busiestDow]}s</>}
                  {profile.trendPct != null && Math.abs(profile.trendPct) > 0.1 && <> · {profile.trendPct > 0 ? "up" : "down"} {Math.abs(Math.round(profile.trendPct * 100))}% lately</>}
                </p>
              </>
            ) : (
              <p className="text-sm text-ink">No {cat.toLowerCase()} history yet, so here are typical amounts to start from.</p>
            )}
            {sameKind.length > 0 && (
              <p className="mt-1.5 text-xs text-muted">
                Already planned this pay period: {sameKind.map((v) => `${v.event.title} ($${Math.round(v.plannedCents / 100)})`).join(", ")}
              </p>
            )}
          </div>
        )}
        {cat && (
          <label className="mt-3 block">
            <span className="sr-only">Name it (optional)</span>
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={`Name it (optional): ${PLACEHOLDER[cat] ?? "What is it?"}`} maxLength={200} />
          </label>
        )}
      </section>

      {/* 3. When and how much */}
      {cat && (
        <section aria-labelledby="pb-when" className="fade-up min-w-0">
          <p id="pb-when" className="text-xs font-bold uppercase tracking-wide text-faint">3 · When and how much</p>
          <div className="-mx-1 mt-2 flex gap-1.5 overflow-x-auto px-1 pb-1">
            {days.map((d) => {
              const on = date === d;
              const safe = m.baselineByDay[d];
              return (
                <button key={d} type="button" onClick={() => setDate(d)} aria-pressed={on}
                  className={`flex w-14 shrink-0 flex-col items-center rounded-2xl py-1.5 transition ${on ? "bg-brand text-brand-ink shadow" : "bg-surface-2/70 text-ink"}`}>
                  <span className={`text-[10px] ${on ? "opacity-80" : "text-faint"}`}>{DOW_SHORT[dayOfWeek(d)]}</span>
                  <span className="text-sm font-bold">{Number(d.slice(8))}</span>
                  {safe != null && <span className={`text-[9px] ${on ? "opacity-80" : "text-faint"}`}>${Math.round(safe / 100)}</span>}
                </button>
              );
            })}
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {suggestions.map((sg) => {
              const on = parseDollars(amount) === sg.cents;
              return (
                <button key={sg.label} type="button" onClick={() => setAmount(String(sg.cents / 100))} aria-pressed={on} className={chip(on)}>
                  {sg.label} <Money cents={sg.cents} whole />
                </button>
              );
            })}
          </div>
          <label className="mt-2 flex items-center gap-2 rounded-2xl border border-line bg-surface px-3 focus-within:border-brand">
            <span className="text-lg text-muted">$</span>
            <input className="min-w-0 flex-1 bg-transparent py-2.5 text-xl font-bold tabular text-ink outline-none" inputMode="decimal" placeholder="0" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="About how much" />
          </label>
          {cards.length > 0 && (
            <div role="group" aria-label="Pay with" className="mt-2 grid grid-cols-2 gap-1 rounded-full bg-surface-2 p-1">
              {[{ id: "", name: "Debit" }, ...cards.map((c) => ({ id: c.id, name: cards.length === 1 ? "Credit" : c.name }))].map((o) => (
                <button key={o.id} type="button" onClick={() => setPayWith(o.id)} aria-pressed={payWith === o.id}
                  className={`min-h-9 rounded-full text-xs font-bold transition ${payWith === o.id ? "bg-brand text-brand-ink shadow" : "text-muted"}`}>
                  {o.name}
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {/* The answer */}
      <div aria-live="polite" ref={answerRef}>
        {check && req ? (
          <PlanImpact check={check} preview={(o) => previewOption(ctx, req, o)} />
        ) : cat ? (
          <p className="rounded-2xl border border-dashed border-line p-3 text-sm text-muted">Pick an amount to see if it fits before you save it.</p>
        ) : null}
      </div>

      {cat && (
        <div className="flex flex-wrap items-center gap-3">
          <Submit>{`Add${name ? ` “${name.length > 24 ? name.slice(0, 24) + "…" : name}”` : " plan"}`}</Submit>
          {demo && <span className="text-xs text-muted">Demo: try it freely. <Link href="/login?mode=signup" className="font-semibold text-brand underline">Create your own</Link> to save plans.</span>}
        </div>
      )}
    </ActionForm>
  );
}
