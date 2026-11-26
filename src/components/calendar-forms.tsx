"use client";

import { addCalendarSource, addManualEvent, correctEvent, syncCalendar, uploadIcs } from "@/app/app/actions";
import Link from "next/link";
import { createContext, useContext, useDeferredValue, useEffect, useMemo, useState } from "react";
import { addDays, isISODate, type ISODate } from "@/lib/dates";
import { centsToInput, parseDollars } from "@/lib/money";
import type { EventView } from "@/lib/view/dashboard";
import { APP_NAME } from "@/lib/brand";
import { Money } from "./privacy";
import { checkAffordability, type PlannedEvent } from "@/lib/engine";
import { toEngineInput, type Snapshot } from "@/lib/data/snapshot";
import { PlanImpact } from "./afford-result";
import { Modal } from "./modal";
import { ActionForm, CheckboxField, DemoCtx, Field, FileField, MoneyField, Submit } from "./form";

export function AddCalendarForm() {
  return (
    <ActionForm action={addCalendarSource} className="grid gap-3" resetOnSuccess aria-label="Connect a calendar">
      <Field name="name" label="Calendar name" placeholder="Personal, Shared with partner…" maxLength={60} required />
      <Field name="url" label="Secret iCal address" type="url" inputMode="url" autoComplete="off" placeholder="https://… or webcal://…" required
        hint="Stored privately and only read by the server. It's never shown back in full or exported." />
      <Submit pendingLabel="Connecting…">Connect & sync</Submit>
    </ActionForm>
  );
}

export function UploadIcsForm() {
  return (
    <ActionForm action={uploadIcs} className="grid gap-3" resetOnSuccess encType="multipart/form-data" aria-label="Upload a calendar file">
      <Field name="name" label="Name" placeholder="Work calendar export" maxLength={60} />
      <FileField name="file" label=".ics file" accept=".ics,text/calendar" hint="Up to 5 MB. Uploaded files don't update by themselves." />
      <Submit pendingLabel="Reading…">Upload</Submit>
    </ActionForm>
  );
}

export interface PlanContext {
  snapshot: Snapshot;
  today: ISODate;
  nextPayday: ISODate | null;
  events: PlannedEvent[];
  calendarIncomplete: boolean;
}

/** What a plan form needs to answer "can I afford it?" live. Provided by Today and Calendar. */
export const PlanCtx = createContext<PlanContext | null>(null);

/**
 * Add a plan, or change one. While you type, it answers "can I afford it?" the same way the
 * What-if checker does. The cap is always worked out from your numbers when you save.
 * In the demo you can try it; only saving is off.
 */
