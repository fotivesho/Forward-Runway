import type { Metadata } from "next";
import { RuleForm } from "@/components/entity-forms";
import { OccurrenceControls } from "@/components/occurrence-controls";
import { QuickAction } from "@/components/form";
import { Money } from "@/components/privacy";
import { Badge, Card, Disclosure, EmptyState, PageHeader } from "@/components/ui";
import { getAppSession } from "@/lib/data/session";
import { addDays, formatShort } from "@/lib/dates";
import { describeSchedule, ruleOccurrences } from "@/lib/engine";
import { deleteRule, toggleRule } from "../actions";

export const metadata: Metadata = { title: "Bills & pay" };

const GROUPS: Array<{ title: string; kinds: string[] }> = [
  { title: "Income", kinds: ["income"] },
  { title: "Bills & subscriptions", kinds: ["bill", "subscription", "expense"] },
  { title: "Debt & card payments", kinds: ["loan_payment", "card_payment"] },
  { title: "Savings & transfers", kinds: ["savings_transfer", "transfer"] },
];

export default async function PlansPage() {
  const { snapshot, today } = await getAppSession();
  const accountName = (id?: string | null) => snapshot.accounts.find((a) => a.id === id)?.name ?? "—";
  const hasAccounts = snapshot.accounts.some((a) => !a.archived);
  return (
    <>
      <PageHeader title="Bills & pay" subtitle="Paydays, bills, loan payments and savings transfers that repeat. Change or skip a single date without touching the rest." />
      <div className="grid gap-4">
        {!hasAccounts && <EmptyState title="Add an account first">Recurring items need an account to come from or go to.</EmptyState>}
        {GROUPS.map((g) => {
          const rules = snapshot.rules.filter((r) => g.kinds.includes(r.kind));
          return (
            <Card key={g.title} title={g.title}>
              {rules.length === 0 ? (
                <p className="text-sm text-muted">None yet.</p>
              ) : (
                <ul className="space-y-3">
                  {rules.map((r) => {
                    const occ = ruleOccurrences(r, snapshot.overrides, addDays(today, -7), addDays(today, 60)).slice(0, 4);
                    const onCard = snapshot.accounts.find((a) => a.id === r.accountId)?.kind === "credit_card" && !r.toAccountId;
                    return (
                      <li key={r.id} className={`rounded-xl border border-line p-3 ${r.active === false ? "opacity-60" : ""}`}>
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <p className="font-medium">{r.name} {r.isEstimate && <Badge tone="warn">Estimate</Badge>} {r.active === false && <Badge>Paused</Badge>} {onCard && <Badge title="Charged to a card; paid with the statement">On card</Badge>}</p>
                            <p className="text-xs text-muted">
                              {describeSchedule(r.schedule)} · {r.kind === "income" ? "into" : "from"} {accountName(r.accountId)}
                              {r.toAccountId && ` → ${accountName(r.toAccountId)}`}
                              {r.category && ` · ${r.category}`}
                            </p>
                          </div>
                          <Money cents={r.kind === "income" ? r.amountCents : -r.amountCents} sign tone="auto" className="font-semibold" />
                        </div>
                        {occ.length > 0 && (
                          <ul className="mt-2 divide-y divide-line/60 text-sm">
                            {occ.map((o) => (
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
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          );
        })}
        {hasAccounts && <Card title="Add a recurring item"><RuleForm accounts={snapshot.accounts} today={today} /></Card>}
      </div>
    </>
  );
}
