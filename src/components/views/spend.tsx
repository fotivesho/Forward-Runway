import { QuickAction } from "@/components/form";
import { Money } from "@/components/privacy";
import { AddButton, RecurringTiles, type RuleTile } from "@/components/spend-modals";
import { TransactionList } from "@/components/transaction-list";
import { MoneyTabs } from "@/components/money-tabs";
import { findRecurring } from "@/lib/view/recurring";
import { ruleHistory } from "@/lib/view/history";
import { RecurringSuggestions } from "@/components/recurring-suggestions";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import type { ViewProps } from "./types";
import { addDays, addMonths, diffDays, endOfMonth, formatShort, startOfMonth } from "@/lib/dates";
import { predict, spendModel } from "@/lib/view/patterns";
import { ruleOccurrences, type RecurringRule } from "@/lib/engine";
import { flowItems, monthBuckets } from "@/lib/view/spend";
import { MonthTiles } from "@/components/month-tiles";
import { BillsOverview, type BillShare } from "@/components/bills-overview";
import { monthlyEquivalent } from "@/lib/view/dashboard";
import type { HistBar } from "@/lib/view/history";
import type { FlowItem } from "@/lib/view/spend";
import { BudgetView } from "@/components/budget-view";
import { buildBudget, categoryItems, spendingReport } from "@/lib/view/budget";
import { buildDashboard } from "@/lib/view/dashboard";
import { deleteTransfer } from "@/app/app/actions";

const GROUPS: Array<{ title: string; kinds: RecurringRule["kind"][] }> = [
  { title: "Income", kinds: ["income"] },
  { title: "Bills & subscriptions", kinds: ["bill", "subscription", "expense"] },
  { title: "Debt & savings", kinds: ["loan_payment", "card_payment", "savings_transfer", "transfer"] },
];

