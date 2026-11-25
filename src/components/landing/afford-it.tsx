"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { addDays, dayOfWeek, formatShort, type ISODate } from "@/lib/dates";
import { formatCents, parseDollars } from "@/lib/money";
import { planPurchase } from "@/lib/engine";
import { toEngineInput, type Snapshot } from "@/lib/data/snapshot";

const PRESETS = [
  { label: "Concert tickets", cents: 18_000, emoji: "🎟️" },
  { label: "Weekend trip", cents: 65_000, emoji: "🏕️" },
  { label: "New laptop", cents: 240_000, emoji: "💻" },
  { label: "Car repair", cents: 120_000, emoji: "🔧" },
];

const VERDICT = {
  fits: { text: "Yes, it fits.", tone: "text-brand", chip: "border-brand/40 bg-brand/10 text-brand" },
  fits_with_savings: { text: "Yes, with a little help from savings.", tone: "text-warn", chip: "border-warn/40 bg-warn/10 text-warn" },
  needs_protected_savings: { text: "Only by dipping into protected savings.", tone: "text-warn", chip: "border-warn/40 bg-warn/10 text-warn" },
  not_covered: { text: "Not this month — and here's why.", tone: "text-danger", chip: "border-danger/40 bg-danger/10 text-danger" },
} as const;

