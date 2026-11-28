"use client";

import { useState } from "react";
import { includeCategory, saveCategorySetting } from "@/app/app/actions";
import { formatShort } from "@/lib/dates";
import { GROUPS, type BudgetPlan, type CategoryBudget, type CategoryItem, type SpendingReport } from "@/lib/view/budget";
import type { CategoryGroup } from "@/lib/data/snapshot";
import { ActionForm, QuickAction, SelectField, Submit } from "./form";
import { Modal } from "./modal";
import { Info } from "./info";
import { NewCategoryButton } from "./new-category";
import { CategoryEditButton } from "./category-editor";
import { CategoryReport } from "./reports-view";
import { Money } from "./privacy";
import { Glyph } from "@/components/icon";
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

const LIFE = [
  { k: "billsCents", label: "Bills", color: "bg-out" },
  { k: "plansCents", label: "Plans", color: "bg-info" },
  { k: "everydayCents", label: "Everyday ~", color: "bg-brand" },
  { k: "setAsideCents", label: "Set aside", color: "bg-warn" },
] as const;

/** The month as organized life (bills, plans) and predicted life (everyday, set-asides). */
function LifeSplit({ life, plans }: { life: BudgetPlan["life"]; plans: string[] }) {
  const total = life.billsCents + life.plansCents + life.everydayCents + life.setAsideCents;
  if (!total) return null;
  return (
    <div className="mt-3 rounded-xl border border-line p-2.5">
      <p className="flex items-center justify-between text-xs font-semibold text-muted">
        <span>
          Built from{" "}
          <Info label="Organized and predicted">
            This month&apos;s spending, in four parts. <strong className="font-semibold">Bills</strong> you pay every month. <strong className="font-semibold">Plans</strong> on your calendar{plans.length ? ` (${plans.join(", ")})` : ""}. <strong className="font-semibold">Everyday</strong>: groceries, coffee, gas, predicted from your habits. <strong className="font-semibold">Set aside</strong>: a little each month for costs that come every few months, like car repairs, so they never catch you off guard.
          </Info>
        </span>
        <Money cents={total} whole className="text-ink" />
      </p>
      <div className="mt-1.5 flex h-2 overflow-hidden rounded-full bg-surface-3" aria-hidden>
        {LIFE.map((l) => <span key={l.k} className={l.color} style={{ width: `${(life[l.k] / total) * 100}%` }} />)}
      </div>
      <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted">
        {LIFE.filter((l) => life[l.k] > 0).map((l) => (
          <li key={l.k} className="flex items-center gap-1"><span className={`h-1.5 w-1.5 rounded-full ${l.color}`} />{l.label}<Money cents={life[l.k]} whole className="font-semibold text-ink" /></li>
        ))}
      </ul>
    </div>
  );
}