/** Spend: what repeats (tiles), cash flow, then every transaction with its category. Edits open in pop-ups. */
export function SpendView({ snapshot, today, nowIso, demo = false, section = "overview" }: ViewProps & { section?: "overview" | "transactions" | "bills" }) {
  const base = demo ? "/demo" : "/app";
  const accountName = (id?: string | null) => snapshot.accounts.find((a) => a.id === id)?.name ?? "—";
  const accounts = snapshot.accounts;
  const hasAccounts = accounts.some((a) => !a.archived);
  const monthStart = startOfMonth(today);
  // What everyday life usually costs a day from here to month end (your habits, not a flat average).
  const model = spendModel(snapshot, today);
  const left = diffDays(today, endOfMonth(today)) + 1;
  const expectedPerDay = model ? Math.round(predict(model, today, endOfMonth(today)).totalCents / left) : undefined;
  const txns = [...snapshot.transactions].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)).slice(0, 2000);
  const transfers = [...snapshot.transfers].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 100);

  const tile = (r: RecurringRule): RuleTile => {
    const occurrences = ruleOccurrences(r, snapshot.overrides, addDays(today, -7), addDays(today, 60));
    return {
      rule: r,
      occurrences,
      history: ruleHistory(r, snapshot.transactions, snapshot.overrides, today, occurrences),
      next: occurrences.find((o) => o.date >= today)?.date ?? null,
      onCard: accounts.find((a) => a.id === r.accountId)?.kind === "credit_card" && !r.toAccountId,
      from: accountName(r.accountId),
      to: r.toAccountId ? accountName(r.toAccountId) : null,
      orphaned: [r.accountId, r.toAccountId].some((id) => id && accounts.find((a) => a.id === id)?.archived),
    };
  };

  // Insights, computed on the server from your own data.
  const months = monthBuckets(today);
  // Your categories, most used first (for the category picker).
  const useCount = new Map<string, number>();
  for (const t of snapshot.transactions) if (t.category) useCount.set(t.category, (useCount.get(t.category) ?? 0) + 1);
  for (const r of snapshot.rules) if (r.category) useCount.set(r.category, (useCount.get(r.category) ?? 0) + 1);
  const yourCategories = [...new Set([...(snapshot.categorySettings ?? []).filter((c) => c.icon).map((c) => c.name), ...[...useCount.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c).slice(0, 12)])];
  const dismissed = new Set(
    snapshot.corrections.filter((c) => c.kind === "preference" && c.matchKey.startsWith("recurring_dismissed:")).map((c) => c.matchKey.slice("recurring_dismissed:".length)),
  );
  const suggestions = findRecurring(snapshot.transactions, snapshot.rules, today, dismissed);
  // Calendar plans (with their estimated cost), shared by the month picture and the budget.
  const dash = section === "overview" ? buildDashboard(snapshot, today, 30, new Date(nowIso)) : null;
  const plans = dash ? dash.allEvents.map((v) => ({ id: v.event.id, title: v.event.title, date: v.event.date, cents: v.advice?.capCents ?? 0, category: v.event.category })) : [];
  // Per-category history for the one category pop-up used everywhere.
  const report = spendingReport(snapshot, today, 6);
  const catItems = categoryItems(snapshot, today, report[0]!.month);

  return (
    <>
      <PageHeader
        title="Money"
        subtitle={section === "overview"
          ? "This month: what came in, where it's going, and how each category is doing against its budget. Tap anything to see what's in it."
          : section === "bills"
            ? "Everything that repeats (paychecks, rent, subscriptions, savings moves) and transfers between your accounts."
            : "Every purchase and deposit. Search, filter by category, tap one to see its history or change it."}
      />
      <MoneyTabs base={demo ? "/demo" : "/app"} />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
        {section === "overview" && (<>
        <MonthTiles month={monthTitle(today)} items={flowItems(snapshot, today, months[months.length - 1]!, plans)} today={today} expectedPerDayCents={expectedPerDay ?? 0} calendarHref={`${base}/calendar`} limit={dash ? { cents: dash.plan.todayCap.capCents, until: formatShort(dash.plan.allowance.current.end), href: base } : undefined} />
        <BudgetView compact plan={buildBudget(snapshot, today, plans)} demo={demo} history={report} items={catItems} />
        </>)}

        {section === "bills" && (<>
        {(() => {
          // Fixed costs: each repeating item as a monthly amount, against a month of income.
          const live = snapshot.rules.filter((r) => r.active !== false && r.kind !== "card_payment" && r.kind !== "transfer");
          const incomeCents = live.filter((r) => r.kind === "income").reduce((t, r) => t + monthlyEquivalent(r), 0);
          const isCard = (id: string) => accounts.find((a) => a.id === id)?.kind === "credit_card";
          // Bills charged to a card are paid through the card bill: shown, but counted inside it, never twice.
          const bills: BillShare[] = live.filter((r) => r.kind !== "income" && r.kind !== "expense").map((r) => ({ name: r.name, category: r.category ?? null, monthlyCents: monthlyEquivalent(r), kind: r.kind === "savings_transfer" ? "savings" : r.kind === "loan_payment" ? "debt" : "bill", onCard: isCard(r.accountId) && !r.toAccountId }));
          // Each card's monthly bill: the average of its last three statements.
          for (const c of accounts.filter((a) => a.kind === "credit_card" && !a.archived)) {
            const recent = snapshot.statements.filter((st) => st.accountId === c.id && st.closingDate <= today).sort((a, b) => (a.closingDate < b.closingDate ? 1 : -1)).slice(0, 3);
            const avg = recent.length ? Math.round(recent.reduce((t, st) => t + st.statementBalanceCents, 0) / recent.length) : 0;
            if (avg > 0) bills.push({ name: `${c.name} bill`, category: null, monthlyCents: avg, kind: "card", note: recent.length > 1 ? `avg of last ${recent.length}` : "last statement" });
          }
          // Over time: six months back, the next two ahead.
          const next = [1, 2].map((k) => { const m = addMonths(startOfMonth(today), k); return { label: MONTH_NAMES[Number(m.slice(5, 7)) - 1]!.slice(0, 3), start: m, end: endOfMonth(m), current: false }; });
          const fixedOf = (items: FlowItem[]) => items.filter((i) => i.kind === "bill" || i.kind === "savings");
          const byMonth: Record<string, FlowItem[]> = {};
          const bars: HistBar[] = [...months, ...next].map((b) => {
            const list = fixedOf(flowItems(snapshot, today, b).out);
            byMonth[b.start] = list;
            const total = list.reduce((t, i) => t + i.cents, 0);
            const done = list.filter((i) => i.when === "done").reduce((t, i) => t + i.cents, 0);
            const kind = b.current ? "now" : b.start > today ? "ahead" : "past";
            return { key: b.start, label: b.label, title: `${MONTH_NAMES[Number(b.start.slice(5, 7)) - 1]} ${b.start.slice(0, 4)}`, cents: total, kind, doneCents: kind === "now" ? done : undefined };
          });
          return <BillsOverview incomeCents={incomeCents} bills={bills} months={bars} byMonth={byMonth} />;
        })()}
        <Card title="Repeating" action={hasAccounts ? <AddButton what="rule" accounts={accounts} today={today} /> : undefined}>
          {!hasAccounts && <EmptyState title="Add an account first">Repeating items need an account to come from or go to.</EmptyState>}
          <RecurringSuggestions suggestions={suggestions} accounts={accounts} today={today} />
          <div className="space-y-4">
            {GROUPS.map((g) => {
              const rules = snapshot.rules.filter((r) => g.kinds.includes(r.kind));
              if (rules.length === 0) return null;
              return (
                <section key={g.title} aria-label={g.title}>
                  <h3 className="mb-2 text-sm font-bold text-ink">{g.title}</h3>
                  <RecurringTiles tiles={rules.map(tile)} accounts={accounts} today={today} />
                </section>
              );
            })}
          </div>
        </Card>

        </>)}

        {section === "transactions" && (<>
        <Card title="Transactions" action={hasAccounts ? <AddButton what="transaction" accounts={accounts} today={today} /> : undefined}>
          <TransactionList txns={txns} accounts={accounts} today={today} monthStart={monthStart} report={report} catItems={catItems} categories={yourCategories} rules={snapshot.rules} />
        </Card>
        </>)}

        {section === "bills" && (<>
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
        </>)}
      </div>
    </>
  );
}

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const monthTitle = (d: string) => `${MONTH_NAMES[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}`;
