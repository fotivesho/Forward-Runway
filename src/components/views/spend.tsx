import { RuleForm, TransactionForm, TransferForm } from "@/components/entity-forms";
import { OccurrenceControls } from "@/components/occurrence-controls";
import { QuickAction } from "@/components/form";
import { Money } from "@/components/privacy";
import { TransactionList } from "@/components/transaction-list";
import { iconFor } from "@/lib/categories";
import { Badge, Card, Disclosure, EmptyState, PageHeader } from "@/components/ui";
import type { ViewProps } from "./types";
import { addDays, formatShort, startOfMonth } from "@/lib/dates";
import { describeSchedule, ruleOccurrences, type RecurringRule } from "@/lib/engine";
import { monthlyEquivalent } from "@/lib/view/dashboard";
import { deleteRule, deleteTransfer, toggleRule } from "@/app/app/actions";

const GROUPS: Array<{ title: string; kinds: RecurringRule["kind"][] }> = [
  { title: "Income", kinds: ["income"] },
  { title: "Bills & subscriptions", kinds: ["bill", "subscription", "expense"] },
  { title: "Debt & savings", kinds: ["loan_payment", "card_payment", "savings_transfer", "transfer"] },
];

const KIND_ICON: Partial<Record<RecurringRule["kind"], string>> = { income: "💰", loan_payment: "🏦", card_payment: "💳", savings_transfer: "🐷", transfer: "↔️", subscription: "🔁" };