export function BudgetView({
  plan,
  demo,
  history,
  items,
  compact = false,
}: {
  plan: BudgetPlan;
  demo: boolean;
  /** Last months' spending per category (oldest first), for the category pop-up. */
  history: SpendingReport;
  /** On the Month page: the plan header is replaced by Where it goes, so only the categories show. */
  compact?: boolean;
  items: Record<string, CategoryItem[]>;
}) {
  const [edit, setEdit] = useState<CategoryBudget | null>(null);
  const monthName = new Date(`${plan.month}T12:00:00Z`).toLocaleString("en-US", { month: "long", timeZone: "UTC" });
    return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      {compact ? (
        <div className="flex items-center justify-between gap-2">
          <h2 className="flex items-center text-base font-bold text-ink">
            Budget
            <Info label="How your budget works">
              Built for this month, not copied from last month. Bills and calendar plans count as they&apos;re scheduled; everyday spending is predicted from your habits. If it all doesn&apos;t fit your income, needs keep their amount and wants shrink. A budget you set yourself always wins. The tick on each bar is where you&apos;d be spending evenly. Tap a category to see its history and set its budget.
              {plan.notes.length > 0 && <span className="mt-2 block text-warn">{plan.notes.join(" ")}</span>}
            </Info>
          </h2>
          <NewCategoryButton />
        </div>
      ) : null}
      {/* Where the month's income goes. */}
      {!compact && <section className="card p-4 sm:p-5" aria-labelledby="split-title">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="split-title" className="text-base font-bold text-ink">
            {monthName}'s plan
            <Info label="How smart budgets work">
              Your budget is built for this specific month, not copied from last month. Bills and calendar plans are counted as they&apos;re scheduled. Everyday spending is predicted from your habits, including how many weekends and paydays this month has. Costs that come every few months get a small monthly set-aside. If it all doesn&apos;t fit your income, needs (rent, groceries) keep their amount and wants (eating out, shopping) shrink. A budget you set yourself always wins. The small tick on each bar shows where you&apos;d be if you spent evenly through the month.
              {plan.notes.length > 0 && <span className="mt-2 block text-warn">{plan.notes.join(" ")}</span>}
            </Info>
          </h2>
          <span className="text-xs text-muted">{Math.round(plan.progress * 100)}% through</span>
        </div>
        {plan.incomeCents > 0 ? (
          <>
            <p className="mt-1 text-sm text-muted">
              <Money cents={plan.incomeCents} whole className="font-semibold text-ink" /> income{plan.incomeSource === "history" ? " (avg)" : ""}
            </p>
            <div className="mt-3 flex h-4 overflow-hidden rounded-full bg-surface-3" aria-hidden>
              {GROUPS.map((g) => (
                <span key={g.id} className={GROUP_COLOR[g.id]} style={{ width: `${Math.max(0, (plan.groups[g.id].budgetCents / Math.max(plan.incomeCents, 1)) * 100)}%` }} />
              ))}
            </div>
            <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {GROUPS.map((g) => (
                <li key={g.id} className="rounded-xl bg-surface-2/60 p-2.5">
                  <p className="flex items-center gap-1.5 text-xs font-bold text-ink"><span className={`h-2 w-2 rounded-full ${GROUP_COLOR[g.id]}`} />{g.label}</p>
                  <p className="text-lg font-bold tabular text-ink"><Money cents={plan.groups[g.id].budgetCents} whole /></p>
                  <p className="text-[11px] text-muted">{Math.round((plan.groups[g.id].budgetCents / Math.max(plan.incomeCents, 1)) * 100)}%</p>
                </li>
              ))}
              <li className="rounded-xl bg-surface-2/60 p-2.5">
                <p className="text-xs font-bold text-ink">{plan.unassignedCents >= 0 ? "Unassigned" : "Over income"}</p>
                <p className={`text-lg font-bold tabular ${plan.unassignedCents >= 0 ? "text-ink" : "text-danger"}`}><Money cents={Math.abs(plan.unassignedCents)} whole /></p>
              </li>
            </ul>
            <LifeSplit life={plan.life} plans={plan.plans.map((p) => `${p.title} (${formatShort(p.date)})`)} />
          </>
        ) : (
          <p className="mt-1 text-sm text-muted">No income yet <Info label="No income">Budgets start from what you earn. Add your paycheck as a repeating item (Money → Bills) and your budget will be built from it.</Info></p>
        )}

      </section>}

      {!compact && <div className="-mt-3 flex justify-end"><NewCategoryButton /></div>}

      {plan.excluded.length > 0 && (
        <div className="-mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
          <span className="flex items-center">Not counted<Info label="Not counted">Money in these categories isn&apos;t spending or income anywhere: budgets, Month, limits, trends and your habits leave it out. Good for work expenses (and their reimbursements) or spending from a sinking fund. It still moves your balances, so the forecast stays right. Tap one to count it again.</Info></span>
          {plan.excluded.map((c) => (
            <QuickAction key={c} action={includeCategory} fields={{ name: c }} variant="ghost" confirm={`Count ${c} as spending again?`}>
              {c} ×
            </QuickAction>
          ))}
        </div>
      )}

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
                          <Glyph name={c.category} size="xs" /> {c.category} {c.basis === "yours" ? <Badge>Yours</Badge> : c.basis === "pattern" ? <Badge tone="info">Predicted</Badge> : c.basis === "set-aside" ? <Badge tone="warn">Set aside</Badge> : <Badge>Usual</Badge>}
                          {c.planCents > 0 && <span className="ml-1 rounded-full bg-info/15 px-1.5 py-0.5 text-[10px] font-semibold text-info"><Glyph name="📅" size="xs" /> +<Money cents={c.planCents} whole /></span>}
                        </span>
                        <span className="shrink-0 text-sm tabular"><Money cents={c.spentCents} whole /> <span className="text-muted">/ <Money cents={c.budgetCents} whole /></span></span>
                      </span>
                      <PaceBar spent={c.spentCents} budget={c.budgetCents} progress={plan.progress} />
                      <span className="mt-0.5 flex justify-between text-[11px] text-muted">
                        <span>{status(c, plan.progress)}</span>
                        <span>{c.basis === "pattern" ? "expected" : c.basis === "set-aside" ? "per month" : "usual"} <Money cents={c.usualCents} whole /> ›</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </details>
        );
      })}


      {edit && (
        <Modal open onClose={() => setEdit(null)} icon={edit.category} title={edit.category} action={<CategoryEditButton name={edit.category} onChanged={() => setEdit(null)} />} subtitle={<><Money cents={edit.spentCents} whole /> spent this month</>}>
          <CategoryReport cat={edit.category} data={history} items={items[edit.category] ?? []}>
            <details className="group rounded-2xl border border-line">
              <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between px-3 text-sm font-semibold text-ink">
                <span>Budget <Money cents={edit.budgetCents} whole className="font-normal text-muted" /> · <Money cents={edit.spentCents} whole className="font-normal text-muted" /> spent</span>
                <span aria-hidden className="text-faint transition group-open:rotate-180">▾</span>
              </summary>
              <div className="border-t border-line p-3"><BudgetEditor key={edit.category} c={edit} history={history} demo={demo} onDone={() => setEdit(null)} /></div>
            </details>
          </CategoryReport>
        </Modal>
      )}
    </div>
  );
}


