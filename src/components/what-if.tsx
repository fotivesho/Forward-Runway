"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { addManualEvent, deleteScenario, saveScenario } from "@/app/app/actions";
import { addDays, dayOfWeek, formatShort, isISODate, type ISODate } from "@/lib/dates";
import { parseDollars } from "@/lib/money";
import { checkAffordability, compareScenario, nextOccurrence, ruleOccurrences, type Adjustment } from "@/lib/engine";
import { LOOK, PlanImpact } from "./afford-result";
import { Info } from "./info";
import { toEngineInput, type Snapshot } from "@/lib/data/snapshot";
import { ForecastChart } from "./forecast-chart";
import { CashPath } from "./cash-path";
import { predict, spendModel } from "@/lib/view/patterns";
import { buildDashboard } from "@/lib/view/dashboard";
import { ActionForm, QuickAction, Submit } from "./form";
import { Money } from "./privacy";
import { Card, Disclosure, EmptyState, Notice } from "./ui";


const COMMON: Array<{ label: string; emoji: string; cents: number }> = [
  { label: "Dinner out", emoji: "🍽️", cents: 8_000 },
  { label: "Concert", emoji: "🎟️", cents: 18_000 },
  { label: "Weekend away", emoji: "🏕️", cents: 65_000 },
  { label: "New phone", emoji: "📱", cents: 110_000 },
  { label: "Laptop", emoji: "💻", cents: 240_000 },
];
const VERDICT_SHORT = { yes: "Good", yes_with_plan: "Doable", not_yet: "Not yet" } as const;

/**
 * What if: the money question, answered in one place. Your numbers up top, one question box,
 * the answer in plain words with things you can do, the best time to buy, debit vs credit,
 * and "add to my plans". Bigger changes (income, bills, cushion) sit in a fold underneath.
 */
