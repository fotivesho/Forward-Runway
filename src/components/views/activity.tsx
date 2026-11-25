import { TransactionForm, TransferForm } from "@/components/entity-forms";
import { QuickAction } from "@/components/form";
import { Money } from "@/components/privacy";
import { Badge, Card, Disclosure, EmptyState, PageHeader } from "@/components/ui";
import type { ViewProps } from "./types";
import { formatShort } from "@/lib/dates";
import { deleteTransaction, deleteTransfer } from "@/app/app/actions";

export function ActivityView({ snapshot, today, demo = false }: ViewProps) {
  const name = (id: string) => snapshot.accounts.find((a) => a.id === id)?.name ?? "Deleted account";
  const kindOf = (id: string) => snapshot.accounts.find((a) => a.id === id)?.kind;
  const txns = [...snapshot.transactions].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 150);
  const transfers = [...snapshot.transfers].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 100);
  return (
    <>
      <PageHeader title="Activity" subtitle="One-time income and spending, planned purchases, transfers and card payments." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Add income or spending"><TransactionForm accounts={snapshot.accounts} today={today} /></Card>
        <Card title="Add a transfer or card payment"><TransferForm accounts={snapshot.accounts} today={today} /></Card>
        <Card title="Transactions" className="lg:col-span-2">
          {txns.length === 0 ? (
            <EmptyState title="Nothing logged yet">Logging spending lets Runway learn your pattern and recalculate today's cap.</EmptyState>
          ) : (
            <ul className="divide-y divide-line">
              {txns.map((t) => (
                <li key={t.id} className="py-2">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-sm text-ink"><span className="mr-2 text-faint tabular">{formatShort(t.date)}</span>{t.description}</p>
                      <p className="mt-0.5 flex flex-wrap gap-1 text-xs">
                        <Badge>{name(t.accountId)}</Badge>
                        {t.category && <Badge>{t.category}</Badge>}
                        {t.status === "planned" && <Badge tone="info">Planned</Badge>}
                        {t.cleared && <Badge title="Already reflected in the balance">In balance</Badge>}
                        {kindOf(t.accountId) === "credit_card" && t.direction === "out" && <Badge title="Paid later with the statement">On card</Badge>}
                        {t.isEstimate && <Badge tone="warn">Estimate</Badge>}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Money cents={t.direction === "in" ? t.amountCents : -t.amountCents} sign tone="auto" className="text-sm font-semibold" />
                      <QuickAction action={deleteTransaction} fields={{ id: t.id }} confirm="Delete this transaction?" label={`Delete ${t.description}`}>✕</QuickAction>
                    </div>
                  </div>
                  <div className="mt-1"><Disclosure summary="Edit"><TransactionForm accounts={snapshot.accounts} today={today} txn={t} /></Disclosure></div>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Transfers & card payments" className="lg:col-span-2">
          {transfers.length === 0 ? (
            <p className="text-sm text-muted">No one-time transfers. Statement payments are scheduled automatically from your card statements.</p>
          ) : (
            <ul className="divide-y divide-line">
              {transfers.map((t) => (
                <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <span><span className="mr-2 text-faint tabular">{formatShort(t.date)}</span>{name(t.fromAccountId)} → {name(t.toAccountId)}{t.note ? ` · ${t.note}` : ""} {t.cleared && <Badge>In balance</Badge>}</span>
                  <span className="flex items-center gap-2"><Money cents={t.amountCents} className="font-semibold" /><QuickAction action={deleteTransfer} fields={{ id: t.id }} confirm="Delete this transfer?" label="Delete transfer">✕</QuickAction></span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
