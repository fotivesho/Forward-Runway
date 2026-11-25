"use client";

import Link from "next/link";
import { useContext } from "react";
import { correctEvent, saveRule, saveTransaction, setEventDuplicate, updateBalance } from "@/app/app/actions";
import { formatLong, formatShort, type ISODate } from "@/lib/dates";
import { centsToInput } from "@/lib/money";
import type { Account } from "@/lib/engine";
import type { EventView, Question } from "@/lib/view/dashboard";
import { ActionForm, CheckboxField, DemoCtx, Field, MoneyField, QuickAction, SelectField, Submit } from "./form";
import { Money } from "./privacy";
import { Badge, Disclosure } from "./ui";

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
          <Link className="btn btn-primary" href={base + (question.kind === "income" ? "/plans" : "/accounts")}>
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

export function EventCard({ view, accounts }: { view: EventView; accounts: Account[] }) {
  const demo = useContext(DemoCtx);
  const { event, estimate, advice, duplicate } = view;
  const payWith = accounts.filter((a) => !a.archived && (a.isSpendable || a.kind === "credit_card"));
  return (
    <li className="rounded-xl border border-line bg-surface-2/40 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium text-ink">{event.title}</p>
          <p className="text-xs text-muted">
            {formatLong(event.date)} · {view.sourceName}
            {event.missingFromFeed && " · no longer on the calendar"}
          </p>
        </div>
        {advice && !duplicate && estimate.needsInput && event.capCents == null ? (
          <Badge tone="warn">Needs estimate</Badge>
        ) : advice && !duplicate && (
          <Badge tone={REC_TONE[advice.recommendation]}>
            {advice.userDecided ? "Your call: " : ""}
            {REC_LABEL[advice.recommendation]}
          </Badge>
        )}
      </div>

      {duplicate ? (
        <div className="mt-2 rounded-lg border border-info/40 bg-info/5 p-2 text-sm">
          <p className="text-ink">Likely duplicate of “{duplicate.ofTitle}”.</p>
          <p className="text-xs text-muted">{duplicate.reason}. It's counted once in your caps.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <QuickAction action={setEventDuplicate} fields={{ id: event.id, other: duplicate.ofId, verdict: "duplicate" }} variant="secondary">
              Same event — hide it
            </QuickAction>
            <QuickAction action={setEventDuplicate} fields={{ id: event.id, other: duplicate.ofId, verdict: "different" }} variant="ghost">
              Different events
            </QuickAction>
          </div>
        </div>
      ) : (
        <>
          <dl className="mt-2 grid grid-cols-2 gap-2 text-sm">
            <div>
              <dt className="text-xs text-faint">Estimated cost</dt>
              <dd>
                {estimate.needsInput && event.capCents == null ? <span className="text-warn">Unknown</span> : <Money cents={estimate.cents} className="font-semibold" />}
                <span className="block text-xs text-faint">{SOURCE_LABEL[estimate.source] ?? estimate.basis}</span>
              </dd>
            </div>
            <div>
              <dt className="text-xs text-faint">Suggested cap</dt>
              <dd>
                {advice ? <Money cents={advice.capCents} className="font-semibold" /> : <span className="text-faint">Outside this forecast</span>}
                {advice?.suggestedDate && <span className="block text-xs text-info">Try on or after {formatShort(advice.suggestedDate)}</span>}
              </dd>
            </div>
          </dl>
          {advice && <p className="mt-2 text-sm text-muted">{advice.reason}</p>}
          {advice && advice.impacts.length > 0 && (
            <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-muted">
              {advice.impacts.map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
          )}
          {!demo && (
            <div className="mt-3">
              <Disclosure summary="Correct or decide">
                <ActionForm action={correctEvent} className="grid gap-3 sm:grid-cols-2" aria-label={`Correct ${event.title}`}>
                  <input type="hidden" name="eventId" value={event.id} />
                  <Field name="title" label="Event" defaultValue={event.title} maxLength={200} />
                  <Field name="date" type="date" label="Date" defaultValue={event.date} />
                  <MoneyField name="estimate" label="Expected cost" defaultValue={estimate.needsInput ? "" : centsToInput(estimate.cents)} />
                  <MoneyField name="cap" label="My cap (optional)" defaultValue={centsToInput(event.capCents)} hint="Overrides the suggested cap." />
                  <SelectField
                    name="decision"
                    label="Decision"
                    defaultValue={event.decision ?? ""}
                    options={[
                      { value: "", label: "Let Runway suggest" },
                      { value: "proceed", label: "Go ahead" },
                      { value: "cheaper", label: "Do a cheaper version" },
                      { value: "postpone", label: "Postpone" },
                      { value: "skip", label: "Skip" },
                    ]}
                  />
                  <SelectField
                    name="paymentAccountId"
                    label="Paying with"
                    defaultValue={event.paymentAccountId ?? ""}
                    options={[{ value: "", label: "Cash / debit" }, ...payWith.map((a) => ({ value: a.id, label: a.name }))]}
                  />
                  <CheckboxField name="essential" label="Can't skip this" defaultChecked={event.essential} />
                  <CheckboxField name="notSpending" label="Not a spending event" defaultChecked={estimate.source === "not_spending" && estimate.cents === 0 && !estimate.needsInput} />
                  <div className="sm:col-span-2">
                    <CheckboxField name="rememberForSimilar" label="Remember this for similar events" defaultChecked />
                  </div>
                  <div className="sm:col-span-2">
                    <Submit>Save</Submit>
                  </div>
                </ActionForm>
              </Disclosure>
            </div>
          )}
        </>
      )}
    </li>
  );
}
