"use client";

import { useState } from "react";
import { saveCategorySetting } from "@/app/app/actions";
import { formatShort } from "@/lib/dates";
import { centsToInput } from "@/lib/money";
import { iconFor } from "@/lib/categories";
import { GROUPS, type BudgetPlan, type CategoryBudget } from "@/lib/view/budget";
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

export function BudgetView({ plan, demo }: { plan: BudgetPlan; demo: boolean }) {
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
          <section key={g.id} className="card p-4 sm:p-5" aria-labelledby={`grp-${g.id}`}>
            <div className="flex items-baseline justify-between gap-2">
              <h2 id={`grp-${g.id}`} className="text-base font-semibold text-ink"><span className={`mr-2 inline-block h-2.5 w-2.5 rounded-full ${GROUP_COLOR[g.id]}`} />{g.label}</h2>
              <p className="text-sm tabular"><Money cents={group.spentCents} whole className="font-semibold text-ink" /> <span className="text-muted">of <Money cents={group.budgetCents} whole /></span></p>
            </div>
            <PaceBar spent={group.spentCents} budget={group.budgetCents} progress={plan.progress} />
            <p className="mt-1 text-xs text-muted">{g.hint}</p>
            {cats.length === 0 ? (
              <p className="mt-3 text-sm text-muted">Nothing here yet.</p>
            ) : (
              <ul className="mt-3 divide-y divide-line">
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
                        <span>usual <Money cents={c.usualCents} whole /></span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
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
        <Modal open onClose={() => setEdit(null)} icon={iconFor(edit.category)} title={edit.category} subtitle={<>Usually <Money cents={edit.usualCents} whole /> a month · <Money cents={edit.spentCents} whole /> so far this month</>}>
          <ActionForm action={saveCategorySetting} onSuccess={() => setEdit(null)} className="grid gap-3" aria-label={`Budget for ${edit.category}`}>
            <input type="hidden" name="name" value={edit.category} />
            <SelectField name="group" label="Group" defaultValue={edit.group} options={GROUPS.map((g) => ({ value: g.id, label: `${g.label}: ${g.hint}` }))} />
            <MoneyField name="budget" label="Monthly budget" defaultValue={edit.yours ? centsToInput(edit.budgetCents) : ""} placeholder={`Smart: ${centsToInput(edit.budgetCents)}`} hint="Leave blank to let the app suggest one each month." />
            <Submit>Save</Submit>
            {demo && <p className="text-xs text-muted">Demo: saving is off.</p>}
          </ActionForm>
        </Modal>
      )}
    </div>
  );
}
