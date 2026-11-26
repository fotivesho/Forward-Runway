"use client";

import { replaceWithBankAccount } from "@/app/app/actions";
import { ActionForm, SelectField, Submit } from "./form";

/** "Replace with a bank account": moves everything over, then archives the hand-entered one. */
export function ReplaceWithBankForm({ from, options }: { from: string; options: Array<{ id: string; name: string }> }) {
  return (
    <ActionForm action={replaceWithBankAccount} className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end" aria-label="Replace with a bank account">
      <input type="hidden" name="from" value={from} />
      <SelectField name="to" label="Use this bank account instead" defaultValue={options[0]?.id} options={options.map((o) => ({ value: o.id, label: o.name }))} />
      <Submit variant="secondary" pendingLabel="Moving…">Replace</Submit>
    </ActionForm>
  );
}
