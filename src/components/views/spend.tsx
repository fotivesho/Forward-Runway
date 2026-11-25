import { QuickAction } from "@/components/form";
import { Money } from "@/components/privacy";
import { AddButton, RecurringTiles, type RuleTile } from "@/components/spend-modals";
import { CashFlowCard } from "@/components/spend-insights";
import { TransactionList } from "@/components/transaction-list";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import type { ViewProps } from "./types";
import { addDays, formatShort, startOfMonth } from "@/lib/dates";
import { ruleOccurrences, type RecurringRule } from "@/lib/engine";
import { monthlyEquivalent } from "@/lib/view/dashboard";
import { cashFlow, categoryHistory, monthBuckets, payPeriodBuckets, weekBuckets } from "@/lib/view/spend";
import { deleteTransfer } from "@/app/app/actions";

const GROUPS: Array<{ title: string; kinds: RecurringRule["kind"][] }> = [
  { title: "Income", kinds: ["income"] },
  { title: "Bills & subscriptions", kinds: ["bill", "subscription", "expense"] },
  { title: "Debt & savings", kinds: ["loan_payment", "card_payment", "savings_transfer", "transfer"] },
];

/** Spend: what repeats (tiles), cash flow, then every transaction with its category. Edits open in pop-ups. */
export function SpendView({ snapshot, today }: ViewProps) {
  const accountName = (id?: string | null) => snapshot.accounts.find((a) => a.id === id)?.name ?? "—";
  const accounts = snapshot.accounts;
  const hasAccounts = accounts.some((a) => !a.archived);
  const monthStart = startOfMonth(today);
  const active = snapshot.rules.filter((r) => r.active !== false);
  const monthlyIn = active.filter((r) => r.kind === "income").reduce((t, r) => t + monthlyEquivalent(r), 0);
  const monthlyOut = active.filter((r) => r.kind !== "income").reduce((t, r) => t + monthlyEquivalent(r), 0);
  const spentThisMonth = snapshot.transactions
    .filter((t) => t.direction === "out" && t.status === "posted" && t.date >= monthStart && t.date <= today)
    .reduce((s, t) => s + t.amountCents, 0);
  const txns = [...snapshot.transactions].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)).slice(0, 300);
  const transfers = [...snapshot.transfers].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 100);

  const tile = (r: RecurringRule): RuleTile => {
    const occurrences = ruleOccurrences(r, snapshot.overrides, addDays(today, -7), addDays(today, 60));
    return {
      rule: r,
      occurrences,
      next: occurrences.find((o) => o.date >= today)?.date ?? null,
      onCard: accounts.find((a) => a.id === r.accountId)?.kind === "credit_card" && !r.toAccountId,
      from: accountName(r.accountId),
      to: r.toAccountId ? accountName(r.toAccountId) : null,
    };
  };

  // Insights, computed on the server from your own data.
  const months = monthBuckets(today);
  const periods = payPeriodBuckets(snapshot, today);
  const weeks = weekBuckets(today);
  const categories = [...new Set(snapshot.transactions.filter((t) => t.direction === "out").map((t) => t.category ?? "Other"))];
  const trends = Object.fromEntries(
    categories.map((c) => [c, { month: categoryHistory(snapshot, c, months, today), week: categoryHistory(snapshot, c, weeks, today) }]),
  );

  return (
    <>
      <PageHeader title="Spend" subtitle="What repeats, where your money goes, and everything you've spent. Tap anything to change it." />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
        <ul className="grid grid-cols-3 gap-2 sm:gap-3">
          <Summary label="Spent this month" value={<Money cents={spentThisMonth} whole />} />
          <Summary label="In / month" value={<Money cents={monthlyIn} whole tone="in" />} />
          <Summary label="Out / month" value={<Money cents={-monthlyOut} whole tone="out" />} />
        </ul>

        <Card title="Repeating" action={hasAccounts ? <AddButton what="rule" accounts={accounts} today={today} /> : undefined}>
          {!hasAccounts && <EmptyState title="Add an account first">Repeating items need an account to come from or go to.</EmptyState>}
          <div className="space-y-4">
            {GROUPS.map((g) => {
              const rules = snapshot.rules.filter((r) => g.kinds.includes(r.kind));
              if (rules.length === 0) return null;
              return (
                <section key={g.title} aria-label={g.title}>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">{g.title}</h3>
                  <RecurringTiles tiles={rules.map(tile)} accounts={accounts} today={today} />
                </section>
              );
            })}
          </div>
        </Card>

        <CashFlowCard months={cashFlow(snapshot, today, months)} periods={periods ? cashFlow(snapshot, today, periods) : null} />

        <Card title="Transactions" action={hasAccounts ? <AddButton what="transaction" accounts={accounts} today={today} /> : undefined}>
          <TransactionList txns={txns} accounts={accounts} today={today} monthStart={monthStart} trends={trends} />
        </Card>

        <Card title="Transfers & card payments" action={hasAccounts ? <AddButton what="transfer" accounts={accounts} today={today} /> : undefined}>
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
