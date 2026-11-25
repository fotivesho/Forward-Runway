import { QuickAction } from "@/components/form";
import { DeleteAccountForm, DeleteDataForm, ImportForm, PasswordForm, ProfileForm, SettingsForm } from "@/components/settings-forms";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import type { ViewProps } from "./types";
import { formatCents } from "@/lib/money";
import { clearDecisions, deleteCorrection, setHideAmounts } from "@/app/app/actions";

const DECISION_LABEL: Record<string, string> = {
  proceed: "Go ahead", cheaper: "Cheaper version", postpone: "Postpone", skip: "Skip", posted: "Already happened", modify: "Changed date/amount",
  paid_in_full: "Paid in full", go_ahead_with_plan: "Doing the plan", wait: "Waiting",
};

export function SettingsView({ snapshot, user, demo = false }: ViewProps) {
  const base = demo ? "/demo" : "/app";
  const corrections = snapshot.corrections.filter((c) => c.kind === "event_estimate");
  return (
    <>
      <PageHeader title="Settings" subtitle={user.email ? `Signed in as ${user.email}` : undefined} />
      <div className="grid gap-4">
        <Card title="Profile"><ProfileForm snapshot={snapshot} /></Card>
        <Card title="Forecast & advice"><SettingsForm snapshot={snapshot} /></Card>
        <Card title="What Runway remembers" id="memory">
          <p className="mb-3 text-sm text-muted">Corrections and decisions you've confirmed, so you don't have to repeat them. Remove anything you don't want remembered.</p>
          <h3 className="text-sm font-semibold">Event cost corrections</h3>
          {corrections.length === 0 ? (
            <p className="text-sm text-faint">None yet. Correct an event's cost and tick “Remember this for similar events”.</p>
          ) : (
            <ul className="mt-1 divide-y divide-line text-sm">
              {corrections.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2 py-1.5">
                  <span>
                    “{c.matchKey}” →{" "}
                    {c.value.notSpending ? "not a spending event" : c.value.estimateCents != null ? `about ${snapshot.profile.hideAmounts ? "$•••" : formatCents(c.value.estimateCents as number)}` : "no estimate"}
                    {c.value.capCents != null && !snapshot.profile.hideAmounts && `, cap ${formatCents(c.value.capCents as number)}`}
                  </span>
                  <QuickAction action={deleteCorrection} fields={{ id: c.id }} label={`Forget ${c.matchKey}`}>Forget</QuickAction>
                </li>
              ))}
            </ul>
          )}
          <h3 className="mt-4 text-sm font-semibold">Recent decisions</h3>
          {snapshot.decisions.length === 0 ? (
            <p className="text-sm text-faint">No decisions recorded yet.</p>
          ) : (
            <>
              <ul className="mt-1 divide-y divide-line text-sm">
                {snapshot.decisions.slice(0, 25).map((d) => (
                  <li key={d.id} className="flex justify-between gap-2 py-1.5">
                    <span className="text-muted">
                      {d.subjectType === "event" ? `Event “${(d.detail.title as string) ?? ""}”` : d.subjectType === "purchase" ? `Purchase “${d.subjectId ?? ""}”` : d.subjectType}
                      {" — "}<span className="text-ink">{DECISION_LABEL[d.decision] ?? d.decision}</span>
                    </span>
                    <span className="shrink-0 text-xs text-faint">{d.createdAt.slice(0, 10)}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-2"><QuickAction action={clearDecisions} fields={{}} confirm="Clear your decision history?" variant="secondary">Clear history</QuickAction></div>
            </>
          )}
        </Card>
        <Card title="Privacy" id="privacy">
          <div className="space-y-5">
            <div>
              <h3 className="text-sm font-semibold">Hide amounts on screen</h3>
              <p className="mb-2 text-sm text-muted">Masks every dollar amount until you turn it off. Handy in public.</p>
              <form action={setHideAmounts} aria-disabled={demo}>
                <input type="hidden" name="hide" value={snapshot.profile.hideAmounts ? "false" : "true"} />
                <button className="btn btn-secondary" disabled={demo} aria-pressed={snapshot.profile.hideAmounts}>{snapshot.profile.hideAmounts ? "Show amounts" : "Hide amounts"}</button>
              </form>
            </div>
            <div>
              <h3 className="text-sm font-semibold">Export your data</h3>
              <p className="mb-2 text-sm text-muted">Everything as JSON (amounts in cents). Calendar addresses are left out because they're secrets.</p>
              {demo ? <button className="btn btn-secondary" disabled>Download JSON</button> : <a href="/app/export" className="btn btn-secondary" download>Download JSON</a>}
            </div>
            <div>
              <h3 className="text-sm font-semibold">Import</h3>
              <p className="mb-2 text-sm text-muted">Restore from an export. The file is checked first; nothing changes if it's invalid.</p>
              <ImportForm />
            </div>
            <div>
              <h3 className="text-sm font-semibold">Change password</h3>
              <PasswordForm />
            </div>
            <div className="rounded-xl border border-danger/40 p-3">
              <h3 className="text-sm font-semibold text-danger">Delete all data</h3>
              <p className="mb-2 text-sm text-muted">Erases your financial data and memory but keeps your login.</p>
              <DeleteDataForm />
            </div>
            <div className="rounded-xl border border-danger/40 p-3">
              <h3 className="text-sm font-semibold text-danger">Delete account</h3>
              <p className="mb-2 text-sm text-muted">Permanently removes your login and every row of your data.</p>
              <DeleteAccountForm />
            </div>
          </div>
        </Card>
        {snapshot.accounts.length === 0 && <EmptyState title="Nothing set up yet" action={<a className="btn btn-primary" href={base + "/onboarding"}>Start setup</a>} />}
      </div>
    </>
  );
}
