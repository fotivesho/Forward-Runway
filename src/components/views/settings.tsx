import { QuickAction } from "@/components/form";
import { DeleteAccountForm, DeleteDataForm, ImportForm, PasswordForm, ProfileForm, SettingsForm } from "@/components/settings-forms";
import { Card, Disclosure, EmptyState, PageHeader } from "@/components/ui";
import { ThemeToggle } from "@/components/theme";
import { MorningToggle } from "@/components/morning-toggle";
import { PayWith } from "@/components/pay-with";
import { everydayPaySplit } from "@/lib/engine";
import { toEngineInput } from "@/lib/data/snapshot";
import type { ViewProps } from "./types";
import { formatCents } from "@/lib/money";
import { clearDecisions, deleteCorrection, setHideAmounts } from "@/app/app/actions";
import { Info } from "@/components/info";
import { APP_NAME } from "@/lib/brand";

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
        <Card title={<>Appearance <Info label="Appearance">&ldquo;Auto&rdquo; matches your phone or computer&apos;s light or dark setting. Whatever you pick is saved to your account and used on every device.</Info></>}>
          <ThemeToggle saved={snapshot.profile.theme} persist={!demo} showLabels />
        </Card>
        <Card title={<>Morning note <Info label="Morning note">Each morning, a notification with today&apos;s limit and the one thing worth knowing about the day (a plan, payday, a grocery run that&apos;s due). Tap it to open your day. It&apos;s set per device.</Info></>}>
          <MorningToggle demo={demo} />
        </Card>
        <Card title={<>Everyday purchases go on <Info label="Everyday purchases">Card purchases leave your cash on the statement&apos;s due date, not the day you buy. Debit purchases leave the same day. Auto reads it from your recent history. This changes when your forecast shows money leaving, not your daily limits.</Info></>}>
          {(() => {
            const input = toEngineInput(snapshot, new Date().toISOString().slice(0, 10));
            const split = everydayPaySplit({ ...input, everydayPay: "auto" });
            const cards = snapshot.accounts.filter((a) => a.kind === "credit_card" && !a.archived);
            const auto = split.length ? split.map((x) => `${Math.round(x.share * 100)}% ${cards.find((c) => c.id === x.accountId)?.name ?? "card"}`).join(", ") + (split.reduce((t, x) => t + x.share, 0) < 0.98 ? ", rest debit" : "") : "mostly debit";
            return <PayWith value={input.everydayPay ?? "auto"} cards={cards.map((c) => ({ id: c.id, name: c.name }))} auto={auto} />;
          })()}
        </Card>
        <Card title="Forecast & advice"><SettingsForm snapshot={snapshot} /></Card>
        <Card title={<>What {APP_NAME} remembers <Info label="What we remember">When you correct a cost or make a decision, we remember it so you don&apos;t have to repeat yourself next time. Remove anything you&apos;d rather we forget.</Info></>} id="memory">
          <h3 className="text-sm font-bold text-ink">Event cost corrections</h3>
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
          <h3 className="mt-4 text-sm font-bold text-ink">Recent decisions</h3>
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
              <h3 className="mb-2 text-sm font-bold text-ink">Hide amounts on screen <Info label="Hide amounts on screen">Hides every dollar amount on screen until you turn it back on. Handy when someone&apos;s looking over your shoulder.</Info></h3>
              <form action={setHideAmounts} aria-disabled={demo}>
                <input type="hidden" name="hide" value={snapshot.profile.hideAmounts ? "false" : "true"} />
                <button className="btn btn-secondary" disabled={demo} aria-pressed={snapshot.profile.hideAmounts}>{snapshot.profile.hideAmounts ? "Show amounts" : "Hide amounts"}</button>
              </form>
            </div>
            <div>
              <h3 className="mb-2 text-sm font-bold text-ink">Export your data <Info label="Export your data">Downloads all your data as one file (JSON format, amounts in cents). Your private calendar links are left out, because anyone with them could read your calendar.</Info></h3>
              {demo ? <button className="btn btn-secondary" disabled>Download JSON</button> : <a href="/app/export" className="btn btn-secondary" download>Download JSON</a>}
            </div>
            <div>
              <Disclosure summary={<span className="text-sm font-bold text-ink">Import a backup <Info label="Import">Brings back data from a file you exported earlier. The file is checked first; if anything is wrong with it, nothing changes.</Info></span>}>
                <ImportForm />
              </Disclosure>
            </div>
            <div>
              <Disclosure summary={<span className="text-sm font-bold text-ink">Change password</span>}>
                <PasswordForm />
              </Disclosure>
            </div>
            <div className="rounded-xl border border-danger/40 p-3">
              <h3 className="mb-2 text-sm font-bold text-danger">Delete all data <Info label="Delete all data">Erases your accounts, bills, plans and everything the app remembers, but keeps your login so you can start fresh.</Info></h3>
              <DeleteDataForm />
            </div>
            <div className="rounded-xl border border-danger/40 p-3">
              <h3 className="mb-2 text-sm font-bold text-danger">Delete account <Info label="Delete account">Permanently deletes your login and all of your data. This can&apos;t be undone.</Info></h3>
              <DeleteAccountForm />
            </div>
          </div>
        </Card>
        {snapshot.accounts.length === 0 && <EmptyState title="Nothing set up yet" action={<a className="btn btn-primary" href={base + "/onboarding"}>Start setup</a>} />}
      </div>
    </>
  );
}
