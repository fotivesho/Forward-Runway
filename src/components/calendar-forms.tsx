"use client";

import { addCalendarSource, addManualEvent, syncCalendar, uploadIcs } from "@/app/app/actions";
import type { ISODate } from "@/lib/dates";
import { ActionForm, Field, FileField, MoneyField, Submit } from "./form";

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

export function ManualEventForm({ today }: { today: ISODate }) {
  return (
    <ActionForm action={addManualEvent} className="grid gap-3 sm:grid-cols-3 sm:items-end" resetOnSuccess aria-label="Add a plan">
      <Field name="title" label="Plan" placeholder="Dinner with Sam" maxLength={200} required />
      <Field name="date" type="date" label="Date" defaultValue={today} required />
      <MoneyField name="estimate" label="Expected cost (optional)" />
      <div className="sm:col-span-3"><Submit>Add plan</Submit></div>
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