export function WhatIf({ snapshot, today, nowIso, demo = false }: { snapshot: Snapshot; today: ISODate; nowIso: string; demo?: boolean }) {
  const input = useMemo(() => toEngineInput(snapshot, today), [snapshot, today]);
  const m = useMemo(() => buildDashboard(snapshot, today, 30, new Date(nowIso)), [snapshot, today, nowIso]);
  const ctx = useMemo(() => ({ input, events: m.planned, calendarIncomplete: m.coverage.incomplete, nextPayday: m.nextPayday }), [input, m]);
  const cards = snapshot.accounts.filter((a) => a.kind === "credit_card" && !a.archived);
  const hasAccounts = snapshot.accounts.some((a) => !a.archived && a.isSpendable);

  const [what, setWhat] = useState("");
  const [amount, setAmount] = useState("650");
  const [date, setDate] = useState(today);
  const [payWith, setPayWith] = useState<string | null>(null);
  const [reserved, setReserved] = useState(0);
  const [added, setAdded] = useState<string | null>(null);
  const cents = parseDollars(useDeferredValue(amount));
  const valid = !!cents && cents > 0 && cents <= 5_000_000 && isISODate(date) && date >= today;

  const check = useMemo(
    () => (valid && hasAccounts ? checkAffordability(ctx, { amountCents: cents!, date, paymentAccountId: payWith, reservedCents: reserved }) : null),
    [ctx, valid, cents, date, payWith, reserved, hasAccounts],
  );

  // Best time to buy: the same amount on a few dates that matter.
  const saturday = addDays(today, (6 - dayOfWeek(today) + 7) % 7 || 7);
  const paydays = m.plan.allowance.periods.filter((p) => p.startsWithIncome).map((p) => p.start);
  const times = useMemo(() => {
    const list: Array<{ label: string; date: ISODate }> = [
      { label: "Today", date: today },
      { label: "Sat", date: saturday },
      ...(paydays[0] ? [{ label: "Payday", date: paydays[0] }] : []),
      ...(paydays[1] ? [{ label: "Payday 2", date: paydays[1] }] : []),
      { label: "In a month", date: addDays(today, 30) },
    ];
    const seen = new Set<string>();
    return list.filter((t) => (seen.has(t.date) ? false : (seen.add(t.date), true)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today, saturday, paydays.join()]);
  const timeChecks = useMemo(
    () => (valid ? times.map((t) => ({ ...t, c: checkAffordability(ctx, { amountCents: cents!, date: t.date, paymentAccountId: payWith }) })) : []),
    [ctx, valid, cents, times, payWith],
  );
  const payChecks = useMemo(
    () =>
      valid && cards.length
        ? [{ id: null as string | null, name: "Debit" }, ...cards.map((c) => ({ id: c.id as string | null, name: c.name.split(" ")[0]! }))].map((o) => ({
            ...o,
            c: checkAffordability(ctx, { amountCents: cents!, date, paymentAccountId: o.id, reservedCents: reserved }),
          }))
        : [],
    [ctx, valid, cents, date, cards, reserved],
  );
  const firstGood = timeChecks.find((t) => t.c.verdict === "yes");

  // The ripple: cash ahead with your usual everyday spending, with and without this purchase.
  const model = useMemo(() => spendModel(snapshot, today), [snapshot, today]);
  const ripple = useMemo(() => {
    if (!check || !valid) return null;
    const days = m.forecast90.days.slice(0, 61);
    if (days.length < 2) return null;
    const p = model ? predict(model, today, days[days.length - 1]!.date) : null;
    let usual = 0;
    const without = days.map((d) => d.closingCents - (usual += p?.byDay[d.date] ?? 0));
    const extra = Math.max(0, cents! - reserved);
    const withIt = days.map((d, i) => without[i]! - (d.date >= check.cash.date ? extra : 0));
    const low = withIt.reduce((b, c, i) => (c < withIt[b]! ? i : b), 0);
    const usualCents = p ? Object.entries(p.byDay).filter(([d]) => d <= m.plan.allowance.current.end).reduce((a, [, c]) => a + c, 0) : 0;
    return { dates: days.map((d) => d.date), without, with: withIt, usualCents, lowWith: withIt[low]!, lowDate: days[low]!.date };
  }, [check, valid, m, model, today, cents, reserved]);

  const plans = m.allEvents.filter((v) => v.plannedCents > 0 && v.event.decision !== "skip").slice(0, 4);
  const pick = (label: string, c: number, d?: ISODate, r = 0) => {
    setWhat(label);
    setAmount(String(c / 100));
    if (d) setDate(d);
    setReserved(r);
    setAdded(null);
  };
  const free = m.plan.allowance.status === "shortfall" ? 0 : m.plan.poolCents;
  const savings = [...m.savings.map((v) => v.valueCents), ...m.goals.filter((g) => !g.goal.protected).map((g) => g.balanceCents)].reduce((a, b) => a + b, 0);
  const seg = (on: boolean) => `min-h-8 rounded-full px-3 text-[13px] font-medium ${on ? "bg-brand text-brand-ink" : "text-muted"}`;
  const chip = (on: boolean) => `min-h-9 shrink-0 whitespace-nowrap rounded-full border px-3 text-[13px] font-medium transition ${on ? "border-brand bg-brand text-brand-ink" : "border-line bg-surface text-muted hover:border-brand/60"}`;

  if (!hasAccounts) return <EmptyState title="Add a cash account first">What if needs a checking balance to work from.</EmptyState>;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
      {/* The question, big: like Safe to spend on Today */}
      <section className="card overflow-hidden" aria-labelledby="wi-q">
        <div className="bg-gradient-to-br from-surface-3 to-surface p-4 sm:p-5">
          <div className="flex items-center justify-between gap-2">
            <h2 id="wi-q" className="text-sm font-semibold uppercase tracking-wide text-muted">What if I spend</h2>
            {check && (
              <span className={`rounded-full border px-2.5 py-0.5 text-xs font-bold ${LOOK[check.verdict].badge}`} aria-live="polite">
                {LOOK[check.verdict].icon} {VERDICT_SHORT[check.verdict]}
              </span>
            )}
          </div>
          <label className="mt-1 flex items-baseline gap-1">
            <span className="text-4xl font-bold text-muted">$</span>
            <input
              id="wi-amount"
              aria-label="How much"
              className="w-full min-w-0 bg-transparent text-5xl font-bold tracking-tight text-ink tabular outline-none placeholder:text-faint"
              inputMode="decimal"
              value={amount}
              placeholder="0"
              onChange={(e) => { setAmount(e.target.value); setReserved(0); }}
            />
          </label>
          <input
            aria-label="On what"
            className="mt-1 w-full border-b border-line bg-transparent pb-1 text-base text-ink outline-none placeholder:text-faint focus:border-brand"
            value={what}
            onChange={(e) => { setWhat(e.target.value); setReserved(0); }}
            placeholder="on… dinner, flights, a couch"
            maxLength={80}
          />
          <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1">
            {plans.map((v) => (
              <button key={v.event.id} type="button" className={chip(what === v.event.title)} onClick={() => pick(v.event.title, v.plannedCents, v.event.date, v.advice?.capCents ?? 0)}>
                📅 {v.event.title} · <Money cents={v.plannedCents} whole />
              </button>
            ))}
            {COMMON.map((c) => (
              <button key={c.label} type="button" className={chip(what === c.label)} onClick={() => pick(c.label, c.cents)}>
                {c.emoji} {c.label}
              </button>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {times.slice(0, 3).map((t) => (
              <button key={t.date} type="button" className={chip(date === t.date)} onClick={() => setDate(t.date)}>{t.label}</button>
            ))}
            <input type="date" aria-label="Pick a date" className="input min-h-9 w-auto py-1 text-[13px]" min={today} value={date} onChange={(e) => setDate(e.target.value)} />
            {cards.length > 0 && (
              <span className="ml-auto flex rounded-full border border-line p-0.5" role="group" aria-label="Pay with">
                <button type="button" aria-pressed={payWith === null} className={seg(payWith === null)} onClick={() => setPayWith(null)}>Debit</button>
                {cards.map((c) => (
                  <button key={c.id} type="button" aria-pressed={payWith === c.id} className={seg(payWith === c.id)} onClick={() => setPayWith(c.id)}>{cards.length === 1 ? "Credit" : c.name.split(" ")[0]}</button>
                ))}
              </span>
            )}
          </div>
        </div>
        {/* Where you stand */}
        <dl className="grid grid-cols-3 divide-x divide-line border-t border-line text-center">
          {[
            { label: "Spending money", v: free, sub: `to ${formatShort(m.plan.allowance.current.end)}` },
            { label: "Lowest ahead", v: m.forecast90.lowest.cents, sub: formatShort(m.forecast90.lowest.date) },
            { label: "Savings to tap", v: savings, sub: "not protected" },
          ].map((t) => (
            <div key={t.label} className="min-w-0 px-1 py-2">
              <dt className="truncate text-[10px] font-semibold uppercase tracking-wide text-faint">{t.label}</dt>
              <dd className="truncate text-base font-extrabold tabular text-ink"><Money cents={t.v} whole /></dd>
              <dd className="truncate text-[10px] text-faint">{t.sub}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* The answer */}
      {check && (
        <section className="card p-4 sm:p-5" aria-live="polite" aria-labelledby="wi-a">
          <h2 id="wi-a" className="sr-only">Answer</h2>
          <p className="text-sm text-muted">
            {what && <><span className="font-semibold text-ink">{what}</span> · </>}<Money cents={cents!} whole className="font-semibold text-ink" /> · {formatShort(date)}
            {check.cash.viaCard && !check.cash.beyondHorizon && <> · cash leaves {formatShort(check.cash.date)}</>}
          </p>
          <PlanImpact check={check} reservedCents={reserved} />
          {ripple && (
            <div className="mt-4 rounded-xl border border-line p-3">
              <p className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-faint">
                <span>The ripple: your cash, next 60 days</span>
                <Info label="The ripple">
                  Cash after bills, paychecks and your usual everyday spending (learned from your patterns), with and without this. Dashed: your cash floor.
                </Info>
              </p>
              <div className="mt-2">
                <CashPath
                  dates={ripple.dates}
                  floorCents={snapshot.settings.cashFloorCents}
                  lines={[
                    { id: "without", label: "Without", cents: ripple.without, color: "text-muted", faint: true },
                    { id: "with", label: "With this", cents: ripple.with, color: check.verdict === "not_yet" ? "text-danger" : check.verdict === "yes" ? "text-brand" : "text-warn" },
                  ]}
                />
              </div>
              {ripple.usualCents > 0 && (
                <p className="mt-2 text-xs text-muted">
                  Usual life to {formatShort(m.plan.allowance.current.end)}: ~<Money cents={ripple.usualCents} whole className="font-semibold text-ink" />
                  {ripple.lowWith < snapshot.settings.cashFloorCents && Math.min(...ripple.without) >= snapshot.settings.cashFloorCents && <span className="font-semibold text-warn"> · dips under your floor {formatShort(ripple.lowDate)}</span>}
                </p>
              )}
            </div>
          )}

          {timeChecks.length > 1 && (
            <div className="mt-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-faint">Best time to buy</p>
              <div className="mt-1.5 grid grid-cols-3 gap-1.5 sm:grid-cols-5">
                {timeChecks.map((t) => (
                  <button
                    key={t.date}
                    type="button"
                    onClick={() => setDate(t.date)}
                    aria-pressed={date === t.date}
                    className={`rounded-lg border px-1 py-1.5 text-center transition ${LOOK[t.c.verdict].panel} ${date === t.date ? "ring-2 ring-ink/40" : ""}`}
                  >
                    <span className="block truncate text-[10px] text-muted">{t.label}</span>
                    <span className="block text-[11px] font-semibold text-ink">{formatShort(t.date)}</span>
                    <span className={`block text-[11px] font-bold ${LOOK[t.c.verdict].word}`}>{LOOK[t.c.verdict].icon} {VERDICT_SHORT[t.c.verdict]}</span>
                  </button>
                ))}
              </div>
              {firstGood && firstGood.date !== date && check.verdict !== "yes" && (
                <p className="mt-1 text-xs text-brand">Wait until {formatShort(firstGood.date)} and it simply fits.</p>
              )}
            </div>
          )}

          {payChecks.length > 1 && (
            <div className="mt-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-faint">Debit or credit</p>
              <div className="mt-1.5 grid gap-1.5" style={{ gridTemplateColumns: `repeat(${payChecks.length}, minmax(0, 1fr))` }}>
                {payChecks.map((o) => (
                  <button key={o.name} type="button" onClick={() => setPayWith(o.id)} aria-pressed={payWith === o.id}
                    className={`rounded-lg border px-2 py-1.5 text-left transition ${LOOK[o.c.verdict].panel} ${payWith === o.id ? "ring-2 ring-ink/40" : ""}`}>
                    <span className="block text-[12px] font-semibold text-ink">{o.name}</span>
                    <span className={`block text-[11px] font-bold ${LOOK[o.c.verdict].word}`}>{LOOK[o.c.verdict].icon} {VERDICT_SHORT[o.c.verdict]}</span>
                    <span className="block text-[10px] text-muted">cash leaves {formatShort(o.c.cash.date)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-3">
            <button
              type="button"
              className="btn btn-primary"
              disabled={!!added}
              onClick={async () => {
                const title = what.trim() || "Purchase";
                if (demo) return setAdded(`Demo: "${title}" would be added to your plans on ${formatShort(date)}.`);
                const f = new FormData();
                f.set("title", title);
                f.set("date", date);
                f.set("estimate", String(cents! / 100));
                if (payWith) f.set("paymentAccountId", payWith);
                const r = await addManualEvent(null, f);
                setAdded(r?.ok ? `Added "${title}" to your plans. Open it on Today to pick an option.` : (r && !r.ok ? r.error ?? "Couldn't add it." : "Couldn't add it."));
              }}
            >
              {added ? "✓ Added" : "Add to my plans"}
            </button>
            {added ? <span className="text-xs text-muted">{added}</span> : <Info label="Add to my plans">It joins your forecast and calendar, where you can do an option in one tap.</Info>}
          </div>
        </section>
      )}

      <Disclosure summary="Bigger what-ifs: a raise, a new bill, cancelling something">
        <ScenarioBuilder snapshot={snapshot} input={input} today={today} />
      </Disclosure>
    </div>
  );
}

function describe(adj: Adjustment, snapshot: Snapshot): string {
  const rule = "ruleId" in adj ? snapshot.rules.find((r) => r.id === adj.ruleId) : undefined;
  switch (adj.type) {
    case "add_one_time":
      return `${adj.direction === "in" ? "Extra income" : "Extra expense"} “${adj.label}” ${adj.direction === "in" ? "+" : "−"}$${(adj.amountCents / 100).toFixed(2)} on ${formatShort(adj.date)}`;
    case "change_rule_amount":
      return `${rule?.name ?? "Item"} becomes $${(adj.amountCents / 100).toFixed(2)}`;
    case "pause_rule":
      return `Stop ${rule?.name ?? "item"}`;
    case "skip_occurrence":
      return `Skip ${rule?.name ?? "item"} on ${formatShort(adj.date)}`;
    case "set_balance":
      return `Set balance to $${(adj.balanceCents / 100).toFixed(2)}`;
    case "set_floor":
      return `Cash floor $${(adj.cents / 100).toFixed(2)}`;
  }
}

function ScenarioBuilder({ snapshot, input, today }: { snapshot: Snapshot; input: ReturnType<typeof toEngineInput>; today: ISODate }) {
  const [adjs, setAdjs] = useState<Adjustment[]>([]);
  const [type, setType] = useState<Adjustment["type"]>("add_one_time");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(addDays(today, 7));
  const [label, setLabel] = useState("");
  const [direction, setDirection] = useState<"in" | "out">("out");
  const [ruleId, setRuleId] = useState(snapshot.rules[0]?.id ?? "");
  const [occDate, setOccDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const horizon = 90;
  const primary = snapshot.accounts.find((a) => a.isSpendable && a.kind !== "credit_card" && a.kind !== "loan");
  const cmp = useMemo(() => (adjs.length ? compareScenario(input, adjs, horizon) : null), [input, adjs]);
  const rule = snapshot.rules.find((r) => r.id === ruleId);
  const occs = rule ? ruleOccurrences(rule, snapshot.overrides, today, addDays(today, horizon)).filter((o) => !o.posted).slice(0, 8) : [];

  function add() {
    setError(null);
    const cents = parseDollars(amount);
    let adj: Adjustment | null = null;
    if (type === "add_one_time") {
      if (!cents || cents <= 0) return setError("Enter an amount.");
      if (!isISODate(date)) return setError("Choose a date.");
      if (!primary) return setError("Add a cash account first.");
      adj = { type, date, amountCents: cents, direction, accountId: primary.id, label: label || (direction === "in" ? "Extra income" : "Extra expense") };
    } else if (type === "change_rule_amount") {
      if (!rule) return setError("Choose an item.");
      if (!cents || cents <= 0) return setError("Enter the new amount.");
      adj = { type, ruleId: rule.id, amountCents: cents };
    } else if (type === "pause_rule") {
      if (!rule) return setError("Choose an item.");
      adj = { type, ruleId: rule.id };
    } else if (type === "skip_occurrence") {
      if (!rule) return setError("Choose an item.");
      const d = occDate || nextOccurrence(rule, snapshot.overrides, today)?.originalDate;
      if (!d) return setError("That item has no upcoming dates.");
      adj = { type, ruleId: rule.id, date: d };
    } else if (type === "set_floor") {
      if (cents == null || cents < 0) return setError("Enter a floor amount.");
      adj = { type, cents };
    }
    if (adj) {
      setAdjs((a) => [...a, adj!]);
      setAmount("");
      setLabel("");
    }
  }

  return (
    <Card title="What-if scenarios" id="scenarios">
      <p className="mb-3 text-sm text-muted">Try changes without touching your real plan: a raise, a cancelled subscription, a skipped bill, a bigger cash floor.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label htmlFor="s-type" className="text-sm font-medium">Change</label>
          <select id="s-type" className="input" value={type} onChange={(e) => setType(e.target.value as Adjustment["type"])}>
            <option value="add_one_time">Add a one-time amount</option>
            <option value="change_rule_amount" disabled={!snapshot.rules.length}>Change a recurring amount</option>
            <option value="pause_rule" disabled={!snapshot.rules.length}>Stop a recurring item</option>
            <option value="skip_occurrence" disabled={!snapshot.rules.length}>Skip one date</option>
            <option value="set_floor">Different cash floor</option>
          </select>
        </div>
        {type === "add_one_time" && (
          <>
            <div className="flex flex-col gap-1"><label htmlFor="s-label" className="text-sm font-medium">Label</label><input id="s-label" className="input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Bonus" /></div>
            <div className="flex flex-col gap-1"><label htmlFor="s-dir" className="text-sm font-medium">Money</label><select id="s-dir" className="input" value={direction} onChange={(e) => setDirection(e.target.value as "in" | "out")}><option value="out">Out</option><option value="in">In</option></select></div>
            <div className="flex flex-col gap-1"><label htmlFor="s-date" className="text-sm font-medium">Date</label><input id="s-date" type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          </>
        )}
        {(type === "change_rule_amount" || type === "pause_rule" || type === "skip_occurrence") && (
          <div className="flex flex-col gap-1">
            <label htmlFor="s-rule" className="text-sm font-medium">Item</label>
            <select id="s-rule" className="input" value={ruleId} onChange={(e) => { setRuleId(e.target.value); setOccDate(""); }}>
              {snapshot.rules.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
        )}
        {type === "skip_occurrence" && (
          <div className="flex flex-col gap-1">
            <label htmlFor="s-occ" className="text-sm font-medium">Which date</label>
            <select id="s-occ" className="input" value={occDate} onChange={(e) => setOccDate(e.target.value)}>
              {occs.map((o) => <option key={o.originalDate} value={o.originalDate}>{formatShort(o.date)}</option>)}
            </select>
          </div>
        )}
        {type !== "pause_rule" && type !== "skip_occurrence" && (
          <div className="flex flex-col gap-1"><label htmlFor="s-amt" className="text-sm font-medium">{type === "set_floor" ? "Floor" : type === "change_rule_amount" ? "New amount" : "Amount"}</label><input id="s-amt" className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" /></div>
        )}
        <div className="flex items-end"><button type="button" className="btn btn-secondary w-full" onClick={add}>Add to scenario</button></div>
      </div>
      {error && <p role="alert" className="mt-2 text-sm text-danger">{error}</p>}

      {adjs.length > 0 && (
        <ul className="mt-3 space-y-1 text-sm">
          {adjs.map((a, i) => (
            <li key={i} className="flex items-center justify-between gap-2 rounded-lg border border-line px-3 py-1.5">
              <span>{describe(a, snapshot)}</span>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAdjs((x) => x.filter((_, k) => k !== i))} aria-label={`Remove ${describe(a, snapshot)}`}>✕</button>
            </li>
          ))}
        </ul>
      )}

      {cmp && (
        <div className="mt-4 space-y-3" aria-live="polite">
          <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
            {[
              ["Lowest cash (90 days)", cmp.base.lowest.cents, cmp.scenario.lowest.cents, cmp.lowestDeltaCents],
              ["Cash in 90 days", cmp.base.endingCashCents, cmp.scenario.endingCashCents, cmp.endingDeltaCents],
              ["Daily allowance", cmp.baseDailyAllowanceCents, cmp.scenarioDailyAllowanceCents, cmp.dailyAllowanceDeltaCents],
            ].map(([l, b, s, d]) => (
              <div key={l as string} className="rounded-xl bg-surface-2/60 p-2.5">
                <dt className="text-xs text-faint">{l}</dt>
                <dd><Money cents={b as number} className="text-muted" /> → <Money cents={s as number} className="font-semibold" /></dd>
                <dd className="text-xs"><Money cents={d as number} sign tone="auto" /></dd>
              </div>
            ))}
          </dl>
          {cmp.scenario.firstBelowFloor && <Notice tone="warn">In this scenario cash falls below your floor on {formatShort(cmp.scenario.firstBelowFloor)}.</Notice>}
          <ForecastChart days={cmp.scenario.days} floorCents={cmp.scenario.floorCents} lowest={cmp.scenario.lowest} />
          <ActionForm action={saveScenario} aria-label="Save scenario" className="flex flex-wrap items-end gap-2" onSuccess={() => setName("")}>
            <input type="hidden" name="adjustments" value={JSON.stringify(adjs)} />
            <div className="flex min-w-48 flex-1 flex-col gap-1">
              <label htmlFor="s-name" className="text-sm font-medium">Scenario name</label>
              <input id="s-name" name="name" className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Cancel gym, pick up weekend shifts" />
            </div>
            <Submit variant="secondary">Save scenario</Submit>
          </ActionForm>
        </div>
      )}

      <h3 className="mt-5 text-sm font-semibold">Saved scenarios</h3>
      {snapshot.scenarios.length === 0 ? (
        <EmptyState title="No saved scenarios" />
      ) : (
        <ul className="mt-2 space-y-2">
          {snapshot.scenarios.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line px-3 py-2 text-sm">
              <span>{s.name} <span className="text-faint">· {s.adjustments.length} change{s.adjustments.length === 1 ? "" : "s"}</span></span>
              <span className="flex gap-1">
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setAdjs(s.adjustments)}>Load</button>
                <QuickAction action={deleteScenario} fields={{ id: s.id }} confirm="Delete this scenario?">Delete</QuickAction>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
