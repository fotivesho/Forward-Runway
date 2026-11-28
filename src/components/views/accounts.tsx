import { AccountForm, BalanceForm, GoalForm, StatementForm } from "@/components/entity-forms";
import { QuickAction } from "@/components/form";
import { Money } from "@/components/privacy";
import { Badge, Disclosure, EmptyState, PageHeader } from "@/components/ui";
import { AccountGrid, AddInModal, type AccountTile } from "@/components/account-grid";
import { Info } from "@/components/info";
import type { ViewProps } from "./types";
import { BankConnections, type BankConnectionView } from "@/components/bank-connect";
import { addDays, diffDays, formatShort } from "@/lib/dates";
import { archiveAccount, deleteAccount, deleteGoal, deleteStatement, markStatementPaid } from "@/app/app/actions";
import { ReplaceWithBankForm } from "@/components/replace-with-bank";
import { BankAccountPanel } from "@/components/bank-account-panel";
import { CardRoomView } from "@/components/card-room";
import { cardRoom } from "@/lib/view/card-room";
import { avgDailyCardSpend, buildForecast, everydayCash, everydayPaySplit } from "@/lib/engine";
import { buildDashboard } from "@/lib/view/dashboard";
import { toEngineInput } from "@/lib/data/snapshot";
import { CashPath } from "@/components/cash-path";
import { Glyph } from "@/components/icon";
import { predict, spendModel } from "@/lib/view/patterns";

const SOURCE = { manual: "Entered by you", statement: "from a statement", import: "imported", onboarding: "from setup", bank: "From your bank" } as const;