/** Spend: recurring money as tiles, then every transaction with its category. */
export function SpendView({ snapshot, today }: ViewProps) {
  const accountName = (id?: string | null) => snapshot.accounts.find((a) => a.id === id)?.name ?? "—";
  const hasAccounts = snapshot.accounts.some((a) => !a.archived);
  const monthStart = startOfMonth(today);
  const active = snapshot.rules.filter((r) => r.active !== false);
  const monthlyIn = active.filter((r) => r.kind === "income").reduce((t, r) => t + monthlyEquivalent(r), 0);
  const monthlyOut = active.filter((r) => r.kind !== "income").reduce((t, r) => t + monthlyEquivalent(r), 0);
  const spentThisMonth = snapshot.transactions
    .filter((t) => t.direction === "out" && t.status === "posted" && t.date >= monthStart && t.date <= today)
    .reduce((s, t) => s + t.amountCents, 0);
  const txns = [...snapshot.transactions].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)).slice(0, 200);
  const transfers = [...snapshot.transfers].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 100);

  return (
    <>
      <PageHeader title="Spend" subtitle="What repeats, and everything you've spent. Card purchases count once, when you buy." />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
        <ul className="grid grid-cols-3 gap-2 sm:gap-3">
          <Summary label="Spent this month" value={<Money cents={spentThisMonth} whole />} />
          <Summary label="In / month" value={<Money cents={monthlyIn} whole tone="in" />} />
          <Summary label="Out / month" value={<Money cents={-monthlyOut} whole tone="out" />} />
        </ul>

        <Card title="Repeating">
          {!hasAccounts && <EmptyState title="Add an account first">Repeating items need an account to come from or go to.</EmptyState>}
          <div className="space-y-4">
            {GROUPS.map((g) => {
              const rules = snapshot.rules.filter((r) => g.kinds.includes(r.kind));
              if (rules.length === 0) return null;
              return (
                <section key={g.title} aria-label={g.title}>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">{g.title}</h3>
                  <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                    {rules.map((r) => {
                      const occ = ruleOccurrences(r, snapshot.overrides, addDays(today, -7), addDays(today, 60));
                      const next = occ.find((o) => o.date >= today);
                      const isIncome = r.kind === "income";
                      const onCard = snapshot.accounts.find((a) => a.id === r.accountId)?.kind === "credit_card" && !r.toAccountId;
                      return (
                        <li key={r.id} className="contents">
                          <details className={`group rounded-xl border p-3 open:col-span-full ${isIncome ? "border-brand/40 bg-brand/[0.06]" : "border-line bg-surface-2/50"} ${r.active === false ? "opacity-60" : ""}`}>
                            <summary className="flex cursor-pointer list-none flex-col gap-0.5">
                              <span className="flex items-center justify-between gap-1">
                                <span aria-hidden className="text-lg">{KIND_ICON[r.kind] ?? iconFor(r.category)}</span>
                                <span className="text-[11px] text-faint">{next ? `Next ${formatShort(next.date)}` : r.active === false ? "Paused" : ""}</span>
                              </span>
                              <span className="truncate text-sm font-medium text-ink">{r.name}</span>
                              <Money cents={isIncome ? r.amountCents : -r.amountCents} sign tone="auto" className="text-lg font-bold" />
                              <span className="truncate text-[11px] text-muted">{describeSchedule(r.schedule)}</span>
                              <span className="flex flex-wrap gap-1">
                                {r.isEstimate && <Badge tone="warn">Estimate</Badge>}
                                {onCard && <Badge title="Charged to a card; paid with the statement">On card</Badge>}
                              </span>
                            </summary>
                            <div className="mt-3 border-t border-line pt-3">
                              <p className="text-xs text-muted">
                                {isIncome ? "Into" : "From"} {accountName(r.accountId)}
                                {r.toAccountId && ` → ${accountName(r.toAccountId)}`}
                                {r.category && ` · ${r.category}`}
                              </p>
                              {occ.length > 0 && (
                                <ul className="mt-2 divide-y divide-line/60 text-sm">
                                  {occ.slice(0, 4).map((o) => (
                                    <li key={o.originalDate} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                                      <span>
                                        {formatShort(o.date)} · <Money cents={o.amountCents} />
                                        {o.posted && <> <Badge tone="good">Already in balance</Badge></>}
                                        {o.movedFrom && <> <Badge tone="info">moved from {formatShort(o.movedFrom)}</Badge></>}
                                        {o.overridden && !o.posted && !o.movedFrom && <> <Badge tone="info">changed</Badge></>}
                                      </span>
                                      <OccurrenceControls ruleId={r.id} originalDate={o.originalDate} date={o.date} amountCents={o.amountCents} overridden={o.overridden} />
                                    </li>
                                  ))}
                                </ul>
                              )}
                              <div className="mt-2 flex flex-wrap gap-2">
                                <div className="w-full"><Disclosure summary="Edit"><RuleForm rule={r} accounts={snapshot.accounts} today={today} /></Disclosure></div>
                                <QuickAction action={toggleRule} fields={{ id: r.id, active: r.active === false ? "true" : "false" }} variant="secondary">{r.active === false ? "Resume" : "Pause"}</QuickAction>
                                <QuickAction action={deleteRule} fields={{ id: r.id }} variant="danger" confirm={`Delete “${r.name}” and all its date changes?`}>Delete</QuickAction>
                              </div>
                            </div>
                          </details>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })}
          </div>
          {hasAccounts && (
            <div className="mt-4">
              <Disclosure summary="Add a payday, bill or subscription"><RuleForm accounts={snapshot.accounts} today={today} /></Disclosure>
            </div>
          )}
        </Card>

        <Card title="Transactions">
          {hasAccounts && (
            <div className="mb-3">
              <Disclosure summary="Add income or spending"><TransactionForm accounts={snapshot.accounts} today={today} /></Disclosure>
            </div>
          )}
          <TransactionList txns={txns} accounts={snapshot.accounts} today={today} monthStart={monthStart} />
        </Card>

        <Card title="Transfers & card payments">
          {transfers.length === 0 ? (
            <p className="text-sm text-muted">No one-time transfers. Statement payments are scheduled automatically from your card statements.</p>
          ) : (
            <ul className="divide-y divide-line">
              {transfers.map((t) => (
                <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <span><span className="mr-2 text-faint tabular">{formatShort(t.date)}</span>{accountName(t.fromAccountId)} → {accountName(t.toAccountId)}{t.note ? ` · ${t.note}` : ""} {t.cleared && <Badge>In balance</Badge>}</span>
                  <span className="flex items-center gap-2"><Money cents={t.amountCents} className="font-semibold" /><QuickAction action={deleteTransfer} fields={{ id: t.id }} confirm="Delete this transfer?" label="Delete transfer">✕</QuickAction></span>
                </li>
              ))}
            </ul>
          )}
          {hasAccounts && <div className="mt-3"><Disclosure summary="Add a transfer or card payment"><TransferForm accounts={snapshot.accounts} today={today} /></Disclosure></div>}
        </Card>
      </div>
    </>
  );
}

function Summary({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <li className="card min-w-0 p-2.5 sm:p-4">
      <p className="truncate text-[11px] text-faint sm:text-xs">{label}</p>
      <p className="mt-0.5 truncate text-lg font-bold tabular text-ink sm:text-2xl">{value}</p>
    </li>
  );
}
