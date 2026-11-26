/**
 * Smart budgets and spending reports. Pure and deterministic.
 *
 * How a smart budget is built for this month:
 *  1. Income: your repeating income (or, without it, your average income over recent months).
 *  2. Savings: your repeating savings transfers and goal contributions come off the top.
 *  3. Calendar plans this month are set aside next, at their caps.
 *  4. Each category starts from your usual month (average of the last full months with spending).
 *  5. If that doesn't fit, needs keep their usual amount and wants shrink to fit (rounded to $5).
 *  6. With no history at all, it falls back to 50 / 30 / 20 (needs / wants / savings) at group level.
 *  7. Any budget you set yourself wins over the suggestion.
 * Card payments and transfers between your own accounts are never spending.
 */
import { addMonths, daysInMonth, endOfMonth, parts, startOfMonth, type ISODate } from "../dates";
import type { Cents } from "../money";
import { ruleOccurrences, spendingByCategory } from "../engine";
import { isNotSpending } from "../categories";
import { toEngineInput, type CategoryGroup, type Snapshot } from "../data/snapshot";
import { monthlyEquivalent } from "./dashboard";

export const GROUPS: Array<{ id: CategoryGroup; label: string; hint: string }> = [
  { id: "needs", label: "Needs", hint: "Rent, bills, groceries, getting around" },
  { id: "wants", label: "Wants", hint: "Eating out, shopping, fun" },
  { id: "savings", label: "Savings", hint: "Money set aside for later" },
];

const DEFAULT_GROUP: Record<string, CategoryGroup> = {
  Groceries: "needs", Housing: "needs", Utilities: "needs", Transport: "needs", Health: "needs", Insurance: "needs", Debt: "needs",
  Fees: "needs", Services: "needs", Home: "needs",
  Savings: "savings",
};

export function groupOf(category: string, s: Pick<Snapshot, "categorySettings">): CategoryGroup {
  return s.categorySettings?.find((c) => c.name === category)?.group ?? DEFAULT_GROUP[category] ?? "wants";
}

const round5 = (c: Cents) => Math.round(c / 500) * 500;

/** Spending per category for each calendar month in [from, to] (to clamped to today). */
export function monthlyByCategory(s: Snapshot, today: ISODate, months: ISODate[]): Array<{ month: ISODate; byCategory: Map<string, Cents> }> {
  const input = toEngineInput(s, today);
  const loanRules = s.rules.filter((r) => r.active !== false && r.kind === "loan_payment");
  const bankAccounts = new Set(s.accounts.filter((a) => a.balanceSource === "bank").map((a) => a.id));
  return months.map((m) => {
    const end = endOfMonth(m) < today ? endOfMonth(m) : today;
    const map = new Map<string, Cents>();
    if (m > today) return { month: m, byCategory: map };
    for (const t of spendingByCategory(input, m, end)) if (!isNotSpending(t.category) && t.cents > 0) map.set(t.category, t.cents);
    // Loan payments are a need too (they aren't "spending" in the forecast's sense).
    for (const r of loanRules) {
      if (bankAccounts.has(r.accountId)) continue;
      const paid = ruleOccurrences(r, s.overrides, m, end).reduce((t, o) => t + o.amountCents, 0);
      if (paid) map.set("Debt", (map.get("Debt") ?? 0) + paid);
    }
    return { month: m, byCategory: map };
  });
}

export interface CategoryBudget {
  category: string;
  group: CategoryGroup;
  usualCents: Cents;
  budgetCents: Cents;
  /** You set this budget yourself. */
  yours: boolean;
  spentCents: Cents;
}

export interface BudgetPlan {
  month: ISODate;
  /** How far through the month today is, 0–1 (for pace). */
  progress: number;
  incomeCents: Cents;
  incomeSource: "repeating" | "history" | "none";
  savingsCents: Cents;
  plansCents: Cents;
  plans: Array<{ title: string; date: ISODate; cents: Cents }>;
  categories: CategoryBudget[];
  groups: Record<CategoryGroup, { budgetCents: Cents; spentCents: Cents }>;
  /** Income left after savings, plans and every category budget (negative = over). */
  unassignedCents: Cents;
  basis: "usual" | "50-30-20";
  /** Full months of history the usual amounts are based on. */
  monthsOfHistory: number;
  notes: string[];
}