/**
 * The budget, editable right at the top: type it or drag the slider and the line on the chart moves
 * with it. The dotted line is your usual month. Blank = smart budget.
 */
function BudgetEditor({ c, history, demo, onDone }: { c: CategoryBudget; history: SpendingReport; demo: boolean; onDone: () => void }) {
  const [value, setValue] = useState(c.yours ? String(Math.round(c.budgetCents / 100)) : "");
  const typed = value.trim() === "" ? null : Math.max(0, Math.round(Number(value.replace(/[$,]/g, "")) * 100) || 0);
  const budget = typed ?? c.budgetCents;
  const all = history.slice(-6).map((m) => ({ month: m.month, label: m.label, current: m.current, cents: m.categories[c.category] ?? 0 }));
  // Start at the first month it showed up (keep at least three bars so it still reads as a chart).
  const first = all.findIndex((v) => v.cents > 0);
  const vals = first < 0 ? all : all.slice(Math.min(first, Math.max(0, all.length - 3)));
  const top = Math.max(1, c.usualCents, c.budgetCents, ...vals.map((v) => v.cents)) * 1.25;
  const sliderMax = Math.max(1000, Math.ceil(top / 500) * 500);
  return (
    <ActionForm demoPreview action={saveCategorySetting} onSuccess={onDone} className="grid gap-3" aria-label={`Budget for ${c.category}`}>
      <input type="hidden" name="name" value={c.category} />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <label className="flex flex-col gap-1 text-sm font-medium text-ink">
          Monthly budget
          <span className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">$</span>
            <input
              name="budget"
              inputMode="decimal"
              className="input w-36 pl-7 text-lg font-bold tabular"
              value={value}
              placeholder={String(Math.round(c.budgetCents / 100))}
              onChange={(e) => setValue(e.target.value)}
              aria-describedby="budget-hint"
            />
          </span>
        </label>
        <div className="text-right text-xs text-muted">
          <p>Usual month <Money cents={c.usualCents} whole className="font-semibold text-ink" /></p>
          <p>{typed == null ? "Smart budget (blank)" : "Your budget"}</p>
        </div>
      </div>
      <input
        type="range"
        min={0}
        max={sliderMax}
        step={sliderMax > 20_000 ? 1000 : 500}
        value={Math.min(budget, sliderMax)}
        onChange={(e) => setValue(String(Math.round(Number(e.target.value) / 100)))}
        className="w-full accent-[var(--color-brand)]"
        aria-label="Drag to set the budget"
      />
      <p id="budget-hint" className="-mt-1 flex flex-wrap gap-2 text-xs">
        <button type="button" className="text-brand underline" onClick={() => setValue(String(Math.round(c.usualCents / 100)))}>Use usual</button>
        <button type="button" className="text-brand underline" onClick={() => setValue("")}>Use smart</button>
      </p>


      <SelectField name="group" label="Group" defaultValue={c.group} options={[...GROUPS.map((g) => ({ value: g.id, label: `${g.label}: ${g.hint}` })), { value: "excluded", label: "Not counted: work, reimbursed, sinking fund" }]} />
      <Submit>Save</Submit>
      {demo && <p className="text-xs text-muted">Demo: saving is off.</p>}
    </ActionForm>
  );
}
