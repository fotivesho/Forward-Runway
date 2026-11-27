"use client";

import { useState } from "react";
import { dismissRecurring, saveRule } from "@/app/app/actions";
import { formatShort, type ISODate } from "@/lib/dates";
import { centsToInput } from "@/lib/money";
import type { Account, RecurringRule } from "@/lib/engine";
import type { RecurringSuggestion } from "@/lib/view/recurring";
import { RuleForm } from "./entity-forms";
import { ActionForm, QuickAction, Submit } from "./form";
import { Modal } from "./modal";
import { Glyph } from "@/components/icon";
import { Info } from "./info";
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
  const [openKey, setOpenKey] = useState<string | null>(null);
  if (suggestions.length === 0) return null;
  return (
    <section className="mb-4 rounded-xl border border-info/40 bg-info/5 p-3" aria-labelledby="found-title">
      <h3 id="found-title" className="text-sm font-bold text-ink">Found in your history<Info label="Found in your history">These look like they repeat, based on your past purchases and deposits. Add one and it&apos;s counted ahead of time in your forecast and daily limits.</Info></h3>
      <ul className="mt-2 space-y-2">
        {suggestions.slice(0, 8).map((s) => (
          <li key={s.key} className="rounded-xl bg-surface p-3">
            <div className="flex items-center gap-3">
              <Glyph name={s.kind === "income" ? "income" : s.category} size="md" />
              <button type="button" onClick={() => setOpenKey(openKey === s.key ? null : s.key)} aria-expanded={openKey === s.key} className="min-w-0 flex-1 text-left">
                <span className="block truncate text-sm font-semibold text-ink">{s.name}</span>
                <span className="block text-xs text-muted">
                  <span className={s.kind === "income" ? "text-in" : "text-out"}>{s.kind === "income" ? "+" : ""}{s.varies ? "~" : ""}<Money cents={s.amountCents} whole /></span> {FREQ[s.frequency]} · next {formatShort(s.nextDate)}
                </span>
                <span className="mt-0.5 block text-[11px] font-semibold text-brand">{openKey === s.key ? "Hide" : `Seen ${s.seen} times ›`}</span>
              </button>
              <QuickAction action={dismissRecurring} fields={{ key: s.key }} label={`Not repeating: ${s.name}`}>✕</QuickAction>
            </div>
            {openKey === s.key && <Charges s={s} />}
            <div className="mt-2 flex items-center gap-2 pl-12">
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
                <Submit variant="primary" className="btn-sm" pendingLabel="Adding…">Add as repeating</Submit>
              </ActionForm>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setReview(s)}>Edit first</button>
            </div>
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

/** The charges behind a suggestion, so you can check it really repeats: bars, then each one. */
function Charges({ s }: { s: RecurringSuggestion }) {
  const max = Math.max(1, s.amountCents, ...s.charges.map((c) => c.cents));
  const color = s.kind === "income" ? "var(--color-in)" : "var(--color-out)";
  const h = (c: number) => `${Math.max(14, (c / max) * 100)}%`;
  const mon = (d: string) => formatShort(d).split(" ")[0];
  // Monthly: the month says it all. Weekly: the day, with the month only where it changes.
  const dates = [...s.charges.map((c) => c.date), s.nextDate];
  const label = (d: string, i: number) => {
    if (s.frequency === "monthly") return mon(d);
    const [m, day] = formatShort(d).split(" ");
    return i === 0 || mon(dates[i - 1]!) !== m ? `${m} ${day}` : day;
  };
  return (
    <div className="fade-up mt-3 pl-12">
      <div className="flex items-end justify-between gap-1 rounded-2xl bg-surface-2/50 px-3 pb-2 pt-3" aria-hidden>
        {s.charges.map((c, k) => (
          <span key={c.id} className="flex flex-1 flex-col items-center gap-1.5">
            <span className="flex h-14 items-end">
              <span className="w-2 rounded-full" style={{ height: h(c.cents), background: `linear-gradient(to top, color-mix(in srgb, ${color} 55%, transparent), ${color})`, boxShadow: `0 0 10px -2px color-mix(in srgb, ${color} 60%, transparent)` }} />
            </span>
            <span className="whitespace-nowrap text-[9px] uppercase tracking-wide text-faint">{label(c.date, k)}</span>
          </span>
        ))}
        <span className="flex flex-1 flex-col items-center gap-1.5">
          <span className="flex h-14 items-end">
            <span className="w-2 rounded-full border border-dashed" style={{ height: h(s.amountCents), borderColor: color }} />
          </span>
          <span className="whitespace-nowrap text-[9px] font-bold uppercase tracking-wide" style={{ color }}>{label(s.nextDate, dates.length - 1)}</span>
        </span>
      </div>
      <ul className="mt-2 divide-y divide-line rounded-xl border border-line text-xs">
        {s.charges.map((c) => (
          <li key={c.id} className="flex items-center justify-between gap-2 px-3 py-1.5">
            <span className="min-w-0 truncate"><span className="font-semibold text-ink">{formatShort(c.date)}</span> <span className="text-muted">{c.description}</span></span>
            <Money cents={s.kind === "income" ? c.cents : -c.cents} sign tone="auto" className="shrink-0 font-semibold" />
          </li>
        ))}
        <li className="flex items-center justify-between gap-2 px-3 py-1.5 text-faint">
          <span><span className="font-semibold">{formatShort(s.nextDate)}</span> · expected next</span>
          <span>{s.varies ? "~" : ""}<Money cents={s.amountCents} /></span>
        </li>
      </ul>
    </div>
  );
}
