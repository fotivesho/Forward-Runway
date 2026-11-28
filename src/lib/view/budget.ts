/**
 * Smart budgets and spending reports. Pure and deterministic.
 *
 * How a smart budget is built for this month:
 *  1. Income: your repeating income (or, without it, your average income over recent months).
 *  2. Savings: your repeating savings transfers and goal contributions come off the top.
 *  3. Calendar plans this month are set aside next, at their caps.
 *  4. Each category starts from what this month will likely cost: everyday categories from your
 *     patterns (daily rate, which weekdays and paydays fall in this month), big rare costs as a
 *     monthly set-aside, the rest from your usual month (average of the last full months).
 *     A plan with a category goes into that category's budget.
 *  5. If that doesn't fit, needs keep their usual amount and wants shrink to fit (rounded to $5).
 *  6. With no history at all, it falls back to 50 / 30 / 20 (needs / wants / savings) at group level.
 *  7. Any budget you set yourself wins over the suggestion.
 * Card payments and transfers between your own accounts are never spending.
 */
import { addDays, addMonths, daysInMonth, endOfMonth, parts, startOfMonth, type ISODate } from "../dates";
import type { Cents } from "../money";
import { ruleOccurrences, spendingByCategory } from "../engine";
import { isNotSpending, notSpendingTxn, isRefund } from "../categories";
import { toEngineInput, type CategoryGroup, type Snapshot } from "../data/snapshot";
import { monthlyEquivalent } from "./dashboard";
import { payPeriodBuckets } from "./spend";
import { predict, spendModel } from "./patterns";

export const GROUPS: Array<{ id: CategoryGroup; label: string; hint: string }> = [
  { id: "needs", label: "Needs", hint: "Rent, bills, groceries, getting around" },
  { id: "wants", label: "Wants", hint: "Eating out, shopping, fun" },
  { id: "savings", label: "Savings", hint: "Money set aside for later" },
];

const DEFAULT_GROUP: Record<string, CategoryGroup> = {
  Groceries: "needs", Housing: "needs", Utilities: "needs", Transport: "needs", Health: "needs", Insurance: "needs", Debt: "needs",
  Fees: "needs", Services: "needs", Home: "needs", Car: "needs",
  Savings: "savings",
};

export function groupOf(category: string, s: Pick<Snapshot, "categorySettings">): CategoryGroup {
  return s.categorySettings?.find((c) => c.name === category)?.group ?? DEFAULT_GROUP[category] ?? "wants";
}

const round5 = (c: Cents) => Math.round(c / 500) * 500;

/** Spending per category for each period [start, end] (end clamped to today). */
export function spendByBuckets(s: Snapshot, today: ISODate, buckets: Array<{ start: ISODate; end: ISODate }>): Array<{ start: ISODate; byCategory: Map<string, Cents> }> {
  const input = toEngineInput(s, today);
  const loanRules = s.rules.filter((r) => r.active !== false && r.kind === "loan_payment");
  const bankAccounts = new Set(s.accounts.filter((a) => a.balanceSource === "bank").map((a) => a.id));
  return buckets.map(({ start, end: bucketEnd }) => {
    const end = bucketEnd < today ? bucketEnd : today;
    const map = new Map<string, Cents>();
    if (start > today) return { start, byCategory: map };
    for (const t of spendingByCategory(input, start, bucketEnd)) if (!notSpendingTxn(t) && t.cents > 0) map.set(t.category, t.cents);
    // Loan payments are a need too (they aren't "spending" in the forecast's sense).
    for (const r of loanRules) {
      if (bankAccounts.has(r.accountId)) continue;
      const paid = ruleOccurrences(r, s.overrides, addDays(start, -7), addDays(bucketEnd, 7))
        .filter((o) => o.originalDate >= start && o.originalDate <= bucketEnd && o.date <= end)
        .reduce((t, o) => t + o.amountCents, 0);
      if (paid) map.set("Debt", (map.get("Debt") ?? 0) + paid);
    }
    return { start, byCategory: map };
  });
}

/** Spending per category for each calendar month. */
export function monthlyByCategory(s: Snapshot, today: ISODate, months: ISODate[]): Array<{ month: ISODate; byCategory: Map<string, Cents> }> {
  return spendByBuckets(s, today, months.map((m) => ({ start: m, end: endOfMonth(m) }))).map((b) => ({ month: b.start, byCategory: b.byCategory }));
}

export interface CategoryBudget {
  category: string;
  group: CategoryGroup;
  usualCents: Cents;
  budgetCents: Cents;
  /** You set this budget yourself. */
  yours: boolean;
  spentCents: Cents;
  /** Where the number comes from. */
  basis: "pattern" | "usual" | "set-aside" | "yours";
  /** Calendar plans this month in this category (inside budgetCents). */
  planCents: Cents;
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
  /** This month as organized life (bills, plans) and everyday life (predicted from your patterns). */
  life: { billsCents: Cents; plansCents: Cents; everydayCents: Cents; setAsideCents: Cents };
  /** Categories you've set as not counted. */
  excluded: string[];
}

