"use client";

import { useMemo, useState } from "react";
import { deleteScenario, recordDecision, saveScenario } from "@/app/app/actions";
import { addDays, formatShort, isISODate, type ISODate } from "@/lib/dates";
import { parseDollars } from "@/lib/money";
import { compareScenario, nextOccurrence, planPurchase, ruleOccurrences, type Adjustment } from "@/lib/engine";
import { toEngineInput, type Snapshot } from "@/lib/data/snapshot";
import { ForecastChart } from "./forecast-chart";
import { AFFORD_PRESETS, AffordIt, type AffordPreset } from "./landing/afford-it";
import { buildDashboard } from "@/lib/view/dashboard";
import { ActionForm, QuickAction, Submit } from "./form";
import { Money } from "./privacy";
import { Badge, Card, EmptyState, Notice } from "./ui";

const VERDICT = {
  fits: { tone: "good", label: "Fits your cash flow" },
  fits_with_savings: { tone: "warn", label: "Needs a move from savings" },
  needs_protected_savings: { tone: "warn", label: "Needs protected savings" },
  not_covered: { tone: "bad", label: "Not covered" },
} as const;

export function WhatIf({ snapshot, today, nowIso, demo = false }: { snapshot: Snapshot; today: ISODate; nowIso: string; demo?: boolean }) {
  const input = useMemo(() => toEngineInput(snapshot, today), [snapshot, today]);
  // The same advisor view the Today screen uses, so "safe to spend today" matches exactly.
  const model = useMemo(() => buildDashboard(snapshot, today, 30, new Date(nowIso)), [snapshot, today, nowIso]);
  const presets = useMemo<AffordPreset[]>(() => {
    const plans: AffordPreset[] = model.events
      .filter((v) => !v.duplicate && v.plannedCents > 0 && v.event.date >= today && v.event.decision !== "skip")
      .slice(0, 4)
      .map((v) => ({ label: v.event.title, short: v.event.title, cents: v.plannedCents, emoji: "📅", date: v.event.date, reservedCents: v.advice?.capCents ?? 0 }));
    return [...plans, ...AFFORD_PRESETS].slice(0, 4);
  }, [model, today]);
  const hasAccounts = snapshot.accounts.some((a) => !a.archived && a.isSpendable);

  return (
    <div className="grid gap-4">
      <section className="card p-4 sm:p-5" aria-labelledby="afford-card-title">
        <h2 id="afford-card-title" className="text-base font-semibold text-ink">Can I afford it?</h2>
        <p className="mb-4 mt-1 text-sm text-muted">Pick a plan or type an amount.</p>
        {hasAccounts ? (
          <AffordIt
            snapshot={snapshot}
            today={today}
            nextPayday={model.nextPayday}
            events={model.planned}
            calendarIncomplete={model.coverage.incomplete}
            presets={presets}
            cta={demo ? { href: "/login?mode=signup", label: "Create your own →" } : null}
            note={demo ? "Sample budget. Protected goals are never suggested." : "Uses your real balances, bills and calendar. Protected goals are never suggested."}
          />
        ) : (
          <EmptyState title="Add a cash account first">The checker needs a checking balance to work from.</EmptyState>
        )}
      </section>
      <PurchasePlanner snapshot={snapshot} input={input} today={today} />
      <ScenarioBuilder snapshot={snapshot} input={input} today={today} />
    </div>
  );
}

