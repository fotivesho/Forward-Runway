"use client";

import { useState } from "react";
import { saveCategorySetting } from "@/app/app/actions";
import { formatLong, formatShort } from "@/lib/dates";
import { centsToInput } from "@/lib/money";
import { iconFor } from "@/lib/categories";
import { GROUPS, type BudgetPlan, type CategoryBudget, type CategoryItem, type SpendingReport } from "@/lib/view/budget";
import type { CategoryGroup } from "@/lib/data/snapshot";
import { ActionForm, MoneyField, SelectField, Submit } from "./form";
import { Modal } from "./modal";
import { Money } from "./privacy";
import { Badge } from "./ui";

const GROUP_COLOR: Record<CategoryGroup, string> = { needs: "bg-info", wants: "bg-brand", savings: "bg-warn" };

/** Spent against budget, with a tick where you'd be if you spent evenly through the month. */
function PaceBar({ spent, budget, progress }: { spent: number; budget: number; progress: number }) {
  const scale = Math.max(budget, spent, 1);
  const over = spent > budget;
  const done = !over && budget > 0 && spent >= budget * 0.97;
  const ahead = !over && !done && spent > budget * progress * 1.1 && budget > 0;
  return (
    <div className="relative mt-1 h-2 rounded-full bg-surface-3" aria-hidden>
      <div className={`h-2 rounded-full ${over ? "bg-danger" : ahead ? "bg-warn" : "bg-brand"}`} style={{ width: `${Math.min(100, (spent / scale) * 100)}%` }} />
      {budget > 0 && <span className="absolute -inset-y-0.5 w-0.5 rounded bg-ink/60" style={{ left: `${Math.min(100, ((budget * progress) / scale) * 100)}%` }} title="Even pace" />}
    </div>
  );
}

function status(c: { spentCents: number; budgetCents: number }, progress: number) {
  if (c.budgetCents === 0 && c.spentCents === 0) return null;
  if (c.spentCents > c.budgetCents) return <span className="text-danger">over by <Money cents={c.spentCents - c.budgetCents} whole /></span>;
  if (c.budgetCents > 0 && c.spentCents >= c.budgetCents * 0.97) return <span className="text-muted">✓ done for the month</span>;
  if (c.spentCents > c.budgetCents * progress * 1.1) return <span className="text-warn">ahead of pace · <Money cents={c.budgetCents - c.spentCents} whole /> left</span>;
  return <span className="text-brand"><Money cents={c.budgetCents - c.spentCents} whole /> left</span>;
}