export function buildBudget(s: Snapshot, today: ISODate, plans: Array<{ title: string; date: ISODate; cents: Cents }> = []): BudgetPlan {
  const month = startOfMonth(today);
  const { y, m, d } = parts(today);
  const progress = d / daysInMonth(y, m);
  const notes: string[] = [];

  // 1. Income.
  const incomeRules = s.rules.filter((r) => r.active !== false && r.kind === "income");
  let incomeCents = incomeRules.reduce((t, r) => t + monthlyEquivalent(r), 0);
  let incomeSource: BudgetPlan["incomeSource"] = incomeCents > 0 ? "repeating" : "none";
  const past = [1, 2, 3].map((k) => addMonths(month, -k));
  if (!incomeCents) {
    const sums = past.map((pm) =>
      s.transactions
        .filter((t) => t.direction === "in" && t.status === "posted" && t.date >= pm && t.date <= endOfMonth(pm) && !isNotSpending(t.category))
        .reduce((a, t) => a + t.amountCents, 0),
    );
    const withIncome = sums.filter((x) => x > 0);
    if (withIncome.length) {
      incomeCents = Math.round(withIncome.reduce((a, b) => a + b, 0) / withIncome.length);
      incomeSource = "history";
      notes.push("Income is your average over recent months. Add your paycheck as repeating for an exact number.");
    }
  }

  // 2. Savings off the top.
  let savingsCents = s.rules.filter((r) => r.active !== false && r.kind === "savings_transfer").reduce((t, r) => t + monthlyEquivalent(r), 0);
  if (!savingsCents) savingsCents = s.goals.reduce((t, g) => t + (g.monthlyContributionCents ?? 0), 0);

  // 3. Calendar plans this month.
  const monthPlans = plans.filter((p) => p.date >= month && p.date <= endOfMonth(month) && p.cents > 0);
  const plansCents = monthPlans.reduce((t, p) => t + p.cents, 0);

  // 4. Usual month per category: average over the last full months that had any spending.
  const history = monthlyByCategory(s, today, past).filter((h) => h.byCategory.size > 0);
  const [current] = monthlyByCategory(s, today, [month]);
  const usual = new Map<string, Cents>();
  for (const h of history) for (const [c, v] of h.byCategory) usual.set(c, (usual.get(c) ?? 0) + v);
  for (const [c, v] of usual) usual.set(c, Math.round(v / history.length));
  // Repeating bills set up but not yet paid in history still count.
  for (const r of s.rules) {
    if (r.active === false || !["bill", "subscription", "expense", "loan_payment"].includes(r.kind) || r.toAccountId) continue;
    const cat = r.kind === "loan_payment" ? "Debt" : (r.category ?? r.name);
    if (!usual.has(cat)) usual.set(cat, monthlyEquivalent(r));
  }

  const names = new Set<string>([...usual.keys(), ...current!.byCategory.keys(), ...(s.categorySettings ?? []).filter((c) => c.monthlyBudgetCents != null).map((c) => c.name)]);
  const cats: CategoryBudget[] = [...names]
    .filter((c) => !isNotSpending(c))
    .map((c) => {
      const mine = s.categorySettings?.find((x) => x.name === c)?.monthlyBudgetCents ?? null;
      const u = usual.get(c) ?? 0;
      return { category: c, group: groupOf(c, s), usualCents: u, budgetCents: mine ?? round5(u), yours: mine != null, spentCents: current!.byCategory.get(c) ?? 0 };
    });

  const available = incomeCents - savingsCents - plansCents;
  let basis: BudgetPlan["basis"] = "usual";
  if (history.length === 0 && incomeCents > 0) {
    basis = "50-30-20";
    notes.push("No full month of history yet, so this starts from 50/30/20: half for needs, 30% for wants, 20% for savings.");
  } else if (history.length > 0) {
    // 5. Fit it: needs stay, wants shrink.
    const fixed = cats.filter((c) => c.yours || c.group !== "wants").reduce((t, c) => t + c.budgetCents, 0);
    const flexible = cats.filter((c) => !c.yours && c.group === "wants");
    const wantsTotal = flexible.reduce((t, c) => t + c.budgetCents, 0);
    if (incomeCents > 0 && fixed + wantsTotal > available && wantsTotal > 0) {
      const room = Math.max(0, available - fixed);
      const factor = room / wantsTotal;
      for (const c of flexible) c.budgetCents = round5(c.budgetCents * factor);
      notes.push(
        room > 0
          ? `Your usual month is more than your income allows after savings and plans, so wants are trimmed to ${Math.round(factor * 100)}% of usual. Needs keep their usual amount.`
          : "After needs, savings and plans there's nothing left for wants this month. Consider saving a little less or pushing a plan.",
      );
    }
  }

  const groups: BudgetPlan["groups"] = { needs: { budgetCents: 0, spentCents: 0 }, wants: { budgetCents: 0, spentCents: 0 }, savings: { budgetCents: 0, spentCents: 0 } };
  for (const c of cats) {
    groups[c.group].budgetCents += c.budgetCents;
    groups[c.group].spentCents += c.spentCents;
  }
  if (basis === "50-30-20") {
    groups.needs.budgetCents = Math.max(groups.needs.budgetCents, round5(incomeCents * 0.5));
    groups.wants.budgetCents = Math.max(0, round5(incomeCents * 0.3) - plansCents);
  }
  groups.savings.budgetCents += savingsCents;
  // Saved so far this month: savings transfers that have happened.
  for (const r of s.rules) {
    if (r.active === false || r.kind !== "savings_transfer") continue;
    groups.savings.spentCents += ruleOccurrences(r, s.overrides, month, today).reduce((t, o) => t + o.amountCents, 0);
  }
  groups.wants.budgetCents += plansCents;

  const assigned = groups.needs.budgetCents + groups.wants.budgetCents + groups.savings.budgetCents;
  return {
    month,
    progress,
    incomeCents,
    incomeSource,
    savingsCents,
    plansCents,
    plans: monthPlans,
    categories: cats.sort((a, b) => b.budgetCents - a.budgetCents || b.spentCents - a.spentCents),
    groups,
    unassignedCents: incomeCents - assigned,
    basis,
    monthsOfHistory: history.length,
    notes,
  };
}

