import { BudgetView } from "@/components/budget-view";
import { MoneyTabs } from "@/components/money-tabs";
import { ReportsView } from "@/components/reports-view";
import { PageHeader } from "@/components/ui";
import type { ViewProps } from "./types";
import { buildDashboard } from "@/lib/view/dashboard";
import { buildBudget, categoryItems, groupOf, spendingReport } from "@/lib/view/budget";
import { PatternsView } from "@/components/patterns-view";
import { lifeSummary } from "@/lib/view/life";

export function PatternsPage({ snapshot, today, nowIso, demo = false }: ViewProps) {
  const m = buildDashboard(snapshot, today, 30, new Date(nowIso));
  const { model: _model, ...life } = lifeSummary(snapshot, today, m);
  return (
    <>
      <PageHeader title="Money" subtitle="Your patterns, and what's likely ahead." />
      <MoneyTabs base={demo ? "/demo" : "/app"} />
      <PatternsView {...life} />
    </>
  );
}

export function BudgetPage({ snapshot, today, nowIso, demo = false }: ViewProps) {
  const m = buildDashboard(snapshot, today, 30, new Date(nowIso));
  const plans = m.allEvents.map((v) => ({ title: v.event.title, date: v.event.date, cents: v.advice?.capCents ?? 0, category: v.event.category }));
  return (
    <>
      <PageHeader title="Money" subtitle="This month's plan." />
      <MoneyTabs base={demo ? "/demo" : "/app"} />
      {(() => {
        const history = spendingReport(snapshot, today, 6);
        return <BudgetView plan={buildBudget(snapshot, today, plans)} demo={demo} history={history} items={categoryItems(snapshot, today, history[0]!.month)} />;
      })()}
    </>
  );
}

export function ReportsPage({ snapshot, today, demo = false }: ViewProps) {
  const byMonth = spendingReport(snapshot, today, 12, "month");
  const byPeriod = spendingReport(snapshot, today, 12, "period");
  const names = new Set([...byMonth, ...byPeriod].flatMap((m) => Object.keys(m.categories)));
  const from = [byMonth[0]?.month, byPeriod[0]?.month].filter(Boolean).sort()[0] ?? today;
  return (
    <>
      <PageHeader title="Money" subtitle="Tap anything to filter." />
      <MoneyTabs base={demo ? "/demo" : "/app"} />
      <ReportsView
        byMonth={byMonth}
        byPeriod={byPeriod}
        groupOf={Object.fromEntries([...names].map((c) => [c, groupOf(c, snapshot)]))}
        items={categoryItems(snapshot, today, from)}
      />
    </>
  );
}
