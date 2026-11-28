import { NoticedView } from "@/components/noticed-view";
import { noticed } from "@/lib/view/noticed";
import { TxnDrillProvider } from "@/components/txn-drill";
import { CashFlowCard } from "@/components/spend-insights";
import { cashFlow, monthBuckets, payPeriodBuckets } from "@/lib/view/spend";
import { BudgetView } from "@/components/budget-view";
import { MoneyTabs } from "@/components/money-tabs";
import { ReportsView } from "@/components/reports-view";
import { PageHeader } from "@/components/ui";
import type { ViewProps } from "./types";
import { buildDashboard } from "@/lib/view/dashboard";
import { buildBudget, categoryItems, groupOf, spendingReport } from "@/lib/view/budget";
import { PatternsView } from "@/components/patterns-view";
import { lifeSummary } from "@/lib/view/life";
import { exploreData } from "@/lib/view/explore";

export function PatternsPage({ snapshot, today, nowIso, demo = false }: ViewProps) {
  const m = buildDashboard(snapshot, today, 30, new Date(nowIso));
  const { model: _model, ...life } = lifeSummary(snapshot, today, m);
  return (
    <>
      <PageHeader title="Money" subtitle="Habits we noticed in your spending, and what your everyday life will likely cost in the weeks ahead. Nothing here is a judgment: it just helps the numbers match real life." />
      <MoneyTabs base={demo ? "/demo" : "/app"} />
      <PatternsView {...life} explore={exploreData(snapshot, today)} />
    </>
  );
}

export function BudgetPage({ snapshot, today, nowIso, demo = false }: ViewProps) {
  const m = buildDashboard(snapshot, today, 30, new Date(nowIso));
  const plans = m.allEvents.map((v) => ({ title: v.event.title, date: v.event.date, cents: v.advice?.capCents ?? 0, category: v.event.category }));
  return (
    <>
      <PageHeader title="Money" subtitle="This month's budget: where your income goes. Needs (rent, groceries), wants (eating out, shopping) and savings. Tap a category to see its spending or set your own amount." />
      <MoneyTabs base={demo ? "/demo" : "/app"} />
      {(() => {
        const history = spendingReport(snapshot, today, 6);
        return <TxnDrillProvider txns={snapshot.transactions} accounts={snapshot.accounts} today={today}><BudgetView plan={buildBudget(snapshot, today, plans)} demo={demo} history={history} items={categoryItems(snapshot, today, history[0]!.month)} /></TxnDrillProvider>;
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
      <PageHeader title="Money" subtitle="Where your money went, month by month or paycheck by paycheck, and money in versus out. Tap a group or category to focus on it." />
      <MoneyTabs base={demo ? "/demo" : "/app"} />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
        <TxnDrillProvider txns={snapshot.transactions} accounts={snapshot.accounts} today={today}>
          <ReportsView
            byMonth={byMonth}
            byPeriod={byPeriod}
            groupOf={Object.fromEntries([...names].map((c) => [c, groupOf(c, snapshot)]))}
            items={categoryItems(snapshot, today, from)}
          />
        </TxnDrillProvider>
        {(() => {
          const periods = payPeriodBuckets(snapshot, today);
          return <CashFlowCard months={cashFlow(snapshot, today, monthBuckets(today))} periods={periods ? cashFlow(snapshot, today, periods) : null} />;
        })()}
      </div>
    </>
  );
}

/** Trends: how your spending is changing (by month or pay period), your habits, and money in versus out. */
export function TrendsPage({ snapshot, today, demo = false }: ViewProps) {
  const byMonth = spendingReport(snapshot, today, 12, "month");
  const byPeriod = spendingReport(snapshot, today, 12, "period");
  const names = new Set([...byMonth, ...byPeriod].flatMap((x) => Object.keys(x.categories)));
  const from = [byMonth[0]?.month, byPeriod[0]?.month].filter(Boolean).sort()[0] ?? today;
  const periods = payPeriodBuckets(snapshot, today);
  return (
    <>
      <PageHeader title="Money" subtitle="How your spending is changing, the habits behind it, and money in versus out. Tap any bar or category to drill in." />
      <MoneyTabs base={demo ? "/demo" : "/app"} />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
        <TxnDrillProvider txns={snapshot.transactions} accounts={snapshot.accounts} today={today}>
          <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
            <NoticedView items={noticed(snapshot, today)} base={demo ? "/demo" : "/app"} />
            <ReportsView chart={false} byMonth={byMonth} byPeriod={byPeriod} groupOf={Object.fromEntries([...names].map((c) => [c, groupOf(c, snapshot)]))} items={categoryItems(snapshot, today, from)} />
          </div>
        </TxnDrillProvider>
        <CashFlowCard months={cashFlow(snapshot, today, monthBuckets(today))} periods={periods ? cashFlow(snapshot, today, periods) : null} />
      </div>
    </>
  );
}