/** Spending by group and category for the last `count` months (oldest first), for reports. */
export function spendingReport(s: Snapshot, today: ISODate, count = 6) {
  const month = startOfMonth(today);
  const months = Array.from({ length: count }, (_, i) => addMonths(month, i - count + 1));
  return monthlyByCategory(s, today, months).map((h) => ({
    month: h.month,
    current: h.month === month,
    categories: Object.fromEntries(h.byCategory),
    groups: [...h.byCategory].reduce<Record<CategoryGroup, Cents>>(
      (g, [c, v]) => {
        g[groupOf(c, s)] += v;
        return g;
      },
      { needs: 0, wants: 0, savings: 0 },
    ),
  }));
}
export type SpendingReport = ReturnType<typeof spendingReport>;

export interface CategoryItem {
  date: ISODate;
  label: string;
  /** Positive = spent; negative = a refund. */
  cents: Cents;
  account: string;
  /** From a repeating bill rather than a logged transaction. */
  repeating: boolean;
  pending?: boolean;
}

/**
 * Everything counted in each category, newest first, from `from` to today: the same items the
 * budget and reports add up (logged spending, card refunds, and repeating bills on accounts no bank updates).
 */
export function categoryItems(s: Snapshot, today: ISODate, from: ISODate): Record<string, CategoryItem[]> {
  const out: Record<string, CategoryItem[]> = {};
  const add = (c: string, it: CategoryItem) => (out[c] ??= []).push(it);
  const acct = new Map(s.accounts.map((a) => [a.id, a]));
  for (const t of s.transactions) {
    if (t.status !== "posted" || t.date < from || t.date > today || isNotSpending(t.category)) continue;
    const a = acct.get(t.accountId);
    if (!a || a.kind === "loan") continue;
    const cat = t.category?.trim() || "Uncategorized";
    if (t.direction === "out") add(cat, { date: t.date, label: t.description, cents: t.amountCents, account: a.name, repeating: false, pending: t.pending });
    else if (a.kind === "credit_card") add(cat, { date: t.date, label: `${t.description} (refund)`, cents: -t.amountCents, account: a.name, repeating: false });
  }
  for (const r of s.rules) {
    if (r.active === false || (r.toAccountId && r.kind !== "loan_payment")) continue;
    if (!["bill", "subscription", "expense", "loan_payment"].includes(r.kind)) continue;
    const a = acct.get(r.accountId);
    if (!a || a.balanceSource === "bank") continue;
    const cat = r.kind === "loan_payment" ? "Debt" : (r.category ?? r.name);
    for (const o of ruleOccurrences(r, s.overrides, from, today)) add(cat, { date: o.date, label: r.name, cents: o.amountCents, account: a.name, repeating: true });
  }
  for (const list of Object.values(out)) list.sort((x, y) => (x.date < y.date ? 1 : x.date > y.date ? -1 : 0));
  return out;
}