function PurchasePlanner({ snapshot, input, today }: { snapshot: Snapshot; input: ReturnType<typeof toEngineInput>; today: ISODate }) {
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today);
  const [payWith, setPayWith] = useState("");
  const [allowProtected, setAllowProtected] = useState(false);
  const cents = parseDollars(amount);
  const amountError = amount && (cents == null || cents <= 0) ? "Enter a price like 899.99." : null;
  const dateError = !isISODate(date) || date < today ? "Choose today or a future date." : null;
  const plan = useMemo(() => {
    if (!cents || cents <= 0 || dateError) return null;
    return planPurchase(input, { label: label || "Big purchase", amountCents: cents, date, paymentAccountId: payWith || null, allowProtected });
  }, [input, label, cents, date, payWith, allowProtected, dateError]);
  const payOptions = snapshot.accounts.filter((a) => !a.archived && (a.isSpendable || a.kind === "credit_card"));

  return (
    <Card title="Plan a big purchase in detail" id="purchase">
      <p className="mb-3 text-sm text-muted">What it takes from savings, and how long to rebuild.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label htmlFor="p-label" className="text-sm font-medium">What is it?</label>
          <input id="p-label" className="input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="New laptop" maxLength={80} />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="p-amount" className="text-sm font-medium">Price</label>
          <input id="p-amount" className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" aria-invalid={amountError ? true : undefined} aria-describedby={amountError ? "p-amount-err" : undefined} />
          {amountError && <p id="p-amount-err" className="text-xs text-danger">{amountError}</p>}
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="p-date" className="text-sm font-medium">When</label>
          <input id="p-date" type="date" className="input" value={date} min={today} onChange={(e) => setDate(e.target.value)} aria-invalid={dateError ? true : undefined} aria-describedby={dateError ? "p-date-err" : undefined} />
          {dateError && <p id="p-date-err" className="text-xs text-danger">{dateError}</p>}
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="p-pay" className="text-sm font-medium">Pay with</label>
          <select id="p-pay" className="input" value={payWith} onChange={(e) => setPayWith(e.target.value)}>
            <option value="">Main checking</option>
            {payOptions.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
        <label className="flex items-start gap-3 sm:col-span-2">
          <input type="checkbox" className="mt-1 h-5 w-5 accent-[var(--color-brand)]" checked={allowProtected} onChange={(e) => setAllowProtected(e.target.checked)} />
          <span className="text-sm">
            Allow using protected savings (like the wedding fund)
            <span className="block text-xs text-faint">Off by default. Protected goals are only ever suggested when you turn this on.</span>
          </span>
        </label>
      </div>

      {!plan ? (
        <p className="mt-4 text-sm text-faint">Enter a price to see the plan.</p>
      ) : (
        <div className="mt-4 space-y-3" aria-live="polite">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={VERDICT[plan.verdict].tone}>{VERDICT[plan.verdict].label}</Badge>
            <p className="text-sm text-ink">{plan.summary}</p>
          </div>
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div className="rounded-xl bg-surface-2/60 p-2.5"><dt className="text-xs text-faint">Lowest cash now</dt><dd className="font-semibold"><Money cents={plan.baseline.lowestCents} /></dd><dd className="text-xs text-muted">{formatShort(plan.baseline.lowestDate)}</dd></div>
            <div className="rounded-xl bg-surface-2/60 p-2.5"><dt className="text-xs text-faint">Lowest with purchase</dt><dd className="font-semibold"><Money cents={plan.withPurchase.lowestCents} /></dd><dd className="text-xs text-muted">{formatShort(plan.withPurchase.lowestDate)}</dd></div>
            <div className="rounded-xl bg-surface-2/60 p-2.5"><dt className="text-xs text-faint">Daily allowance now</dt><dd className="font-semibold"><Money cents={plan.baseline.dailyAllowanceCents} /></dd></div>
            <div className="rounded-xl bg-surface-2/60 p-2.5"><dt className="text-xs text-faint">With purchase</dt><dd className="font-semibold"><Money cents={plan.withPurchase.dailyAllowanceCents} /></dd></div>
          </dl>
          {plan.shortfallCents > 0 && (
            <div>
              <h3 className="text-sm font-semibold">Savings ammo: <Money cents={plan.shortfallCents} /> needed</h3>
              <ul className="mt-1 space-y-1 text-sm">
                {plan.sources.map((s) => (
                  <li key={s.accountId} className="flex flex-wrap justify-between gap-2">
                    <span>{s.name} {s.protected && <Badge>Protected{s.goalName ? ` · ${s.goalName}` : ""}</Badge>} <span className="text-xs text-faint">(<Money cents={s.availableCents} /> available)</span></span>
                    <span>{s.useCents > 0 ? <>use <Money cents={s.useCents} className="font-semibold" /></> : <span className="text-faint">not used</span>}</span>
                  </li>
                ))}
                {plan.sources.length === 0 && <li className="text-muted">No savings accounts with money available.</li>}
              </ul>
            </div>
          )}
          {plan.rebuild.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold">Rebuilding savings afterwards</h3>
              <ul className="mt-1 grid gap-2 sm:grid-cols-3">
                {plan.rebuild.map((r) => (
                  <li key={r.months} className={`rounded-xl border p-2.5 text-sm ${r.feasible ? "border-line" : "border-warn/50"}`}>
                    <p className="font-medium">{r.months} months</p>
                    <p><Money cents={r.monthlyCents} />/month</p>
                    <p className="text-xs text-muted">≈ <Money cents={r.dailyImpactCents} /> less per day · done by {formatShort(r.doneBy)}</p>
                    {!r.feasible && <p className="text-xs text-warn">More than your current daily allowance</p>}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <ol className="list-decimal space-y-1 pl-5 text-sm text-muted">{plan.steps.map((s) => <li key={s}>{s}</li>)}</ol>
          <ActionForm action={recordDecision} aria-label="Save this decision">
            <input type="hidden" name="subjectType" value="purchase" />
            <input type="hidden" name="subjectId" value={label || "Big purchase"} />
            <input type="hidden" name="detail" value={JSON.stringify({ amountCents: cents, date, verdict: plan.verdict, shortfallCents: plan.shortfallCents, steps: plan.steps })} />
            <div className="flex flex-wrap gap-2">
              <Submit variant="secondary" name="decision" value="go_ahead_with_plan">I'll do this plan</Submit>
              <Submit variant="secondary" name="decision" value="wait">I'll wait</Submit>
              <Submit variant="secondary" name="decision" value="skip">I'll skip it</Submit>
            </div>
          </ActionForm>
          <p className="text-xs text-faint">Moves between accounts aren't made for you. Add the transfer under Activity when you make it.</p>
        </div>
      )}
    </Card>
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
