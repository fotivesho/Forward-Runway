"use client";

import Link from "next/link";
import { useContext, useMemo, useState } from "react";
import { applyPlanOption, correctEvent, saveRule, saveTransaction, setEventDuplicate, updateBalance } from "@/app/app/actions";
import { formatShort, type ISODate } from "@/lib/dates";
import { previewOption, type Account } from "@/lib/engine";
import { toEngineInput } from "@/lib/data/snapshot";
import type { EventView, Question } from "@/lib/view/dashboard";
import { ActionForm, DemoCtx, Field, MoneyField, QuickAction, SelectField, Submit } from "./form";
import { Money } from "./privacy";
import { StatusPill, Disclosure } from "./ui";
import { LOOK, PlanImpact } from "./afford-result";
import { Info } from "./info";
import { Check, Pencil } from "lucide-react";
import { Modal } from "./modal";
import { EstimateLine } from "./estimate-ui";
import { estimatePlan, readTitle } from "@/lib/view/estimate";
import { exploreData } from "@/lib/view/explore";
import { biasByCategory } from "@/lib/view/actuals";
import { EditPlanButton, PlanCtx } from "./calendar-forms";

export const SPEND_CATEGORIES = ["Dining", "Groceries", "Coffee", "Shopping", "Transport", "Entertainment", "Gifts", "Personal care", "Health", "Travel", "Celebrations", "Home", "Other"];

const REC_LABEL = { proceed: "Go ahead", cheaper: "Cheaper version", postpone: "Postpone", skip: "Skip" } as const;
const REC_TONE = { proceed: "good", cheaper: "warn", postpone: "info", skip: "bad" } as const;

const SOURCE_LABEL: Record<string, string> = {
  your_correction: "Confirmed by you",
  similar_correction: "From a similar event you corrected",
  your_history: "From your spending history",
  typical: "Typical cost (estimate)",
  not_spending: "Not a spending event",
  unknown: "Needs your estimate",
};

export function QuestionCard({ question, accounts, today }: { question: Question; accounts: Account[]; today: ISODate }) {
  const base = useContext(DemoCtx) ? "/demo" : "/app";
  const account = accounts.find((a) => a.id === question.accountId);
  const cash = accounts.find((a) => a.isSpendable && a.kind !== "credit_card" && a.kind !== "loan");
  return (
    <section aria-labelledby="question-title" className="card border-warn/50 p-4 sm:p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-warn">One question</p>
      <h2 id="question-title" className="mt-1 text-lg font-bold text-ink">
        {question.text}
        <Info label="Why we ask">{question.why} Until you answer, we fill the gap with a careful guess, and the forecast shows as incomplete.</Info>
      </h2>
      <div className="mt-3">
        {question.kind === "balance" && account && (
          <ActionForm action={updateBalance} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end" aria-label={`Update ${account.name} balance`}>
            <input type="hidden" name="accountId" value={account.id} />
            <MoneyField name="balance" label={account.kind === "credit_card" ? "Amount owed" : "Current balance"} required />
            <Field name="balanceAsOf" type="date" label="As of (start of day)" defaultValue={today} required />
            <Submit>Save</Submit>
          </ActionForm>
        )}
        {question.kind === "income" && cash && (
          <ActionForm action={saveRule} className="grid gap-3 sm:grid-cols-2" aria-label="Add your paycheck">
            <input type="hidden" name="kind" value="income" />
            <input type="hidden" name="accountId" value={cash.id} />
            <Field name="name" label="Name" defaultValue="Paycheck" required />
            <MoneyField name="amount" label="Take-home amount" required />
            <Field name="startDate" type="date" label="Next payday" defaultValue={today} required />
            <SelectField
              name="frequency"
              label="How often"
              defaultValue="biweekly"
              options={[
                { value: "weekly", label: "Every week" },
                { value: "biweekly", label: "Every 2 weeks" },
                { value: "semimonthly", label: "Twice a month (1st & 15th)" },
                { value: "monthly", label: "Monthly" },
              ]}
            />
            <input type="hidden" name="weekendAdjust" value="before" />
            <div className="sm:col-span-2">
              <Submit>Add payday</Submit>
            </div>
          </ActionForm>
        )}
        {question.kind === "event_estimate" && question.eventId && (
          <ActionForm action={correctEvent} className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end" aria-label="Estimate the cost">
            <input type="hidden" name="eventId" value={question.eventId} />
            <input type="hidden" name="rememberForSimilar" value="on" />
            <MoneyField name="estimate" label="Expected cost" hint="Enter 0 if it won't cost anything." required />
            <Submit>Save estimate</Submit>
          </ActionForm>
        )}
        {(question.kind === "card" || question.kind === "statement" || question.kind === "goal" || question.kind === "other" || (question.kind === "balance" && !account) || (question.kind === "income" && !cash)) && (
          <Link className="btn btn-primary" href={base + (question.kind === "income" ? "/spend" : "/accounts")}>
            Answer this
          </Link>
        )}
      </div>
    </section>
  );
}

