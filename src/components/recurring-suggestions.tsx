"use client";

import { useState } from "react";
import { dismissRecurring, saveRule } from "@/app/app/actions";
import { formatShort, type ISODate } from "@/lib/dates";
import { centsToInput } from "@/lib/money";
import type { Account, RecurringRule } from "@/lib/engine";
import type { RecurringSuggestion } from "@/lib/view/recurring";
import { iconFor } from "@/lib/categories";
import { RuleForm } from "./entity-forms";
import { ActionForm, QuickAction, Submit } from "./form";
import { Modal } from "./modal";
import { Money } from "./privacy";

const FREQ: Record<string, string> = { weekly: "every week", biweekly: "every 2 weeks", semimonthly: "twice a month", monthly: "every month" };
const ordinal = (d: number) => (d === -1 ? "last day" : `${d}${d % 10 === 1 && d !== 11 ? "st" : d % 10 === 2 && d !== 12 ? "nd" : d % 10 === 3 && d !== 13 ? "rd" : "th"}`);

export function suggestionToRule(s: RecurringSuggestion): RecurringRule {
  return {
    id: "",
    name: s.name,
    kind: s.kind,
    amountCents: s.amountCents,
    accountId: s.accountId,
    category: s.category,
    isEstimate: s.varies,
    schedule: { frequency: s.frequency, startDate: s.nextDate, dayOfMonth: s.dayOfMonth, secondDayOfMonth: s.secondDayOfMonth, weekendAdjust: s.kind === "income" ? "before" : "none" },
  };
}

/** "Found in your history": repeating money your bank shows, added with one tap. */
export function RecurringSuggestions({ suggestions, accounts, today }: { suggestions: RecurringSuggestion[]; accounts: Account[]; today: ISODate }) {
  const [review, setReview] = useState<RecurringSuggestion | null>(null);
  if (suggestions.length === 0) return null;
  return (
    <section className="mb-4 rounded-xl border border-info/40 bg-info/5 p-3" aria-labelledby="found-title">
      <h3 id="found-title" className="text-sm font-semibold text-ink">Found in your history</h3>
      <ul className="mt-2 space-y-2">
        {suggestions.slice(0, 8).map((s) => (
          <li key={s.key} className="flex flex-wrap items-center gap-2 rounded-lg bg-surface px-3 py-2">
            <span aria-hidden className="text-lg">{s.kind === "income" ? "💰" : iconFor(s.category)}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-ink">{s.name}</span>
              <span className="block text-xs text-muted">
                {s.varies ? "about " : ""}
                <Money cents={s.kind === "income" ? s.amountCents : -s.amountCents} sign tone="auto" /> {FREQ[s.frequency]}
                {s.frequency === "semimonthly" && s.dayOfMonth ? ` (${ordinal(s.dayOfMonth)} & ${ordinal(s.secondDayOfMonth ?? 15)})` : ""} · next {formatShort(s.nextDate)} · seen {s.seen}×
              </span>
            </span>
            <ActionForm action={saveRule} aria-label={`Add ${s.name}`}>
              <input type="hidden" name="kind" value={s.kind} />
              <input type="hidden" name="name" value={s.name} />
              <input type="hidden" name="amount" value={centsToInput(s.amountCents)} />
              <input type="hidden" name="accountId" value={s.accountId} />
              <input type="hidden" name="category" value={s.category ?? ""} />
              <input type="hidden" name="frequency" value={s.frequency} />
              <input type="hidden" name="startDate" value={s.nextDate} />
              {s.dayOfMonth != null && <input type="hidden" name="dayOfMonth" value={String(s.dayOfMonth)} />}
              {s.secondDayOfMonth != null && <input type="hidden" name="secondDayOfMonth" value={String(s.secondDayOfMonth)} />}
              <input type="hidden" name="weekendAdjust" value={s.kind === "income" ? "before" : "none"} />
              {s.varies && <input type="hidden" name="isEstimate" value="on" />}
              <Submit variant="primary" className="btn-sm" pendingLabel="Adding…">Add</Submit>
            </ActionForm>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setReview(s)}>Edit first</button>
            <QuickAction action={dismissRecurring} fields={{ key: s.key }} label={`Not repeating: ${s.name}`}>✕</QuickAction>
          </li>
        ))}
      </ul>
      {review && (
        <Modal open onClose={() => setReview(null)} icon="🔁" title={`Add ${review.name}`} subtitle="Check the details, then add it.">
          <RuleForm prefill={suggestionToRule(review)} accounts={accounts} today={today} onDone={() => setReview(null)} />
        </Modal>
      )}
    </section>
  );
}
