import { describe, expect, it } from "vitest";
import { demoSnapshot } from "../data/demo";
import type { Snapshot } from "../data/snapshot";
import { buildBudget, groupOf, spendingReport } from "./budget";

const today = "2026-11-25";
const demo = demoSnapshot(today, `${today}T15:00:00Z`);

describe("smart budget", () => {
  const b = buildBudget(demo, today, [{ title: "Birthday dinner", date: "2026-11-27", cents: 9_000 }]);

  it("starts from repeating income, takes savings and plans off the top", () => {
    expect(b.incomeSource).toBe("repeating");
    expect(b.incomeCents).toBe(Math.round((215_000 * 26) / 12));
    expect(b.savingsCents).toBe(80_000); // wedding transfers, twice a month
    expect(b.plansCents).toBe(9_000);
    expect(b.basis).toBe("usual");
    expect(b.groups.savings.spentCents).toBe(40_000); // the Nov 15 transfer; Nov 30 is still to come
    expect(b.monthsOfHistory).toBeGreaterThan(0);
  });

  it("keeps rent as a need at its usual amount", () => {
    const rent = b.categories.find((c) => c.category === "Housing")!;
    expect(rent.group).toBe("needs");
    expect(rent.budgetCents).toBe(165_000);
  });

  it("never budgets card payments or transfers as spending", () => {
    expect(b.categories.some((c) => c.category === "Card payment" || c.category === "Transfer")).toBe(false);
  });

  it("uses your own budget and group when you set them", () => {
    const mine: Snapshot = { ...demo, categorySettings: [{ name: "Dining", group: "needs", monthlyBudgetCents: 12_345 }] };
    const d = buildBudget(mine, today).categories.find((c) => c.category === "Dining")!;
    expect(d).toMatchObject({ group: "needs", budgetCents: 12_345, yours: true });
    expect(groupOf("Dining", mine)).toBe("needs");
  });

  it("trims wants, not needs, when the usual month doesn't fit", () => {
    const tight: Snapshot = { ...demo, rules: demo.rules.map((r) => (r.kind === "income" ? { ...r, amountCents: 120_000 } : r)) };
    const t = buildBudget(tight, today);
    const usualRent = t.categories.find((c) => c.category === "Housing")!;
    expect(usualRent.budgetCents).toBe(165_000);
    const wants = t.categories.filter((c) => c.group === "wants" && !c.yours);
    expect(wants.every((c) => c.budgetCents <= c.usualCents)).toBe(true);
    expect(t.notes.join(" ")).toMatch(/wants are trimmed|nothing left for wants/);
  });

  it("falls back to 50/30/20 with income but no history", () => {
    const fresh: Snapshot = { ...demo, transactions: [], rules: demo.rules.filter((r) => r.kind === "income") };
    const f = buildBudget(fresh, today);
    expect(f.basis).toBe("50-30-20");
    expect(f.groups.needs.budgetCents).toBe(Math.round((f.incomeCents * 0.5) / 500) * 500);
  });
});

describe("spending report", () => {
  it("has one row per month with groups adding up to categories", () => {
    const r = spendingReport(demo, today, 6);
    expect(r).toHaveLength(6);
    expect(r[5]!.current).toBe(true);
    for (const m of r) {
      const cats = Object.values(m.categories).reduce((a, b) => a + b, 0);
      expect(m.groups.needs + m.groups.wants + m.groups.savings).toBe(cats);
    }
  });
});

describe("category items", () => {
  it("add up to the report's monthly totals", async () => {
    const { categoryItems } = await import("./budget");
    const report = spendingReport(demo, today, 3);
    const items = categoryItems(demo, today, report[0]!.month);
    for (const m of report) {
      const end = m.month.slice(0, 7);
      for (const [cat, cents] of Object.entries(m.categories)) {
        const sum = (items[cat] ?? []).filter((i) => i.date.slice(0, 7) === end).reduce((t, i) => t + i.cents, 0);
        expect(sum, `${cat} ${end}`).toBe(cents);
      }
    }
  });
});

describe("usual month", () => {
  const base: Snapshot = { ...demoSnapshot(today, `${today}T15:00:00Z`) };
  const rent = (date: string, cents: number) => ({ id: `h${date}`, accountId: base.accounts[0]!.id, direction: "out" as const, amountCents: cents, description: "Northvale", date, status: "posted" as const, category: "Home rent", flexible: false });

  it("doesn't count months before the category first showed up as zeros", () => {
    const s = { ...base, rules: base.rules.filter((r) => r.category !== "Home rent"), transactions: [...base.transactions, rent("2026-10-02", 207_600)] };
    const c = buildBudget(s, today).categories.find((x) => x.category === "Home rent")!;
    expect(c.usualCents).toBe(207_600);
  });

  it("a repeating bill sets its category's month", () => {
    const rule = { id: "nv", name: "Northvale", kind: "bill" as const, amountCents: 204_300, accountId: base.accounts[0]!.id, category: "Home rent", schedule: { frequency: "monthly" as const, startDate: "2026-12-02", dayOfMonth: 2 } };
    const s = { ...base, rules: [...base.rules, rule], transactions: [...base.transactions, rent("2026-10-02", 199_000)] };
    const c = buildBudget(s, today).categories.find((x) => x.category === "Home rent")!;
    expect(c.usualCents).toBe(204_300);
  });
});
