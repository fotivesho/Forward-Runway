import { QuickAction } from "@/components/form";
import { Money } from "@/components/privacy";
import { AddButton, RecurringTiles, type RuleTile } from "@/components/spend-modals";
import { CashFlowCard } from "@/components/spend-insights";
import { TransactionList } from "@/components/transaction-list";
import { isNotSpending } from "@/lib/categories";
import { findRecurring } from "@/lib/view/recurring";
import { RecurringSuggestions } from "@/components/recurring-suggestions";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import type { ViewProps } from "./types";
import { addDays, formatShort, startOfMonth } from "@/lib/dates";
import { ruleOccurrences, type RecurringRule } from "@/lib/engine";
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
  const spentThisMonth = snapshot.transactions
    // Card payments and transfers between your own accounts aren't spending: the purchases already counted.
    .filter((t) => t.direction === "out" && t.status === "posted" && t.date >= monthStart && t.date <= today && !isNotSpending(t.category))
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
      orphaned: [r.accountId, r.toAccountId].some((id) => id && accounts.find((a) => a.id === id)?.archived),
    };
  };

  // Insights, computed on the server from your own data.
  const months = monthBuckets(today);
  const periods = payPeriodBuckets(snapshot, today);
  const weeks = weekBuckets(today);
  const categories = [...new Set(snapshot.transactions.filter((t) => t.direction === "out").map((t) => t.category ?? "Other"))];
  // Your categories, most used first (for the category picker).
  const useCount = new Map<string, number>();
  for (const t of snapshot.transactions) if (t.category) useCount.set(t.category, (useCount.get(t.category) ?? 0) + 1);
  for (const r of snapshot.rules) if (r.category) useCount.set(r.category, (useCount.get(r.category) ?? 0) + 1);
  const yourCategories = [...useCount.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c).slice(0, 12);
  // This month so far plus what's scheduled, the same numbers as the cash-flow chart.
  const flowMonths = cashFlow(snapshot, today, months);
  const thisMonth = flowMonths[flowMonths.length - 1]!;
  const dismissed = new Set(
    snapshot.corrections.filter((c) => c.kind === "preference" && c.matchKey.startsWith("recurring_dismissed:")).map((c) => c.matchKey.slice("recurring_dismissed:".length)),
  );
  const suggestions = findRecurring(snapshot.transactions, snapshot.rules, today, dismissed);
  const trends = Object.fromEntries(
    categories.map((c) => [c, { month: categoryHistory(snapshot, c, months, today), week: categoryHistory(snapshot, c, weeks, today) }]),
  );

  return (
    <>
      <PageHeader title="Money" subtitle="Money in and out: what repeats, where it goes, and every transaction. Tap anything to change it." />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
        <ul className="grid grid-cols-3 gap-2 sm:gap-3">
          <Summary label="Spent this month" value={<Money cents={spentThisMonth} whole />} />
          <Summary label="In this month" value={<Money cents={thisMonth.inCents} whole tone="in" />} />
          <Summary label="Net this month" value={<Money cents={thisMonth.inCents - thisMonth.outCents} whole sign tone="auto" />} />
        </ul>

        <Card title="Repeating" action={hasAccounts ? <AddButton what="rule" accounts={accounts} today={today} /> : undefined}>
          {!hasAccounts && <EmptyState title="Add an account first">Repeating items need an account to come from or go to.</EmptyState>}
          <RecurringSuggestions suggestions={suggestions} accounts={accounts} today={today} />
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

        <CashFlowCard months={flowMonths} periods={periods ? cashFlow(snapshot, today, periods) : null} />

        <Card title="Transactions" action={hasAccounts ? <AddButton what="transaction" accounts={accounts} today={today} /> : undefined}>
          <TransactionList txns={txns} accounts={accounts} today={today} monthStart={monthStart} trends={trends} categories={yourCategories} />
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
