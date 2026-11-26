import { AccountForm, BalanceForm, GoalForm, StatementForm } from "@/components/entity-forms";
import { QuickAction } from "@/components/form";
import { Money } from "@/components/privacy";
import { Badge, Card, Disclosure, EmptyState, PageHeader } from "@/components/ui";
import type { ViewProps } from "./types";
import { BankConnections, type BankConnectionView } from "@/components/bank-connect";
import { diffDays, formatShort } from "@/lib/dates";
import { archiveAccount, deleteAccount, deleteGoal, deleteStatement, markStatementPaid } from "@/app/app/actions";
import { ReplaceWithBankForm } from "@/components/replace-with-bank";

const KIND = { checking: "Checking", savings: "Savings", cash: "Cash", credit_card: "Credit card", loan: "Loan" } as const;
const SOURCE = { manual: "entered by you", statement: "from a statement", import: "imported", onboarding: "from setup", bank: "from your bank" } as const;

export function AccountsView({
  snapshot,
  today,
  demo = false,
  bank,
  bankSetupMissing,
}: ViewProps & { bank?: { mode: "mock" | "sandbox" | "production"; connections: BankConnectionView[] }; bankSetupMissing?: string[] }) {
  const accounts = snapshot.accounts;
  const active = accounts.filter((a) => !a.archived);
  const archived = accounts.filter((a) => a.archived);
  return (
    <>
      <PageHeader title="Accounts & goals" subtitle="Balances are the opening balance on their “as of” date. Keep spendable balances fresh for an accurate forecast." />
      <div className="grid gap-4">
        {bank && !demo && <BankConnections mode={bank.mode} connections={bank.connections} />}
        {!bank && !demo && bankSetupMissing && (
          <section className="card border-warn/50 p-4 text-sm sm:p-5">
            <h2 className="text-base font-semibold text-ink">Bank connections are almost set up</h2>
            <p className="mt-1 text-muted">These settings are missing or not quite right on the server (Vercel → Settings → Environment Variables, Production), then redeploy:</p>
            <ul className="mt-2 list-disc pl-5 font-mono text-xs text-ink">{bankSetupMissing.map((m) => <li key={m}>{m}</li>)}</ul>
          </section>
        )}
        {active.length === 0 && <EmptyState title="No accounts yet">{bank ? "Connect your bank above, or add your checking account by hand." : "Add your checking account first."}</EmptyState>}
        {active.map((a) => {
          const age = a.balanceAsOf ? diffDays(a.balanceAsOf, today) : null;
          const stale = age == null || age > (a.kind === "credit_card" ? Math.max(7, snapshot.settings.staleAfterDays) : a.isSpendable ? snapshot.settings.staleAfterDays : 30);
          const statements = snapshot.statements.filter((s) => s.accountId === a.id).sort((x, y) => (x.closingDate < y.closingDate ? 1 : -1));
          const liability = a.kind === "credit_card" || a.kind === "loan";
          return (
            <Card key={a.id} title={<>{a.name} <span className="ml-1 align-middle"><Badge>{KIND[a.kind]}</Badge></span> {a.isSpendable && <Badge tone="good">Spendable</Badge>} {a.bankConnectionId && <Badge tone="info" title="Kept up to date by your bank">🏦 Bank</Badge>}</>}>
              <p className="text-2xl font-semibold">
                {a.balanceCents == null ? <span className="text-danger text-base">No balance yet</span> : <Money cents={a.balanceCents} />}
                {liability && a.balanceCents != null && <span className="ml-1 text-sm text-muted">owed</span>}
              </p>
              <p className="text-xs text-muted">
                {a.balanceAsOf ? `As of ${formatShort(a.balanceAsOf)} (${age === 0 ? "today" : `${age} day${age === 1 ? "" : "s"} ago`})` : "No date"} · {SOURCE[a.balanceSource]}
                {stale && <span className="text-warn"> · out of date</span>}
              </p>
              {a.kind === "credit_card" && (
                <p className="mt-1 text-xs text-muted">
                  Closes on day {a.statementCloseDay ?? "?"} · due on day {a.paymentDueDay ?? "?"} · {a.payInFull !== false ? "paid in full" : "minimum payments"}
                  {a.aprBps != null && ` · ${(a.aprBps / 100).toFixed(2)}% APR`}
                </p>
              )}
              {(() => {
                // A hand-entered account next to a connected one of the same type is probably the same account.
                if (a.bankConnectionId || demo) return null;
                const fam = (k: string) => (k === "credit_card" ? "card" : k === "loan" ? "loan" : "cash");
                const options = active.filter((b) => b.bankConnectionId && fam(b.kind) === fam(a.kind));
                if (options.length === 0) return null;
                return (
                  <div className="mt-3 rounded-xl border border-warn/50 bg-warn/5 p-3 text-sm">
                    <p className="font-medium text-ink">Is this the same account your bank now keeps up to date?</p>
                    <p className="mt-0.5 text-xs text-muted">If so, replace it: your paydays, bills, card payments, goals and plans move to the bank account and this one is archived, so your money isn't counted twice.</p>
                    <div className="mt-2"><ReplaceWithBankForm from={a.id} options={options.map((b) => ({ id: b.id, name: b.name }))} /></div>
                  </div>
                );
              })()}
              <div className="mt-3"><BalanceForm account={a} today={today} /></div>
              {a.kind === "credit_card" && (
                <div className="mt-3">
                  <h3 className="mb-1 text-sm font-semibold">Statements</h3>
                  {statements.length === 0 ? (
                    <p className="text-sm text-muted">No statements yet. Add the latest one so the next payment is exact rather than estimated.</p>
                  ) : (
                    <ul className="divide-y divide-line text-sm">
                      {statements.slice(0, 6).map((s) => (
                        <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                          <span>
                            Closed {formatShort(s.closingDate)} · <Money cents={s.statementBalanceCents} /> · due {formatShort(s.dueDate)}{" "}
                            {s.status === "paid" ? <Badge tone="good">Paid</Badge> : s.status === "partial" ? <Badge tone="warn">Partly paid (<Money cents={s.paidCents} />)</Badge> : s.dueDate < today ? <Badge tone="bad">Past due</Badge> : <Badge tone="info">Unpaid — scheduled on due date</Badge>}
                          </span>
                          <span className="flex gap-1">
                            {s.status !== "paid" && <QuickAction action={markStatementPaid} fields={{ id: s.id }} variant="secondary">Mark paid</QuickAction>}
                            <QuickAction action={deleteStatement} fields={{ id: s.id }} confirm="Delete this statement?" label="Delete statement">Delete</QuickAction>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="mt-2"><Disclosure summary="Add a statement"><StatementForm card={a} /></Disclosure></div>
                </div>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                <div className="w-full"><Disclosure summary="Edit account details"><AccountForm account={a} accounts={accounts} today={today} /></Disclosure></div>
                <QuickAction action={archiveAccount} fields={{ id: a.id, archived: "true" }} variant="secondary">Archive</QuickAction>
                <QuickAction action={deleteAccount} fields={{ id: a.id }} variant="danger" confirm={`Delete ${a.name} and everything linked to it (recurring items, transactions, statements)? This can't be undone.`}>Delete</QuickAction>
              </div>
            </Card>
          );
        })}
        <Card title="Add an account"><AccountForm accounts={accounts} today={today} /></Card>

        <Card title="Savings goals">
          {snapshot.goals.length === 0 ? (
            <p className="mb-3 text-sm text-muted">Add your wedding fund (or any goal) to keep it separate from spendable cash and track progress.</p>
          ) : (
            <ul className="mb-3 space-y-2">
              {snapshot.goals.map((g) => (
                <li key={g.id} className="rounded-xl border border-line p-3">
                  <p className="font-medium">{g.name} {g.protected !== false && <Badge>Protected</Badge>}</p>
                  <p className="text-sm text-muted">Target <Money cents={g.targetCents} />{g.targetDate && ` by ${formatShort(g.targetDate)}`} · held in {accounts.find((a) => a.id === g.accountId)?.name ?? "no account"}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <div className="w-full"><Disclosure summary="Edit goal"><GoalForm goal={g} accounts={accounts} /></Disclosure></div>
                    <QuickAction action={deleteGoal} fields={{ id: g.id }} variant="danger" confirm="Delete this goal? The account and its money stay.">Delete goal</QuickAction>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <Disclosure summary="Add a goal"><GoalForm accounts={accounts} /></Disclosure>
        </Card>

        {archived.length > 0 && (
          <Card title="Archived accounts">
            <ul className="space-y-2 text-sm">
              {archived.map((a) => (
                <li key={a.id} className="flex items-center justify-between">
                  <span>{a.name}</span>
                  <QuickAction action={archiveAccount} fields={{ id: a.id, archived: "false" }} variant="secondary">Restore</QuickAction>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </>
  );
}
