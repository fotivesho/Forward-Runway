"use client";

import { useContext, useEffect, useState } from "react";
import { deleteAllData, deleteMyAccount, importData, saveProfile, saveSettings } from "@/app/app/actions";
import type { Snapshot } from "@/lib/data/snapshot";
import { centsToInput } from "@/lib/money";
import { createClient } from "@/lib/supabase/client";
import { ActionForm, CheckboxField, DemoCtx, Field, FileField, MoneyField, SelectField, Submit } from "./form";
import { APP_NAME } from "@/lib/brand";

function zones(current: string): string[] {
  let list: string[] = [];
  try {
    list = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone") ?? [];
  } catch {
    /* older browsers */
  }
  if (!list.includes(current)) list = [current, ...list];
  return list.length ? list : [current];
}

export function ProfileForm({ snapshot, detectTimezone = false }: { snapshot: Snapshot; detectTimezone?: boolean }) {
  const [tz, setTz] = useState(snapshot.profile.timezone);
  useEffect(() => {
    // Suggest the device's time zone during first-time setup (client-only, avoids SSR mismatch).
    if (detectTimezone && !snapshot.profile.onboardedAt) {
      try {
        setTz(Intl.DateTimeFormat().resolvedOptions().timeZone || snapshot.profile.timezone);
      } catch {
        /* keep saved zone */
      }
    }
  }, [detectTimezone, snapshot.profile.onboardedAt, snapshot.profile.timezone]);
  return (
    <ActionForm action={saveProfile} className="grid gap-3 sm:grid-cols-2" aria-label="Profile">
      <Field name="displayName" label="Your first name (optional)" defaultValue={snapshot.profile.displayName ?? ""} maxLength={80} autoComplete="given-name" />
      <SelectField name="timezone" label="Time zone" value={tz} onChange={(e) => setTz(e.target.value)} options={zones(tz).map((z) => ({ value: z, label: z.replace(/_/g, " ") }))} hint="Decides what “today” is for your forecast." />
      <div className="sm:col-span-2"><Submit>Save</Submit></div>
    </ActionForm>
  );
}

export function SettingsForm({ snapshot }: { snapshot: Snapshot }) {
  const s = snapshot.settings;
  return (
    <ActionForm action={saveSettings} className="grid gap-3 sm:grid-cols-2" aria-label="Forecast settings">
      <MoneyField name="cashFloor" label="Cash floor" defaultValue={centsToInput(s.cashFloorCents)} hint="The least you want in checking at any point. Daily caps keep you above it." required />
      <SelectField name="defaultHorizonDays" label="Default forecast length" defaultValue={String(s.defaultHorizonDays)} options={[{ value: "30", label: "30 days" }, { value: "60", label: "60 days" }, { value: "90", label: "90 days" }]} />
      <Field name="staleAfterDays" type="number" min={1} max={60} label="Treat cash balances as out of date after (days)" defaultValue={s.staleAfterDays} required />
      <Field name="unseenPlansBufferPct" type="number" min={0} max={50} label="Buffer for plans I can't see (%)" defaultValue={s.unseenPlansBufferPct} hint="Held back from daily caps while calendars are missing or failing." required />
      <div className="sm:col-span-2">
        <CheckboxField name="autoPayStatements" label="Schedule card statement payments automatically" defaultChecked={s.autoPayStatements} hint="Pays each statement on its due date unless you've scheduled a payment yourself. Turn off only if you schedule every card payment manually." />
      </div>
      <div className="sm:col-span-2"><Submit>Save settings</Submit></div>
    </ActionForm>
  );
}

export function ImportForm() {
  return (
    <ActionForm action={importData} className="grid gap-3" encType="multipart/form-data" aria-label="Import data">
      <FileField name="file" label={`${APP_NAME} export (.json)`} accept="application/json,.json" />
      <Field name="confirm" label='Type REPLACE to confirm' hint="Importing replaces all of your current data." autoComplete="off" />
      <Submit variant="danger" pendingLabel="Importing…">Import and replace</Submit>
    </ActionForm>
  );
}

export function DeleteDataForm() {
  return (
    <ActionForm action={deleteAllData} className="grid gap-3" aria-label="Delete all data">
      <Field name="confirm" label="Type DELETE to erase all accounts, plans, transactions, calendars and memory" autoComplete="off" />
      <Submit variant="danger" pendingLabel="Deleting…">Delete all my data</Submit>
    </ActionForm>
  );
}

export function DeleteAccountForm() {
  return (
    <ActionForm action={deleteMyAccount} className="grid gap-3" aria-label="Delete account">
      <Field name="confirm" label="Type DELETE MY ACCOUNT to remove your login and all data" autoComplete="off" />
      <Submit variant="danger" pendingLabel="Deleting…">Delete my account</Submit>
    </ActionForm>
  );
}

export function PasswordForm() {
  const [pw, setPw] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const demo = useContext(DemoCtx);
  return (
    <form
      id="password"
      noValidate
      className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end"
      onSubmit={async (e) => {
        e.preventDefault();
        if (pw.length < 10) return setMsg({ ok: false, text: "Use at least 10 characters." });
        setBusy(true);
        const { error } = await createClient().auth.updateUser({ password: pw });
        setBusy(false);
        setPw("");
        setMsg(error ? { ok: false, text: "Couldn't change your password. Sign in again and retry." } : { ok: true, text: "Password changed." });
      }}
    >
      <div className="flex flex-col gap-1">
        <label htmlFor="new-password" className="text-sm font-medium">New password</label>
        <input id="new-password" type="password" autoComplete="new-password" className="input" value={pw} onChange={(e) => setPw(e.target.value)} aria-invalid={msg && !msg.ok ? true : undefined} aria-describedby="pw-msg" />
      </div>
      <button className="btn btn-secondary" disabled={busy || demo}>{busy ? "Saving…" : "Change password"}</button>
      <p id="pw-msg" aria-live="polite" className={`text-xs sm:col-span-2 ${msg?.ok ? "text-brand" : "text-danger"}`}>{msg?.text}</p>
    </form>
  );
}