export function AccountsView({
  snapshot,
  today,
  demo = false,
  bank,
  bankSetupMissing,
}: ViewProps & { bank?: { mode: "mock" | "sandbox" | "production"; connections: BankConnectionView[]; redirectReady?: boolean }; bankSetupMissing?: string[] }) {
  const accounts = snapshot.accounts;
  const active = accounts.filter((a) => !a.archived);
  const archived = accounts.filter((a) => a.archived);
  const input = toEngineInput(snapshot, today);
  const forecast = buildForecast(input, 90);
  const nowMs = Date.now();
  const fam = (k: string) => (k === "credit_card" ? "card" : k === "loan" ? "loan" : "cash");
  const ago = (iso: string | null) => {
    if (!iso) return "never";
    const h = Math.round((nowMs - Date.parse(iso)) / 3_600_000);
    return h < 1 ? "just now" : h < 48 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
  };
  const isStale = (a: (typeof active)[number]) => {
    const age = a.balanceAsOf ? diffDays(a.balanceAsOf, today) : null;
    return age == null || age > (a.kind === "credit_card" ? Math.max(7, snapshot.settings.staleAfterDays) : a.isSpendable ? snapshot.settings.staleAfterDays : 30);
  };

  // Totals for the picture at the top.
  const sum = (f: (a: (typeof active)[number]) => boolean) => active.filter(f).reduce((t, a) => t + (a.balanceCents ?? 0), 0);
  const cash = sum((a) => a.isSpendable && fam(a.kind) === "cash");
  const saved = sum((a) => !a.isSpendable && fam(a.kind) === "cash");
  const cardsOwed = sum((a) => a.kind === "credit_card");
  const loans = sum((a) => a.kind === "loan");
  const assets = cash + saved;
  const owed = cardsOwed + loans;
  const scale = Math.max(1, assets, owed);

  // Cash ahead: scheduled only, and with usual everyday life on top.
  const path = (() => {
    const days = forecast.days.slice(0, 61);
    if (days.length < 2 || !active.some((a) => a.isSpendable)) return null;
    const model = spendModel(snapshot, today);
    const p = model ? predict(model, today, days[days.length - 1]!.date) : null;
    const cash = p ? everydayCash(input, forecast, (d) => p.byDay[d] ?? 0) : null;
    return {
      dates: days.map((d) => d.date),
      scheduled: days.map((d) => d.closingCents),
      real: cash ? days.map((d, i) => d.closingCents - cash.cumulative[i]!) : null,
    };
  })();

  // The same card spending at your daily limits (what Today and Day by day show): each day's limit,
  // times the share of everyday spending that goes on this card.
  const dash = active.some((a) => a.kind === "credit_card" && a.bankConnectionId) ? buildDashboard(snapshot, today, 30) : null;
  const split = dash ? everydayPaySplit(input) : [];
  const limitOn = (d: string): number => {
    if (!dash) return 0;
    const c = dash.plan.days.find((x) => x.date === d);
    if (c) return c.capCents;
    const base = dash.baselineByDay[d];
    if (base == null) return 0;
    return base + dash.allEvents.filter((v) => v.event.date === d).reduce((t, v) => t + (v.advice?.capCents ?? 0), 0);
  };
  const atLimits = (accountId: string, closing: string): number | null => {
    const share = split.find((x) => x.accountId === accountId)?.share ?? 0;
    if (!dash || share <= 0) return null;
    let t = 0;
    for (let d = today; d < closing; d = addDays(d, 1)) t += limitOn(d) * share;
    return Math.round(t);
  };

  const detailFor = (a: (typeof active)[number]) => {
    const statements = snapshot.statements.filter((st) => st.accountId === a.id).sort((x, y) => (x.closingDate < y.closingDate ? 1 : -1));
    if (a.bankConnectionId) {
      const projection = forecast.cards.find((c) => c.accountId === a.id);
      const next = projection?.statements.find((st) => st.isProjected);
      const usual = a.kind === "credit_card" && next ? avgDailyCardSpend(input, a.id) * Math.max(0, diffDays(today, next.closingDate)) : 0;
      return (
        <div className="grid gap-4">
          <BankAccountPanel account={a} statements={statements} transactions={snapshot.transactions} projection={projection} usualCardSpendCents={usual} limitCardSpendCents={next ? atLimits(a.id, next.closingDate) : null} today={today} nowMs={nowMs} />
          {a.kind === "credit_card" && <CardRoomView rooms={cardRoom(snapshot, today, a.id)} />}
        </div>
      );
    }
    const options = active.filter((b) => b.bankConnectionId && fam(b.kind) === fam(a.kind));
    return (
      <div className="grid gap-4">
        <p className="text-xs text-muted">
          {SOURCE[a.balanceSource]} · {a.balanceAsOf ? `as of ${formatShort(a.balanceAsOf)}` : "no date"}
          {a.kind === "credit_card" && <> · closes day {a.statementCloseDay ?? "?"} · due day {a.paymentDueDay ?? "?"}</>}
        </p>
        {!demo && options.length > 0 && (
          <div className="rounded-xl border border-warn/50 bg-warn/5 p-3 text-sm">
            <p className="font-medium text-ink">
              Same as a bank account?
              <Info label="Replace with a bank account">Swap this hand-entered account for the matching one from your bank. Your paydays, bills, card payments, goals and plans move over to the bank account, and this one is archived, so nothing gets counted twice.</Info>
            </p>
            <div className="mt-2"><ReplaceWithBankForm from={a.id} options={options.map((b) => ({ id: b.id, name: b.name }))} /></div>
          </div>
        )}
        <BalanceForm account={a} today={today} />
        {a.kind === "credit_card" && (
          <section>
            <h3 className="mb-1 text-sm font-bold text-ink">Statements</h3>
            <ul className="divide-y divide-line text-sm">
              {statements.slice(0, 6).map((st) => (
                <li key={st.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>
                    <Money cents={st.statementBalanceCents} whole /> · due {formatShort(st.dueDate)}{" "}
                    {st.status === "paid" ? <Badge tone="good">Paid</Badge> : st.status === "partial" ? <Badge tone="warn">Part paid</Badge> : st.dueDate < today ? <Badge tone="bad">Past due</Badge> : <Badge tone="info">Unpaid</Badge>}
                  </span>
                  <span className="flex gap-1">
                    {st.status !== "paid" && <QuickAction action={markStatementPaid} fields={{ id: st.id }} variant="secondary">Paid</QuickAction>}
                    <QuickAction action={deleteStatement} fields={{ id: st.id }} confirm="Delete this statement?" label="Delete statement">✕</QuickAction>
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-2"><Disclosure summary="Add a statement"><StatementForm card={a} /></Disclosure></div>
          </section>
        )}
        <Disclosure summary="Edit details"><AccountForm account={a} accounts={accounts} today={today} /></Disclosure>
        <div className="flex flex-wrap gap-2">
          <QuickAction action={archiveAccount} fields={{ id: a.id, archived: "true" }} variant="secondary">Archive</QuickAction>
          <QuickAction action={deleteAccount} fields={{ id: a.id }} variant="danger" confirm={`Delete ${a.name} and everything linked to it? This can't be undone.`}>Delete</QuickAction>
        </div>
      </div>
    );
  };

  const ICON = { checking: "💳", savings: "🛟", cash: "💵", credit_card: "💳", loan: "🏦" } as const;
  // Accounts that hold a goal show once, as the goal.
  const goalAccounts = new Set(snapshot.goals.map((g) => g.accountId).filter(Boolean));
  const tiles: AccountTile[] = active.filter((a) => !goalAccounts.has(a.id)).map((a) => {
    const owedSide = a.kind === "credit_card" || a.kind === "loan";
    const latest = snapshot.statements.filter((st) => st.accountId === a.id).sort((x, y) => (x.closingDate < y.closingDate ? 1 : -1))[0];
    const stale = isStale(a);
    const used = a.kind === "credit_card" && a.creditLimitCents ? ((a.balanceCents ?? 0) / a.creditLimitCents) * 100 : null;
    return {
      id: a.id,
      name: a.name,
      icon: a.kind === "checking" ? "🏦" : ICON[a.kind],
      cents: a.balanceCents == null ? null : owedSide ? -a.balanceCents : a.balanceCents,
      tag: a.bankConnectionId ? "Bank" : a.isSpendable ? "Spend" : undefined,
      warn: stale && !a.bankConnectionId,
      bar: used != null ? { pct: used, tone: used > 70 ? "bad" : used > 30 ? "warn" : "good" } : undefined,
      sub:
        a.kind === "credit_card" && latest && latest.status !== "paid"
          ? <>bill <Money cents={latest.statementBalanceCents - latest.paidCents} whole /> · {formatShort(latest.dueDate)}</>
          : stale && !a.bankConnectionId
            ? "Update balance"
            : ago(a.balanceUpdatedAt),
      detail: detailFor(a),
    };
  });

  const goalTiles: AccountTile[] = snapshot.goals.map((g) => {
    const bal = g.accountId ? (forecast.openingByAccount[g.accountId] ?? 0) : 0;
    const pct = g.targetCents ? (bal / g.targetCents) * 100 : 0;
    return {
      id: `goal-${g.id}`,
      name: g.name,
      icon: g.protected !== false ? "🔒" : "🎯",
      cents: bal,
      bar: { pct, tone: "good" },
      sub: <>{Math.round(pct)}% of <Money cents={g.targetCents} whole />{g.targetDate ? ` · ${formatShort(g.targetDate)}` : ""}</>,
      detail: (
        <div className="grid gap-3">
          {(() => {
            const acct = active.find((x) => x.id === g.accountId);
            return acct ? (acct.bankConnectionId ? <p className="text-xs text-muted">Held in {acct.name}, kept up to date by your bank.</p> : <BalanceForm account={acct} today={today} />) : null;
          })()}
          <Disclosure summary="Edit goal"><GoalForm goal={g} accounts={accounts} /></Disclosure>
          <QuickAction action={deleteGoal} fields={{ id: g.id }} variant="danger" confirm="Delete this goal? The account and its money stay.">Delete goal</QuickAction>
        </div>
      ),
    };
  });

  return (
    <>
      <PageHeader title="Accounts" action={<span className="flex items-center gap-2"><AddInModal label="+ Add" title="Add an account" icon="🏦"><AccountForm accounts={accounts} today={today} /></AddInModal><a href={(demo ? "/demo" : "/app") + "/settings"} aria-label="Settings" className="flex h-10 w-10 items-center justify-center rounded-full border border-line text-muted transition hover:text-ink">⚙︎</a></span>} />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
        {!bank && !demo && bankSetupMissing && (
          <section className="card border-warn/50 p-4 text-sm">
            <p className="font-semibold text-ink">Bank connections: settings missing <Info>Vercel → Settings → Environment Variables (Production), then redeploy.</Info></p>
            <ul className="mt-1 list-disc pl-5 font-mono text-xs text-ink">{bankSetupMissing.map((m) => <li key={m}>{m}</li>)}</ul>
          </section>
        )}

        {/* The whole picture: what you have vs what you owe */}
        <section className="card overflow-hidden" aria-label="Net worth">
          <div className="bg-gradient-to-br from-surface-3 to-surface p-4 sm:p-5">
          <h2 className="text-base font-bold text-ink">Net worth <Info label="Net worth">Everything you own minus everything you owe. Add up your cash and savings, then subtract what&apos;s on your credit cards and loans. Watching it grow over time is one of the simplest signs of progress.</Info></h2>
          <p className={`mt-1 font-num text-6xl leading-none tracking-tight tabular ${assets - owed < 0 ? "text-danger" : "text-display"}`}><Money cents={assets - owed} whole sign={assets - owed < 0} /></p>
          <p className="mt-1 text-sm text-muted">
            Have <Money cents={assets} whole className="font-semibold text-ink" /> · Owe <Money cents={owed} whole className="font-semibold text-ink" />
          </p>
          <div className="mt-3 space-y-1.5">
            <div className="flex h-3 overflow-hidden rounded-full bg-surface-3" aria-hidden>
              <span className="bg-brand" style={{ width: `${(cash / scale) * 100}%` }} />
              <span className="bg-info" style={{ width: `${(saved / scale) * 100}%` }} />
            </div>
            <div className="flex h-3 overflow-hidden rounded-full bg-surface-3" aria-hidden>
              <span className="bg-warn" style={{ width: `${(cardsOwed / scale) * 100}%` }} />
              <span className="bg-danger/80" style={{ width: `${(loans / scale) * 100}%` }} />
            </div>
          </div>
          <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs sm:grid-cols-4">
            {[
              ["bg-brand", "Cash", cash],
              ["bg-info", "Savings", saved],
              ["bg-warn", "Cards", -cardsOwed],
              ["bg-danger/80", "Loans", -loans],
            ].map(([cls, label, v]) => (
              <li key={label as string} className="flex items-center justify-between gap-1">
                <span className="text-muted"><span className={`mr-1 inline-block h-2 w-2 rounded-full ${cls}`} />{label}</span>
                <Money cents={v as number} whole sign={(v as number) < 0} className="font-semibold tabular text-ink" />
              </li>
            ))}
          </ul>
          </div>
          {path && (
            <div className="border-t border-line p-4 sm:p-5">
              <p className="flex items-center justify-between text-sm font-bold text-ink">
                <span>Cash ahead</span>
                <Info label="Cash ahead">Two pictures of your checking balance over the next two months. <strong className="font-semibold">Scheduled</strong> (faint line) only counts what&apos;s on the calendar: paychecks, bills and plans. <strong className="font-semibold">Real life</strong> also subtracts your usual everyday spending, so it&apos;s closer to what will really happen. The dashed line is your cushion, the amount you never want to go below.</Info>
              </p>
              <div className="mt-2">
                <CashPath
                  dates={path.dates}
                  floorCents={snapshot.settings.cashFloorCents}
                  lines={[
                    { id: "sched", label: "Scheduled", cents: path.scheduled, color: "text-muted", faint: true },
                    ...(path.real ? [{ id: "real", label: "Real life", cents: path.real, color: "text-brand" }] : []),
                  ]}
                />
              </div>
            </div>
          )}
        </section>

        {active.length === 0 ? (
          <EmptyState title="No accounts yet" />
        ) : (
          <AccountGrid tiles={tiles} />
        )}

        <section aria-labelledby="goals-h">
          <div className="mb-2 flex items-center justify-between">
            <h2 id="goals-h" className="text-sm font-bold text-ink">Goals <Info label="Goals">Money you&apos;re setting aside for something specific, like a trip or an emergency fund. Goals with a lock (<Glyph name="🔒" size="xs" />) are protected: the app will never suggest using them to pay for something else.</Info></h2>
            <AddInModal label="+ Goal" title="Add a goal" icon="🎯"><GoalForm accounts={accounts} /></AddInModal>
          </div>
          {goalTiles.length > 0 ? <AccountGrid tiles={goalTiles} /> : <p className="text-sm text-muted">No goals yet.</p>}
        </section>

        {bank && !demo && <BankConnections mode={bank.mode} connections={bank.connections} redirectReady={bank.redirectReady} />}

        {archived.length > 0 && (
          <Disclosure summary={`Archived (${archived.length})`}>
            <ul className="space-y-2 text-sm">
              {archived.map((a) => (
                <li key={a.id} className="flex items-center justify-between">
                  <span>{a.name}</span>
                  <QuickAction action={archiveAccount} fields={{ id: a.id, archived: "false" }} variant="secondary">Restore</QuickAction>
                </li>
              ))}
            </ul>
          </Disclosure>
        )}
      </div>
    </>
  );
}