export function BudgetView({
  plan,
  demo,
  history,
  items,
}: {
  plan: BudgetPlan;
  demo: boolean;
  /** Last months' spending per category (oldest first), for the category pop-up. */
  history: SpendingReport;
  items: Record<string, CategoryItem[]>;
}) {
  const [edit, setEdit] = useState<CategoryBudget | null>(null);
  const monthName = new Date(`${plan.month}T12:00:00Z`).toLocaleString("en-US", { month: "long", timeZone: "UTC" });
  const spendingBudget = plan.groups.needs.budgetCents + plan.groups.wants.budgetCents;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
      {/* Where the month's income goes. */}
      <section className="card p-4 sm:p-5" aria-labelledby="split-title">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="split-title" className="text-base font-semibold text-ink">{monthName}'s plan</h2>
          <span className="text-xs text-muted">{Math.round(plan.progress * 100)}% through the month</span>
        </div>
        {plan.incomeCents > 0 ? (
          <>
            <p className="mt-1 text-sm text-muted">
              <Money cents={plan.incomeCents} whole className="font-semibold text-ink" /> income{plan.incomeSource === "history" ? " (your recent average)" : ""} goes to:
            </p>
            <div className="mt-3 flex h-4 overflow-hidden rounded-full bg-surface-3" aria-hidden>
              {GROUPS.map((g) => (
                <span key={g.id} className={GROUP_COLOR[g.id]} style={{ width: `${Math.max(0, (plan.groups[g.id].budgetCents / Math.max(plan.incomeCents, 1)) * 100)}%` }} />
              ))}
            </div>
            <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {GROUPS.map((g) => (
                <li key={g.id} className="rounded-xl bg-surface-2/60 p-2.5">
                  <p className="flex items-center gap-1.5 text-xs text-faint"><span className={`h-2 w-2 rounded-full ${GROUP_COLOR[g.id]}`} />{g.label}</p>
                  <p className="text-lg font-bold tabular text-ink"><Money cents={plan.groups[g.id].budgetCents} whole /></p>
                  <p className="text-[11px] text-muted">{Math.round((plan.groups[g.id].budgetCents / Math.max(plan.incomeCents, 1)) * 100)}% of income</p>
                </li>
              ))}
              <li className="rounded-xl bg-surface-2/60 p-2.5">
                <p className="text-xs text-faint">{plan.unassignedCents >= 0 ? "Left unassigned" : "Over income"}</p>
                <p className={`text-lg font-bold tabular ${plan.unassignedCents >= 0 ? "text-ink" : "text-danger"}`}><Money cents={Math.abs(plan.unassignedCents)} whole /></p>
                <p className="text-[11px] text-muted">{plan.unassignedCents > 0 ? "buffer, or save more" : plan.unassignedCents < 0 ? "trim a want or a plan" : "every dollar has a job"}</p>
              </li>
            </ul>
            {plan.plansCents > 0 && (
              <p className="mt-2 text-xs text-muted">
                Includes <Money cents={plan.plansCents} whole /> set aside for calendar plans: {plan.plans.map((p) => `${p.title} (${formatShort(p.date)})`).join(", ")}.
              </p>
            )}
          </>
        ) : (
          <p className="mt-1 text-sm text-muted">Add your paycheck as repeating (Money → Overview) so budgets can start from your income.</p>
        )}
        {plan.notes.length > 0 && <ul className="mt-2 space-y-1 text-xs text-muted">{plan.notes.map((n) => <li key={n}>• {n}</li>)}</ul>}
      </section>

      {/* Each group and its categories. */}
      {GROUPS.filter((g) => g.id !== "savings").map((g) => {
        const cats = plan.categories.filter((c) => c.group === g.id);
        const group = { spentCents: cats.reduce((t, c) => t + c.spentCents, 0), budgetCents: plan.groups[g.id].budgetCents - (g.id === "wants" ? plan.plansCents : 0) };
        return (
          <details key={g.id} className="card group p-4 sm:p-5">
            <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
              <span className="flex items-baseline justify-between gap-2">
                <span className="text-base font-semibold text-ink">
                  <span className={`mr-2 inline-block h-2.5 w-2.5 rounded-full ${GROUP_COLOR[g.id]}`} />
                  {g.label}
                  <span aria-hidden className="ml-2 inline-block text-sm text-faint transition group-open:rotate-90">▸</span>
                </span>
                <span className="text-sm tabular"><Money cents={group.spentCents} whole className="font-semibold text-ink" /> <span className="text-muted">of <Money cents={group.budgetCents} whole /></span></span>
              </span>
              <PaceBar spent={group.spentCents} budget={group.budgetCents} progress={plan.progress} />
              <span className="mt-1 flex justify-between text-xs text-muted">
                <span>{status(group, plan.progress) ?? g.hint}</span>
                <span className="group-open:hidden">{cats.length} categor{cats.length === 1 ? "y" : "ies"}</span>
              </span>
            </summary>
            {cats.length === 0 ? (
              <p className="mt-3 text-sm text-muted">Nothing here yet.</p>
            ) : (
              <ul className="mt-3 divide-y divide-line border-t border-line">
                {cats.map((c) => (
                  <li key={c.category}>
                    <button type="button" onClick={() => setEdit(c)} className="w-full py-2.5 text-left" aria-haspopup="dialog">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="min-w-0 truncate text-sm font-medium text-ink">
                          <span aria-hidden>{iconFor(c.category)}</span> {c.category} {c.yours ? <Badge>Yours</Badge> : <Badge tone="info">Smart</Badge>}
                        </span>
                        <span className="shrink-0 text-sm tabular"><Money cents={c.spentCents} whole /> <span className="text-muted">/ <Money cents={c.budgetCents} whole /></span></span>
                      </span>
                      <PaceBar spent={c.spentCents} budget={c.budgetCents} progress={plan.progress} />
                      <span className="mt-0.5 flex justify-between text-[11px] text-muted">
                        <span>{status(c, plan.progress)}</span>
                        <span>usual <Money cents={c.usualCents} whole /> ›</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </details>
        );
      })}

      <details className="rounded-xl border border-line p-3 text-sm">
        <summary className="cursor-pointer font-medium text-ink">How smart budgets work</summary>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted">
          <li>Start with your income for the month.</li>
          <li>Savings come off the top: your savings transfers and goal contributions.</li>
          <li>Calendar plans this month are set aside next, at their caps.</li>
          <li>Each category starts at your usual month (the average of your last {plan.monthsOfHistory || "few"} full months).</li>
          <li>If that doesn't fit, needs keep their usual amount and wants shrink to fit.</li>
          <li>No history yet? It starts from 50/30/20. Any budget you set yourself always wins.</li>
        </ol>
        <p className="mt-2 text-xs text-faint">The tick on each bar is where you'd be spending evenly through the month. Card payments and transfers never count as spending.</p>
      </details>

      {edit && (
        <Modal open onClose={() => setEdit(null)} icon={iconFor(edit.category)} title={edit.category} subtitle={<><Money cents={edit.spentCents} whole /> of <Money cents={edit.budgetCents} whole /> this month · usually <Money cents={edit.usualCents} whole /></>}>
          <CategoryHistory category={edit.category} budget={edit.budgetCents} history={history} />
          <CategoryTransactions items={items[edit.category] ?? []} />
          <section className="mt-4 border-t border-line pt-4" aria-label="Group and budget">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">Group and budget</h3>
            <ActionForm action={saveCategorySetting} onSuccess={() => setEdit(null)} className="grid gap-3" aria-label={`Budget for ${edit.category}`}>
              <input type="hidden" name="name" value={edit.category} />
              <SelectField name="group" label="Group" defaultValue={edit.group} options={GROUPS.map((g) => ({ value: g.id, label: `${g.label}: ${g.hint}` }))} />
              <MoneyField name="budget" label="Monthly budget" defaultValue={edit.yours ? centsToInput(edit.budgetCents) : ""} placeholder={`Smart: ${centsToInput(edit.budgetCents)}`} hint="Leave blank to let the app suggest one each month." />
              <Submit>Save</Submit>
              {demo && <p className="text-xs text-muted">Demo: saving is off.</p>}
            </ActionForm>
          </section>
        </Modal>
      )}
    </div>
  );
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthName = (m: string) => MONTHS[Number(m.slice(5, 7)) - 1]!;

/** The last months for one category, with this month's budget as a line. */
function CategoryHistory({ category, budget, history }: { category: string; budget: number; history: SpendingReport }) {
  const vals = history.map((m) => ({ month: m.month, current: m.current, cents: m.categories[category] ?? 0 }));
  const max = Math.max(1, budget, ...vals.map((v) => v.cents));
  // The same "usual month" the budget uses: the last three full months that had any spending.
  const full = vals.filter((v) => !v.current).slice(-3);
  const counted = history.filter((m) => !m.current).slice(-3).filter((m) => Object.keys(m.categories).length > 0).length || 1;
  const avg = Math.round(full.reduce((t, v) => t + v.cents, 0) / counted);
  return (
    <section aria-label="Spending by month">
      <div className="relative">
        {budget > 0 && (
          <span className="pointer-events-none absolute inset-x-0 border-t border-dashed border-ink/50" style={{ bottom: `calc(1.25rem + ${(budget / max) * 7}rem)` }} aria-hidden>
            <span className="absolute -top-4 right-0 rounded bg-surface px-1 text-[10px] text-muted">budget</span>
          </span>
        )}
        <ol className="grid items-end gap-1.5" style={{ gridTemplateColumns: `repeat(${vals.length}, minmax(0, 1fr))` }}>
          {vals.map((v) => (
            <li key={v.month} className="flex flex-col items-center">
              <span className="mb-0.5 text-[9px] tabular text-muted"><Money cents={v.cents} whole /></span>
              <span className="flex h-28 w-full max-w-8 items-end">
                <span className={`w-full rounded-t ${v.cents > budget && budget > 0 ? "bg-warn" : "bg-brand"} ${v.current ? "opacity-60" : ""}`} style={{ height: `${Math.max(v.cents ? 3 : 0, (v.cents / max) * 100)}%` }} />
              </span>
              <span className={`mt-1 h-4 text-[10px] ${v.current ? "font-semibold text-ink" : "text-faint"}`}>{monthName(v.month)}</span>
            </li>
          ))}
        </ol>
      </div>
      <p className="mt-1 text-xs text-muted">Usual month <Money cents={avg} whole /> (average of the last 3 full months). Faded = this month so far; amber = over this month's budget.</p>
    </section>
  );
}

/** Every transaction in the category, grouped by month with a subtotal. */
function CategoryTransactions({ items }: { items: CategoryItem[] }) {
  const byMonth = new Map<string, CategoryItem[]>();
  for (const i of items) byMonth.set(i.date.slice(0, 7), [...(byMonth.get(i.date.slice(0, 7)) ?? []), i]);
  if (items.length === 0) return <p className="mt-4 text-sm text-muted">No transactions in the last few months.</p>;
  return (
    <section className="mt-4 space-y-2" aria-label="Transactions">
      {[...byMonth.entries()].map(([m, list], idx) => (
        <details key={m} open={idx === 0} className="rounded-xl border border-line">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-sm [&::-webkit-details-marker]:hidden">
            <span className="font-semibold text-ink">{monthName(`${m}-01`)} {m.slice(0, 4)} <span className="font-normal text-muted">· {list.length}</span></span>
            <Money cents={list.reduce((t, i) => t + i.cents, 0)} whole className="font-semibold text-ink" />
          </summary>
          <ul className="divide-y divide-line border-t border-line">
            {list.map((i, k) => (
              <li key={`${i.date}-${k}`} className="flex items-center justify-between gap-2 px-3 py-1.5 text-sm">
                <span className="min-w-0">
                  <span className="block truncate text-ink">{i.label}</span>
                  <span className="block text-[11px] text-muted">
                    {formatLong(i.date)} · {i.account}
                    {i.repeating && " · repeating"}
                    {i.pending && " · pending"}
                  </span>
                </span>
                <Money cents={-i.cents} sign tone="auto" className="shrink-0 tabular" />
              </li>
            ))}
          </ul>
        </details>
      ))}
    </section>
  );
}
