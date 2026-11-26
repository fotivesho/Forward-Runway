"use client";

import { useState } from "react";
import { setOverride } from "@/app/app/actions";
import { centsToInput } from "@/lib/money";
import { ActionForm, Field, MoneyField, Submit } from "./form";

/** Per-date controls: already posted, skip, change, or reset to the schedule. */
export function OccurrenceControls({ ruleId, originalDate, date, amountCents, overridden }: { ruleId: string; originalDate: string; date: string; amountCents: number; overridden: boolean }) {
  const [editing, setEditing] = useState(false);
  const hidden = (
    <>
      <input type="hidden" name="ruleId" value={ruleId} />
      <input type="hidden" name="originalDate" value={originalDate} />
    </>
  );
  if (editing) {
    return (
      <ActionForm action={setOverride} className="grid w-full grid-cols-2 gap-2 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end" onSuccess={() => setEditing(false)} aria-label="Change this date only">
        {hidden}
        <input type="hidden" name="action" value="modify" />
        <Field name="newDate" type="date" label="New date" defaultValue={date} />
        <MoneyField name="amount" label="Amount" defaultValue={centsToInput(amountCents)} />
        <Submit className="btn-sm">Save</Submit>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(false)}>Cancel</button>
      </ActionForm>
    );
  }
  return (
    <div className="flex flex-wrap gap-1">
      {(["posted", "skip"] as const).map((a) => (
        <ActionForm key={a} action={setOverride} aria-label={a === "posted" ? "Mark as already in balance" : "Skip this date"}>
          {hidden}
          <input type="hidden" name="action" value={a} />
          <Submit variant="secondary" className="btn-sm" pendingLabel="…">{a === "posted" ? "Happened" : "Skip"}</Submit>
        </ActionForm>
      ))}
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditing(true)}>Change</button>
      {overridden && (
        <ActionForm action={setOverride} aria-label="Reset to schedule">
          {hidden}
          <input type="hidden" name="action" value="reset" />
          <Submit variant="secondary" className="btn-sm" pendingLabel="…">Reset</Submit>
        </ActionForm>
      )}
    </div>
  );
}