export function PlanForm({ snapshot, today, nextPayday, events, calendarIncomplete, view, onDone }: PlanContext & { view?: EventView; onDone?: () => void }) {
  const demo = useContext(DemoCtx);
  const ev = view?.event;
  const [title, setTitle] = useState(ev?.title ?? "");
  const [date, setDate] = useState(ev?.date ?? addDays(today, 7));
  const [amount, setAmount] = useState(view && !view.estimate.needsInput && view.estimate.cents > 0 ? centsToInput(view.estimate.cents) : "");
  const [payWith, setPayWith] = useState(ev?.paymentAccountId ?? "");
  const [decision, setDecision] = useState(ev?.decision ?? "");
  const [notSpending, setNotSpending] = useState(view?.estimate.source === "not_spending");
  const cards = snapshot.accounts.filter((a) => !a.archived && a.kind === "credit_card");
  // When changing a plan, check it as if it were new: leave its current version out.
  const others = useMemo(() => (ev ? events.filter((e) => e.id !== ev.id) : events), [events, ev]);
  const ctx = useMemo(() => ({ input: toEngineInput(snapshot, today), events: others, calendarIncomplete, nextPayday }), [snapshot, today, others, calendarIncomplete, nextPayday]);
  const cents = parseDollars(useDeferredValue(amount));
  const validDate = isISODate(date) && date >= today;
  const skipping = decision === "skip" || decision === "postpone";
  const check = useMemo(
    () =>
      !notSpending && !skipping && cents && cents > 0 && cents <= 5_000_000 && validDate
        ? checkAffordability(ctx, { amountCents: cents, date, paymentAccountId: payWith || null })
        : null,
    [ctx, cents, date, payWith, validDate, notSpending, skipping],
  );
  const short = title.length > 24 ? title.slice(0, 24) + "…" : title;
  return (
    <ActionForm action={ev ? correctEvent : addManualEvent} demoPreview demoNote={false} onSuccess={onDone} className="grid gap-3" aria-label={ev ? `Change ${ev.title}` : "Add a plan"}>
      {ev && <input type="hidden" name="eventId" value={ev.id} />}
      <Field name="title" label="What's the plan?" placeholder="Birthday dinner, concert, weekend away…" maxLength={200} required value={title} onChange={(e) => setTitle(e.target.value)} />
      <div className="grid grid-cols-2 gap-3">
        <Field name="date" type="date" label="When" min={today} required value={date} onChange={(e) => setDate(e.target.value)} />
        <MoneyField name="estimate" label="About how much?" value={notSpending ? "0" : amount} disabled={notSpending} onChange={(e) => setAmount(e.target.value)} />
      </div>
      {cards.length > 0 && (
        <div role="group" aria-label="Pay with" className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-ink">Pay with</span>
          <input type="hidden" name="paymentAccountId" value={payWith} />
          {[{ id: "", name: "Debit" }, ...cards.map((c) => ({ id: c.id, name: cards.length === 1 ? "Credit" : c.name }))].map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => setPayWith(o.id)}
              aria-pressed={payWith === o.id}
              className={`min-h-9 rounded-full border px-3.5 text-sm font-medium transition ${payWith === o.id ? "border-brand bg-brand text-brand-ink" : "border-line bg-surface text-muted hover:border-brand/60"}`}
            >
              {o.name}
            </button>
          ))}
        </div>
      )}
      {ev && (
        <>
          <div role="group" aria-label="Your call" className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-ink">Your call</span>
            <input type="hidden" name="decision" value={decision} />
            {[
              ["", "Auto"],
              ["proceed", "Go"],
              ["cheaper", "Cheaper"],
              ["postpone", "Later"],
              ["skip", "Skip"],
            ].map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setDecision(id!)}
                aria-pressed={decision === id}
                className={`min-h-9 rounded-full border px-3 text-sm font-medium transition ${decision === id ? "border-brand bg-brand text-brand-ink" : "border-line bg-surface text-muted hover:border-brand/60"}`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <CheckboxField name="essential" label="Can't skip this" defaultChecked={ev.essential} />
            <label className="flex items-start gap-3 text-sm">
              <input type="checkbox" name="notSpending" className="mt-0.5 h-5 w-5 accent-[var(--color-brand)]" checked={notSpending} onChange={(e) => setNotSpending(e.target.checked)} />
              <span>Not a spending event</span>
            </label>
          </div>
          <CheckboxField name="rememberForSimilar" label="Remember this for similar events" defaultChecked />
        </>
      )}
      <div aria-live="polite">
        {check ? (
          <PlanImpact check={check} />
        ) : notSpending ? (
          <p className="rounded-xl border border-dashed border-line p-3 text-sm text-muted">Nothing is set aside for it, so your everyday money stays as it is.</p>
        ) : skipping ? (
          <p className="rounded-xl border border-dashed border-line p-3 text-sm text-muted">Nothing is set aside for it{decision === "postpone" ? " on this date" : ""}; that money goes back into your daily caps.</p>
        ) : (
          <p className="rounded-xl border border-dashed border-line p-3 text-sm text-muted">Add an amount to see if it fits before you save it.</p>
        )}
      </div>
      {view?.advice && view.advice.capCents > 0 && (
        <p className="text-xs text-muted">
          Cap now <Money cents={view.advice.capCents} className="font-semibold text-ink" />. It's worked out from your numbers and updates when you save.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Submit>{ev ? "Save changes" : title ? `Add “${short}”` : "Add plan"}</Submit>
        {demo && <span className="text-xs text-muted">Demo: try it freely. <Link href="/login?mode=signup" className="font-semibold text-brand underline">Create your own</Link> to save plans.</span>}
      </div>
    </ActionForm>
  );
}

export const AddPlanForm = PlanForm;

/** "Change" on a plan card: opens the plan in a pop-up with the live answer. */
export function EditPlanButton({ view }: { view: EventView }) {
  const ctx = useContext(PlanCtx);
  const [open, setOpen] = useState(false);
  if (!ctx) return null;
  return (
    <>
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => setOpen(true)}>
        Change
      </button>
      <Modal open={open} onClose={() => setOpen(false)} icon="📅" title={view.event.title} subtitle="Change the amount, date or how you'll pay, and see the answer before you save.">
        <PlanForm {...ctx} view={view} onDone={() => setOpen(false)} />
      </Modal>
    </>
  );
}

/** Makes plan pop-ups available to every plan card inside. */
export function PlanProvider({ value, children }: { value: PlanContext; children: React.ReactNode }) {
  return <PlanCtx.Provider value={value}>{children}</PlanCtx.Provider>;
}

export function SyncButton({ id, label = "Sync now" }: { id?: string; label?: string }) {
  return (
    <ActionForm action={syncCalendar} aria-label={label}>
      {id && <input type="hidden" name="id" value={id} />}
      <Submit variant="secondary" className="btn-sm" pendingLabel="Syncing…">{label}</Submit>
    </ActionForm>
  );
}

/** "+ Add a plan" opens the add-a-plan pop-up. */
export function AddPlanButton(props: Omit<React.ComponentProps<typeof AddPlanForm>, "onDone"> & { className?: string; openFromUrl?: boolean }) {
  const { className = "btn btn-primary btn-sm", openFromUrl = false, ...form } = props;
  const [open, setOpen] = useState(false);
  // "?add=1" (from the landing page): open straight away, so you can try one of your own plans.
  useEffect(() => {
    if (!openFromUrl) return;
    const url = new URL(window.location.href);
    if (url.searchParams.get("add") !== "1") return;
    setOpen(true);
    url.searchParams.delete("add");
    window.history.replaceState(null, "", url.pathname + url.search);
  }, [openFromUrl]);
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        + Add
      </button>
      <Modal open={open} onClose={() => setOpen(false)} icon="📅" title="Add a plan" subtitle="For anything that isn't on a calendar. See if it fits before you save it.">
        <AddPlanForm {...form} onDone={() => setOpen(false)} />
      </Modal>
    </>
  );
}
