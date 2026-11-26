import { BudgetView } from "@/components/budget-view";
import { MoneyTabs } from "@/components/money-tabs";
import { ReportsView } from "@/components/reports-view";
import { PageHeader } from "@/components/ui";
import type { ViewProps } from "./types";
import { buildDashboard } from "@/lib/view/dashboard";
import { buildBudget, categoryItems, groupOf, spendingReport } from "@/lib/view/budget";

export function BudgetPage({ snapshot, today, nowIso, demo = false }: ViewProps) {
  const m = buildDashboard(snapshot, today, 30, new Date(nowIso));
  const plans = m.allEvents.map((v) => ({ title: v.event.title, date: v.event.date, cents: v.advice?.capCents ?? 0 }));
  return (
    <>
      <PageHeader title="Money" subtitle="A plan for this month: needs, wants and savings, built from your income and your usual month." />
      <MoneyTabs base={demo ? "/demo" : "/app"} />
      {(() => {
        const history = spendingReport(snapshot, today, 6);
        return <BudgetView plan={buildBudget(snapshot, today, plans)} demo={demo} history={history} items={categoryItems(snapshot, today, history[0]!.month)} />;
      })()}
    </>
  );
}

export function ReportsPage({ snapshot, today, demo = false }: ViewProps) {
  const report12 = spendingReport(snapshot, today, 12);
  const names = new Set(report12.flatMap((m) => Object.keys(m.categories)));
  return (
    <>
      <PageHeader title="Money" subtitle="Slice and dice: groups and categories over time." />
      <MoneyTabs base={demo ? "/demo" : "/app"} />
      <ReportsView report6={report12.slice(-6)} report12={report12} groupOf={Object.fromEntries([...names].map((c) => [c, groupOf(c, snapshot)]))} />
    </>
  );
}