export function buildBudget(s: Snapshot, today: ISODate, plans: Array<{ title: string; date: ISODate; cents: Cents; category?: string | null }> = []): BudgetPlan {
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
        .filter((t) => t.direction === "in" && t.status === "posted" && t.date >= pm && t.date <= endOfMonth(pm) && !notSpendingTxn(t))
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
  // Plans with a category live in that category; the rest are set aside as "plans".
  const planBy = new Map<string, Cents>();
  for (const p of monthPlans) if (p.category && !isNotSpending(p.category)) planBy.set(p.category, (planBy.get(p.category) ?? 0) + p.cents);
  const plansCents = monthPlans.filter((p) => !p.category || isNotSpending(p.category)).reduce((t, p) => t + p.cents, 0);

  // 4. Usual month per category: average over the last full months that had any spending.
  const history = monthlyByCategory(s, today, past).filter((h) => h.byCategory.size > 0);
  const [current] = monthlyByCategory(s, today, [month]);
  const usual = new Map<string, Cents>();
  // Averaged only over the months since the category first showed up: months before your
  // history (or before you started paying it here) aren't zeros, they're unknown.
  const oldestFirst = [...history].reverse();
  for (const c of new Set(history.flatMap((h) => [...h.byCategory.keys()]))) {
    const start = oldestFirst.findIndex((h) => (h.byCategory.get(c) ?? 0) > 0);
    const months = oldestFirst.slice(start);
    usual.set(c, Math.round(months.reduce((t, h) => t + (h.byCategory.get(c) ?? 0), 0) / months.length));
  }
  // Repeating bills are what's actually coming: they set the category's month.
  const ruleBy = new Map<string, Cents>();
  for (const r of s.rules) {
    if (r.active === false || !["bill", "subscription", "expense", "loan_payment"].includes(r.kind) || r.toAccountId) continue;
    const cat = r.kind === "loan_payment" ? "Debt" : (r.category ?? r.name);
    ruleBy.set(cat, (ruleBy.get(cat) ?? 0) + monthlyEquivalent(r));
  }
  for (const [c, v] of ruleBy) usual.set(c, Math.max(v, usual.get(c) ?? 0));

  // Everyday categories: what your patterns say this month costs. Rare big costs: a monthly set-aside.
  const model = spendModel(s, today);
  const basisOf = new Map<string, CategoryBudget["basis"]>();
  if (model) {
    const p = predict(model, month, endOfMonth(month));
    for (const c of p.byCategory) {
      usual.set(c.category, c.cents);
      basisOf.set(c.category, "pattern");
    }
    for (const l of model.lumpy) {
      usual.set(l.category, l.monthlyCents);
      basisOf.set(l.category, "set-aside");
    }
  }
  // A category your repeating bills cover isn't guessed from patterns.
  for (const [c, v] of ruleBy) {
    if (basisOf.get(c) && v >= (usual.get(c) ?? 0)) {
      usual.set(c, v);
      basisOf.delete(c);
    }
  }

  const names = new Set<string>([...usual.keys(), ...planBy.keys(), ...current!.byCategory.keys(), ...(s.categorySettings ?? []).filter((c) => c.monthlyBudgetCents != null || c.icon).map((c) => c.name)]);
  const cats: CategoryBudget[] = [...names]
    .filter((c) => !isNotSpending(c) && !(s.excludedCategories ?? []).includes(c))
    .map((c) => {
      const mine = s.categorySettings?.find((x) => x.name === c)?.monthlyBudgetCents ?? null;
      const u = usual.get(c) ?? 0;
      const planCents = planBy.get(c) ?? 0;
      return {
        category: c, group: groupOf(c, s), usualCents: u, budgetCents: mine ?? round5(u) + planCents, yours: mine != null, spentCents: current!.byCategory.get(c) ?? 0,
        basis: mine != null ? "yours" : (basisOf.get(c) ?? "usual"), planCents: mine != null ? 0 : planCents,
      };
    });

  const available = incomeCents - savingsCents - plansCents;
  let basis: BudgetPlan["basis"] = "usual";
  if (history.length === 0 && incomeCents > 0) {
    basis = "50-30-20";
    notes.push("No full month of history yet, so this starts from 50/30/20: half for needs, 30% for wants, 20% for savings.");
  } else if (history.length > 0) {
    // 5. Fit it: needs stay, wants shrink.
    const flexible = cats.filter((c) => !c.yours && c.group === "wants");
    // Plans inside a category don't shrink: they're already decided.
    const fixed = cats.reduce((t, c) => t + (flexible.includes(c) ? c.planCents : c.budgetCents), 0);
    const wantsTotal = flexible.reduce((t, c) => t + c.budgetCents - c.planCents, 0);
    if (incomeCents > 0 && fixed + wantsTotal > available && wantsTotal > 0) {
      const room = Math.max(0, available - fixed);
      const factor = room / wantsTotal;
      for (const c of flexible) c.budgetCents = round5((c.budgetCents - c.planCents) * factor) + c.planCents;
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

  const billKinds = new Set(["bill", "subscription", "expense", "loan_payment"]);
  const billCats = new Set(s.rules.filter((r) => r.active !== false && billKinds.has(r.kind) && !r.toAccountId).map((r) => (r.kind === "loan_payment" ? "Debt" : (r.category ?? r.name))));
  const life = { billsCents: 0, plansCents: plansCents, everydayCents: 0, setAsideCents: 0 };
  for (const c of cats) {
    life.plansCents += c.planCents;
    const rest = c.budgetCents - c.planCents;
    if (c.basis === "set-aside") life.setAsideCents += rest;
    else if (billCats.has(c.category)) life.billsCents += rest;
    else life.everydayCents += rest;
  }
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
    excluded: s.excludedCategories ?? [],
    basis,
    monthsOfHistory: history.length,
    notes,
    life,
  };
}

/**
 * Spending by group and category, oldest first: the last `count` months, or the last `count` pay
 * periods (payday to the day before the next). Starts at your first period with any spending.
 */
export function spendingReport(s: Snapshot, today: ISODate, count = 6, by: "month" | "period" = "month") {
  let buckets: Array<{ start: ISODate; end: ISODate; label: string; current: boolean }>;
  if (by === "period") {
    buckets = (payPeriodBuckets(s, today, count) ?? []).map((b) => ({ start: b.start, end: b.end, label: b.label, current: b.current }));
  } else {
    const month = startOfMonth(today);
    buckets = Array.from({ length: count }, (_, i) => addMonths(month, i - count + 1)).map((m) => ({
      start: m,
      end: endOfMonth(m),
      label: SHORT_MONTHS[parts(m).m - 1]!,
      current: m === month,
    }));
  }
  const rows = spendByBuckets(s, today, buckets).map((h, i) => ({
    month: h.start,
    end: buckets[i]!.end,
    label: buckets[i]!.label,
    current: buckets[i]!.current,
    categories: Object.fromEntries(h.byCategory) as Record<string, Cents>,
    groups: [...h.byCategory].reduce<Record<CategoryGroup, Cents>>(
      (g, [c, v]) => {
        g[groupOf(c, s)] += v;
        return g;
      },
      { needs: 0, wants: 0, savings: 0 },
    ),
  }));
  const first = rows.findIndex((r) => Object.keys(r.categories).length > 0);
  return first > 0 ? rows.slice(first) : rows;
}
const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
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
  /** The transaction behind it, to drill into that name's history. */
  txnId?: string;
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
    if (t.status !== "posted" || t.date < from || t.date > today || notSpendingTxn(t)) continue;
    const a = acct.get(t.accountId);
    if (!a || a.kind === "loan") continue;
    const cat = t.category?.trim() || "Uncategorized";
    if (t.direction === "out") add(cat, { date: t.date, label: t.description, cents: t.amountCents, account: a.name, repeating: false, pending: t.pending, txnId: t.id });
    else if (a.kind === "credit_card" || isRefund(t)) add(cat, { date: t.date, label: `${t.description} (refund)`, cents: -t.amountCents, account: a.name, repeating: false, txnId: t.id });
  }
  for (const r of s.rules) {
    if (r.active === false || (r.toAccountId && r.kind !== "loan_payment")) continue;
    if (!["bill", "subscription", "expense", "loan_payment"].includes(r.kind)) continue;
    const a = acct.get(r.accountId);
    if (!a || a.balanceSource === "bank") continue;
    const cat = r.kind === "loan_payment" ? "Debt" : (r.category ?? r.name);
    for (const o of ruleOccurrences(r, s.overrides, addDays(from, -7), addDays(today, 7))) {
      if (o.originalDate < from || o.date > today) continue;
      // Listed under the month it's for (the scheduled date), matching the budget and reports.
      add(cat, { date: o.originalDate, label: o.date !== o.originalDate ? `${r.name} (paid ${o.date.slice(5).replace('-', '/')})` : r.name, cents: o.amountCents, account: a.name, repeating: true });
    }
  }
  for (const list of Object.values(out)) list.sort((x, y) => (x.date < y.date ? 1 : x.date > y.date ? -1 : 0));
  return out;
}