export function QuickLog({ accounts, today }: { accounts: Account[]; today: ISODate }) {
  const payWith = accounts.filter((a) => !a.archived && (a.isSpendable || a.kind === "credit_card"));
  if (payWith.length === 0) return null;
  return (
    <Disclosure summary="Log spending">
      <ActionForm action={saveTransaction} resetOnSuccess className="grid gap-3 sm:grid-cols-2" aria-label="Log spending">
        <input type="hidden" name="direction" value="out" />
        <input type="hidden" name="status" value="posted" />
        <input type="hidden" name="flexible" value="on" />
        <MoneyField name="amount" label="Amount" required />
        <Field name="description" label="What for" placeholder="Lunch" required maxLength={120} />
        <SelectField name="category" label="Category" options={SPEND_CATEGORIES.map((c) => ({ value: c, label: c }))} />
        <SelectField
          name="accountId"
          label="Paid with"
          hint="Paying by card? The money leaves checking later, when you pay the card bill. We count it once, on that day."
          options={payWith.map((a) => ({ value: a.id, label: a.name }))}
        />
        <Field name="date" type="date" label="Date" defaultValue={today} required />
        <div className="flex items-end">
          <Submit className="w-full">Log it</Submit>
        </div>
      </ActionForm>
    </Disclosure>
  );
}

/**
 * One plan, collapsed to a single line: what, when, how much, and the verdict.
 * Tap to see the full answer and change it.
 */