export function AffordIt({ snapshot, today, nextPayday }: { snapshot: Snapshot; today: ISODate; nextPayday: ISODate | null }) {
  const input = useMemo(() => toEngineInput(snapshot, today), [snapshot, today]);
  const card = snapshot.accounts.find((a) => a.kind === "credit_card");
  const saturday = addDays(today, (6 - dayOfWeek(today) + 7) % 7 || 7);
  const whenOptions: Array<{ id: string; label: string; date: ISODate }> = [
    { id: "today", label: "Today", date: today },
    { id: "weekend", label: `This weekend (${formatShort(saturday)})`, date: saturday },
    ...(nextPayday ? [{ id: "payday", label: `After payday (${formatShort(addDays(nextPayday, 1))})`, date: addDays(nextPayday, 1) }] : []),
  ];
  const [amount, setAmount] = useState("180");
  const [when, setWhen] = useState(whenOptions[1]!.id);
  const [onCard, setOnCard] = useState(false);
  const cents = parseDollars(amount);
  const date = whenOptions.find((w) => w.id === when)?.date ?? today;
  const plan = useMemo(
    () => (cents && cents > 0 && cents <= 5_000_000 ? planPurchase(input, { label: "Purchase", amountCents: cents, date, paymentAccountId: onCard ? card?.id : null }) : null),
    [input, cents, date, onCard, card?.id],
  );
  const v = plan ? VERDICT[plan.verdict] : null;
  const moved = plan?.sources.filter((s) => s.useCents > 0) ?? [];
  const rebuild = plan?.rebuild.find((r) => r.feasible) ?? plan?.rebuild[0];

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <div className="card p-5">
        <p className="text-sm font-medium text-ink">Pick something, or type any amount</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {PRESETS.map((p) => {
            const active = cents === p.cents;
            return (
              <button
                key={p.label}
                type="button"
                onClick={() => setAmount(String(p.cents / 100))}
                aria-pressed={active}
                className={`flex min-h-14 items-center gap-2 rounded-xl border px-3 text-left text-sm transition ${active ? "border-brand bg-brand/10 text-ink" : "border-line bg-surface-2/60 text-muted hover:border-brand/60 hover:text-ink"}`}
              >
                <span aria-hidden className="text-xl">{p.emoji}</span>
                <span>
                  <span className="block font-medium text-ink">{p.label}</span>
                  <span className="tabular">{formatCents(p.cents)}</span>
                </span>
              </button>
            );
          })}
        </div>
        <label htmlFor="afford-amount" className="mt-4 block text-sm font-medium text-ink">Amount</label>
        <div className="relative mt-1">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">$</span>
          <input id="afford-amount" className="input pl-7 text-lg font-semibold tabular" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} aria-describedby="afford-hint" />
        </div>
        <p id="afford-hint" className="mt-1 text-xs text-faint">{cents == null || cents <= 0 ? "Enter an amount like 250." : " "}</p>
        <fieldset className="mt-3">
          <legend className="text-sm font-medium text-ink">When</legend>
          <div className="mt-1 flex flex-wrap gap-2">
            {whenOptions.map((w) => (
              <button key={w.id} type="button" onClick={() => setWhen(w.id)} aria-pressed={when === w.id}
                className={`min-h-10 rounded-full border px-3 text-sm ${when === w.id ? "border-brand bg-brand text-brand-ink" : "border-line text-muted hover:text-ink"}`}>
                {w.label}
              </button>
            ))}
          </div>
        </fieldset>
        {card && (
          <fieldset className="mt-3">
            <legend className="text-sm font-medium text-ink">Pay with</legend>
            <div className="mt-1 flex flex-wrap gap-2">
              {[["Debit / checking", false], [card.name, true]].map(([label, val]) => (
                <button key={String(label)} type="button" onClick={() => setOnCard(val as boolean)} aria-pressed={onCard === val}
                  className={`min-h-10 rounded-full border px-3 text-sm ${onCard === val ? "border-brand bg-brand text-brand-ink" : "border-line text-muted hover:text-ink"}`}>
                  {String(label)}
                </button>
              ))}
            </div>
          </fieldset>
        )}
      </div>

      <div className="card relative overflow-hidden p-5" aria-live="polite">
        {!plan || !v ? (
          <p className="text-muted">Enter an amount to see the answer.</p>
        ) : (
          <>
            <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${v.chip}`}>
              {formatCents(cents!)} on {formatShort(date)}
            </span>
            <p className={`font-display mt-3 text-3xl leading-tight sm:text-4xl ${v.tone}`}>{v.text}</p>
            <dl className="mt-5 grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-surface-2/70 p-3">
                <dt className="text-xs text-faint">Daily spending allowance</dt>
                <dd className="mt-1 text-lg font-semibold tabular text-ink">
                  {formatCents(plan.baseline.dailyAllowanceCents)} <span className="text-faint">→</span> {formatCents(plan.withPurchase.dailyAllowanceCents)}
                </dd>
              </div>
              <div className="rounded-xl bg-surface-2/70 p-3">
                <dt className="text-xs text-faint">Lowest balance ahead</dt>
                <dd className="mt-1 text-lg font-semibold tabular text-ink">
                  {formatCents(plan.withPurchase.lowestCents)} <span className="text-xs font-normal text-muted">on {formatShort(plan.withPurchase.lowestDate)}</span>
                </dd>
              </div>
            </dl>
            {moved.length > 0 && (
              <div className="mt-4 rounded-xl border border-warn/40 bg-warn/5 p-3 text-sm">
                <p className="font-semibold text-ink">Savings ammo: {formatCents(plan.shortfallCents)}</p>
                <p className="mt-1 text-muted">
                  Move {moved.map((m) => `${formatCents(m.useCents)} from ${m.name}`).join(" and ")} by {formatShort(plan.transferDate!)}.
                  {rebuild && <> Rebuild it with {formatCents(rebuild.monthlyCents)}/month, done by {formatShort(rebuild.doneBy)}.</>}
                </p>
                <p className="mt-1 text-xs text-faint">The wedding fund is protected: it's never suggested unless you allow it.</p>
              </div>
            )}
            {plan.verdict === "not_covered" && (
              <p className="mt-4 text-sm text-muted">{plan.summary}</p>
            )}
            {plan.cardNote && <p className="mt-4 text-sm text-muted">{plan.cardNote}</p>}
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Link href="/demo/what-if" className="btn btn-primary">Plan it in the demo →</Link>
              <span className="text-xs text-faint">Live math on a sample budget. Yours uses your real numbers.</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
