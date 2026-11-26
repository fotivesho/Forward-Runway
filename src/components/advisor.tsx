"use client";

import Link from "next/link";
import { useContext } from "react";
import { correctEvent, saveRule, saveTransaction, setEventDuplicate, updateBalance } from "@/app/app/actions";
import { formatShort, type ISODate } from "@/lib/dates";
import type { Account } from "@/lib/engine";
import type { EventView, Question } from "@/lib/view/dashboard";
import { ActionForm, DemoCtx, Field, MoneyField, QuickAction, SelectField, Submit } from "./form";
import { Money } from "./privacy";
import { Badge, Disclosure } from "./ui";
import { LOOK, PlanImpact } from "./afford-result";
import { EditPlanButton } from "./calendar-forms";

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
      <h2 id="question-title" className="mt-1 text-lg font-semibold text-ink">
        {question.text}
      </h2>
      <p className="mt-1 text-sm text-muted">{question.why} Until then, the forecast is marked incomplete and uses the assumptions listed below it.</p>
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
          hint="Card purchases are paid later with the statement — never counted twice."
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
  const { event, estimate, advice, duplicate, check } = view;
  const needs = !duplicate && estimate.needsInput && event.capCents == null;
  const cents = advice?.capCents ?? estimate.cents;
  const badge = needs ? (
    <Badge tone="warn">Needs a cost</Badge>
  ) : check && !advice?.userDecided ? (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium ${LOOK[check.verdict].badge}`}>
      {LOOK[check.verdict].icon} {check.verdict === "yes" ? "Fits" : check.verdict === "yes_with_plan" ? "With a plan" : "Not yet"}
    </span>
  ) : advice && !duplicate ? (
    <Badge tone={REC_TONE[advice.recommendation]}>{advice.userDecided ? "Your call: " : ""}{REC_LABEL[advice.recommendation]}</Badge>
  ) : duplicate ? (
    <Badge tone="info">Duplicate?</Badge>
  ) : null;
  return (
    <li className="list-none">
      <details className="group rounded-xl border border-line bg-surface-2/40">
        <summary className="flex cursor-pointer list-none items-center gap-3 px-3 py-2.5 [&::-webkit-details-marker]:hidden">
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium text-ink">{event.title}</span>
            <span className="block text-xs text-muted">
              {formatShort(event.date)}
              {!needs && cents > 0 && <> · <Money cents={cents} whole /></>}
              {event.missingFromFeed && " · removed from calendar"}
            </span>
          </span>
          {badge}
          <span aria-hidden className="text-faint transition group-open:rotate-90">›</span>
        </summary>
        <div className="border-t border-line px-3 pb-3 pt-2">
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
              <p className="text-xs text-muted">
                {needs ? "No cost yet." : <>Estimate <Money cents={estimate.cents} whole /> · cap <Money cents={advice?.capCents ?? 0} whole /> · {SOURCE_LABEL[estimate.source] ?? estimate.basis}</>}
                {advice?.suggestedDate && <> · try after {formatShort(advice.suggestedDate)}</>}
              </p>
              {check ? <PlanImpact check={check} reservedCents={advice?.capCents ?? 0} /> : advice && <p className="mt-2 text-sm text-muted">{advice.reason}</p>}
              <div className="mt-2 flex justify-end">
                <EditPlanButton view={view} />
              </div>
            </>
          )}
        </div>
      </details>
    </li>
  );
}