export function EventCard({ view }: { view: EventView; accounts?: Account[] }) {
  const { event, estimate, advice, duplicate } = view;
  const savedCredit = !!view.creditCardId && event.paymentAccountId === view.creditCardId;
  const [credit, setCredit] = useState(savedCredit);
  const [open, setOpen] = useState(false);
  const planCtx = useContext(PlanCtx);
  // Smart estimate for this plan: kind and people from its title, your history, and how your past plans went.
  const smart = useMemo(() => {
    if (!planCtx || duplicate || estimate.source === "not_spending") return null;
    const f = readTitle(event.title, event.category);
    const x = exploreData(planCtx.snapshot, planCtx.today);
    return estimatePlan(f, x, biasByCategory(planCtx.snapshot, planCtx.today)[f.category] ?? 1);
  }, [planCtx, event.title, event.category, duplicate, estimate.source]);
  const check = view.checkCredit && credit ? view.checkCredit : (view.checkDebit ?? view.check);
  const saved = view.check;
  const other = credit ? view.checkDebit : view.checkCredit;
  const rank = { yes: 0, yes_with_plan: 1, not_yet: 2 } as const;
  const betterOther = other && check && rank[other.verdict] < rank[check.verdict];
  const needs = !duplicate && estimate.needsInput && event.capCents == null;
  const cents = check ? view.plannedCents : (advice?.capCents ?? estimate.cents);
  const verdictLabel = saved ? (saved.verdict === "yes" ? (saved.headline === "Yes, it's already planned." ? "Covered" : "You're good") : saved.verdict === "yes_with_plan" ? "Doable" : "Not yet") : "";
  const badge = needs ? (
    <StatusPill tone="info">Needs a cost</StatusPill>
  ) : saved && !advice?.userDecided ? (
    <StatusPill tone={saved.verdict === "yes" ? "good" : saved.verdict === "yes_with_plan" ? "warn" : "bad"}>{verdictLabel}</StatusPill>
  ) : advice && !duplicate ? (
    <StatusPill tone={({ good: "good", warn: "warn", bad: "bad", info: "info", neutral: "neutral" } as const)[REC_TONE[advice.recommendation] as "good"] ?? "neutral"}>{advice.userDecided ? "✓ " : ""}{REC_LABEL[advice.recommendation]}</StatusPill>
  ) : duplicate ? (
    <StatusPill tone="neutral">Duplicate?</StatusPill>
  ) : null;
  return (
    <li className="list-none">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className={`flex w-full items-center gap-3 rounded-xl border border-l-4 border-line bg-surface-2/40 px-3 py-2.5 text-left transition hover:bg-surface-2 ${needs ? "border-l-info" : saved ? { yes: "border-l-brand", yes_with_plan: "border-l-warn", not_yet: "border-l-danger" }[saved.verdict] : "border-l-line"}`}
      >
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold leading-snug text-ink/85 [overflow-wrap:anywhere]">{event.title}</span>
            <span className="block text-base font-bold tabular text-ink">
              {!needs && cents > 0 && <><Money cents={cents} whole /> · </>}

              {formatShort(event.date)}
              {event.missingFromFeed && <span className="text-xs font-normal text-faint"> · removed from calendar</span>}
            </span>
            {smart && <span className="block text-[11px] text-faint">likely <Money cents={smart.low} whole />–<Money cents={smart.high} whole /></span>}
          </span>
          {badge}
          <span aria-hidden className="text-faint">›</span>
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        icon="plan"
        title={event.title}
        subtitle={<span className="flex flex-wrap items-center gap-2">{formatShort(event.date)}{!needs && cents > 0 && <> · <Money cents={cents} whole className="font-semibold text-ink" /></>} {badge}</span>}
      >
        <div>
          {duplicate ? (
            <>
              <p className="text-sm text-ink">Same as “{duplicate.ofTitle}”? Counted once.</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <QuickAction action={setEventDuplicate} fields={{ id: event.id, other: duplicate.ofId, verdict: "duplicate" }} variant="secondary">Same, hide it</QuickAction>
                <QuickAction action={setEventDuplicate} fields={{ id: event.id, other: duplicate.ofId, verdict: "different" }} variant="ghost">Different</QuickAction>
              </div>
            </>
          ) : (
            <>
              {!needs && <PlanAmount view={view} />}
              {smart && (
                <div className="mb-3">
                  <EstimateLine e={smart} />
                  {Math.abs(smart.cents - view.plannedCents) >= Math.max(500, view.plannedCents * 0.1) && (
                    <div className="mt-2 flex items-center justify-between gap-2 text-xs text-muted">
                      <span>Planned at <Money cents={view.plannedCents} whole className="font-semibold text-ink" /></span>
                      <ActionForm action={correctEvent} demoPreview demoNote={false} aria-label="Use the estimate">
                        <input type="hidden" name="eventId" value={event.id} />
                        <input type="hidden" name="estimate" value={String(smart.cents / 100)} />
                        <Submit variant="secondary" className="btn-sm">Use ~${Math.round(smart.cents / 100)}</Submit>
                      </ActionForm>
                    </div>
                  )}
                </div>
              )}
              <p className="flex flex-wrap gap-1.5 text-[11px]">
                {needs ? (
                  <span className="rounded-full bg-info/15 px-2 py-0.5 text-info">No cost yet</span>
                ) : (
                  <>
                    {(advice?.capCents ?? 0) > 0 && <span className="text-faint">Cap <Money cents={advice!.capCents} whole /> ·</span>}
                    <span className="text-faint" title={estimate.basis}>{SOURCE_LABEL[estimate.source] ?? "Estimate"}</span>
                  </>
                )}
                {!check && advice?.suggestedDate && <span className="rounded-full bg-info/15 px-2 py-0.5 text-info">Try after {formatShort(advice.suggestedDate)}</span>}
              </p>
              {advice?.userDecided && (event.decision === "proceed" || event.decision === "cheaper" || event.decision === "skip") && (
                <PlanSetSummary view={view} />
              )}
              {check && view.checkCredit && !advice?.userDecided && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium text-muted">Pay with</span>
                  <div className="flex rounded-lg border border-line p-0.5" role="group" aria-label="Pay with">
                    {[false, true].map((c) => (
                      <button key={String(c)} type="button" onClick={() => setCredit(c)} aria-pressed={credit === c}
                        className={`min-h-8 rounded-md px-3 text-xs font-semibold ${credit === c ? "bg-brand text-brand-ink" : "text-muted"}`}>
                        {c ? "Credit" : "Debit"}
                      </button>
                    ))}
                  </div>
                  {betterOther && (
                    <button type="button" onClick={() => setCredit(!credit)} className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${LOOK[other!.verdict].badge}`}>
                      {LOOK[other!.verdict].icon} {other!.verdict === "yes" ? "You're good" : "Doable"} on {credit ? "debit" : "credit"}
                    </button>
                  )}
                </div>
              )}
              {check && !advice?.userDecided ? (
                <PlanImpact
                  check={check}
                  reservedCents={advice?.capCents ?? 0}
                  eventId={event.id}
                  payWith={view.checkCredit ? (credit ? view.creditCardId : null) : undefined}
                  preview={planCtx ? (o) => previewOption(
                    { input: toEngineInput(planCtx.snapshot, planCtx.today), events: planCtx.events, calendarIncomplete: planCtx.calendarIncomplete, nextPayday: planCtx.nextPayday },
                    { amountCents: view.plannedCents, date: event.date, paymentAccountId: view.checkCredit && credit ? view.creditCardId : null, reservedCents: advice?.capCents ?? 0 },
                    o,
                  ) : undefined}
                />
              ) : (
                !advice?.userDecided && advice && <p className="mt-2 text-sm text-muted">{advice.reason}</p>
              )}
              {check && check.verdict === "yes" && view.checkCredit && credit !== savedCredit && (
                <div className="mt-2 flex justify-end">
                  <QuickAction action={applyPlanOption} fields={{ eventId: event.id, kind: "go", apply: JSON.stringify({ paymentAccountId: credit ? view.creditCardId : null }) }} variant="primary">
                    Pay with {credit ? "credit" : "debit"}
                  </QuickAction>
                </div>
              )}
              <div className="mt-2 flex justify-end">
                <EditPlanButton view={view} />
              </div>
            </>
          )}
        </div>
      </Modal>
    </li>
  );
}

/** A plan you've decided on: what was set up for it, and Undo. */
function PlanSetSummary({ view }: { view: EventView }) {
  const ctx = useContext(PlanCtx);
  const { event, advice } = view;
  const moves = (ctx?.snapshot.transfers ?? []).filter((t) => t.status === "planned" && t.note === `For ${event.title.slice(0, 100)}`);
  const card = ctx?.snapshot.accounts.find((a) => a.id === event.paymentAccountId && a.kind === "credit_card");
  const skipped = event.decision === "skip";
  return (
    <div className={`mt-2 rounded-xl border p-3 ${skipped ? "border-line bg-surface-2" : "border-brand/50 bg-brand/[0.08]"}`}>
      <p className={`text-base font-bold ${skipped ? "text-ink" : "text-brand"}`}>{skipped ? "Plan skipped" : "✓ Plan set"}</p>
      <ul className="mt-1 space-y-0.5 text-sm text-ink">
        {skipped && <li>• Its money is back in everyday spending</li>}
        {!skipped && <li>• Paying with {card ? card.name : "debit"}</li>}
        {moves.map((t) => (
          <li key={t.id}>• <Money cents={t.amountCents} whole /> from savings on {formatShort(t.date)}</li>
        ))}
        {event.decision === "cheaper" && advice && <li>• Capped at <Money cents={advice.capCents} whole /></li>}
        {view.check && !skipped && <li className="text-xs text-muted">Now: {view.check.verdict === "yes" ? "you're good" : view.check.verdict === "yes_with_plan" ? "still tight" : "still short"}</li>}
      </ul>
      <div className="mt-2 flex justify-end">
        <QuickAction action={applyPlanOption} fields={{ eventId: event.id, kind: "undo" }} variant="ghost" confirm="Undo? This removes the savings moves planned for it and goes back to the suggestion.">Undo</QuickAction>
      </div>
    </div>
  );
}

/** The planned amount, tap to set your own (it then counts everywhere instead of the estimate). */
function PlanAmount({ view }: { view: EventView }) {
  const [edit, setEdit] = useState(false);
  const e = view.event;
  if (!edit)
    return (
      <button type="button" onClick={() => setEdit(true)} className="mb-3 flex w-full items-center justify-between gap-2 rounded-xl border border-line px-3 py-2 text-left transition hover:bg-surface-2" aria-label="Change the planned amount">
        <span className="text-xs text-muted">Planned{e.estimateConfirmed ? " · set by you" : ""}</span>
        <span className="flex items-center gap-1.5 font-num text-xl text-ink"><Money cents={view.plannedCents} whole /><Pencil size={13} strokeWidth={2.4} className="text-faint" aria-hidden /></span>
      </button>
    );
  return (
    <ActionForm action={correctEvent} demoPreview demoNote={false} onSuccess={() => setEdit(false)} className="mb-3 flex items-end gap-2 rounded-xl border border-brand/40 px-3 py-2" aria-label="Set the planned amount">
      <input type="hidden" name="eventId" value={e.id} />
      {e.decision && <input type="hidden" name="decision" value={e.decision} />}
      {e.essential && <input type="hidden" name="essential" value="on" />}
      {e.paymentAccountId && <input type="hidden" name="paymentAccountId" value={e.paymentAccountId} />}
      <div className="min-w-0 flex-1"><MoneyField name="estimate" label="Planned amount" defaultValue={String(Math.round(view.plannedCents / 100))} autoFocus required /></div>
      <Submit className="btn-sm" aria-label="Save amount"><Check size={15} strokeWidth={2.6} aria-hidden /></Submit>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEdit(false)}>Cancel</button>
    </ActionForm>
  );
}
