"use client";

import { addCalendarSource, addManualEvent, syncCalendar, uploadIcs } from "@/app/app/actions";
import Link from "next/link";
import { useContext, useDeferredValue, useMemo, useState } from "react";
import { addDays, isISODate, type ISODate } from "@/lib/dates";
import { parseDollars } from "@/lib/money";
import { checkAffordability, type PlannedEvent } from "@/lib/engine";
import { toEngineInput, type Snapshot } from "@/lib/data/snapshot";
import { PlanImpact } from "./afford-result";
import { Modal } from "./modal";
import { ActionForm, DemoCtx, Field, FileField, MoneyField, Submit } from "./form";

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

/**
 * Add a plan that isn't on a calendar. While you type, it answers "can I afford it?"
 * the same way the What-if checker does. In the demo you can try it; only saving is off.
 */
export function AddPlanForm({
  snapshot,
  today,
  nextPayday,
  events,
  calendarIncomplete,
  onDone,
}: {
  snapshot: Snapshot;
  today: ISODate;
  nextPayday: ISODate | null;
  events: PlannedEvent[];
  calendarIncomplete: boolean;
  onDone?: () => void;
}) {
  const demo = useContext(DemoCtx);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(addDays(today, 7));
  const [amount, setAmount] = useState("");
  const [payWith, setPayWith] = useState("");
  const cards = snapshot.accounts.filter((a) => !a.archived && a.kind === "credit_card");
  const ctx = useMemo(() => ({ input: toEngineInput(snapshot, today), events, calendarIncomplete, nextPayday }), [snapshot, today, events, calendarIncomplete, nextPayday]);
  const cents = parseDollars(useDeferredValue(amount));
  const validDate = isISODate(date) && date >= today;
  const check = useMemo(
    () => (cents && cents > 0 && cents <= 5_000_000 && validDate ? checkAffordability(ctx, { amountCents: cents, date, paymentAccountId: payWith || null }) : null),
    [ctx, cents, date, payWith, validDate],
  );
  return (
    <ActionForm action={addManualEvent} demoPreview onSuccess={onDone} className="grid gap-3" aria-label="Add a plan">
      <Field name="title" label="What's the plan?" placeholder="Birthday dinner, concert, weekend away…" maxLength={200} required value={title} onChange={(e) => setTitle(e.target.value)} />
      <div className="grid grid-cols-2 gap-3">
        <Field name="date" type="date" label="When" min={today} required value={date} onChange={(e) => setDate(e.target.value)} />
        <MoneyField name="estimate" label="About how much?" value={amount} onChange={(e) => setAmount(e.target.value)} />
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
      <div aria-live="polite">
        {check ? (
          <PlanImpact check={check} />
        ) : (
          <p className="rounded-xl border border-dashed border-line p-3 text-sm text-muted">Add an amount to see if it fits before you save it.</p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Submit>{title ? `Add “${title.length > 24 ? title.slice(0, 24) + "…" : title}”` : "Add plan"}</Submit>
        {demo && <span className="text-xs text-muted">Demo: try it freely. <Link href="/login?mode=signup" className="font-semibold text-brand underline">Create your own</Link> to save plans.</span>}
      </div>
    </ActionForm>
  );
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
export function AddPlanButton(props: Omit<React.ComponentProps<typeof AddPlanForm>, "onDone"> & { className?: string }) {
  const { className = "btn btn-primary btn-sm", ...form } = props;
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        + Add a plan
      </button>
      <Modal open={open} onClose={() => setOpen(false)} icon="📅" title="Add a plan" subtitle="For anything that isn't on a calendar. See if it fits before you save it.">
        <AddPlanForm {...form} onDone={() => setOpen(false)} />
      </Modal>
    </>
  );
}
