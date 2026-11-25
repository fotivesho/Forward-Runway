import { describe, expect, it } from "vitest";
import { computeAllowance, planDailySpending, type PlannedEvent } from "../advisor";
import { buildForecast } from "../forecast";
import { planPurchase } from "../purchase";
import { compareScenario } from "../scenario";
import { extraPaymentEffect, payoff } from "../debt";
import { spendingByCategory, spendingBaseline } from "../spending";
import { card, checking, input, payday, rule, savings, settings } from "./fixtures";

const base = () =>
  input({
    accounts: [checking(100_000), card(0), savings("sav", 300_000), savings("wed", 500_000)],
    rules: [
      payday(200_000, "2026-01-09"),
      rule({ id: "rent", amountCents: 150_000, schedule: { frequency: "monthly", startDate: "2026-01-10" } }),
    ],
    goals: [{ id: "g", name: "Wedding", kind: "wedding", accountId: "wed", targetCents: 2_000_000, protected: true }],
    settings: { ...settings, cashFloorCents: 20_000 },
  });

describe("computeAllowance", () => {
  it("never allows spending that would push any future day below the floor", () => {
    const i = base();
    const f = buildForecast(i, 90);
    const a = computeAllowance(f);
    expect(a.status).not.toBe("shortfall");
    // Spend every period's full rate every day, then check every day stays >= floor.
    let spent = 0;
    for (const d of f.days) {
      const p = a.periods.find((x) => d.date >= x.start && d.date <= x.end)!;
      spent += p.dailyRateCents;
      expect(d.closingCents - spent).toBeGreaterThanOrEqual(i.settings.cashFloorCents);
    }
  });

  it("splits into pay periods at each payday", () => {
    const a = computeAllowance(buildForecast(base(), 30));
    expect(a.periods[0]).toMatchObject({ start: "2026-01-01", end: "2026-01-08" });
    expect(a.periods[1]!.start).toBe("2026-01-09");
  });

  it("reports a shortfall instead of an allowance when bills exceed cash", () => {
    const i = base();
    i.rules.push(rule({ id: "big", amountCents: 500_000, schedule: { frequency: "once", startDate: "2026-01-05" } }));
    const a = computeAllowance(buildForecast(i, 30));
    expect(a.status).toBe("shortfall");
    expect(a.current.dailyRateCents).toBe(0);
    expect(a.shortfallDate).toBe("2026-01-05");
    expect(a.shortfallCents).toBe(20_000 - (100_000 - 500_000));
  });
});

describe("planDailySpending", () => {
  const ev = (p: Partial<PlannedEvent> & Pick<PlannedEvent, "id" | "date" | "estimateCents">): PlannedEvent => ({
    title: p.id,
    estimateConfirmed: false,
    ...p,
  });

  it("daily caps add up to the pool, and events get reserved", () => {
    const i = base();
    const f = buildForecast(i, 90);
    const plan = planDailySpending(i, f, [ev({ id: "dinner", date: "2026-01-03", estimateCents: 3_000 })], { calendarIncomplete: false });
    const total = plan.days.reduce((s, d) => s + d.capCents, 0);
    expect(total).toBe(plan.poolCents);
    const advice = plan.advice.find((a) => a.eventId === "dinner")!;
    expect(advice.recommendation).toBe("proceed");
    expect(plan.days.find((d) => d.date === "2026-01-03")!.eventCents).toBe(advice.capCents);
  });

  it("holds back a buffer when calendars are incomplete", () => {
    const i = base();
    const f = buildForecast(i, 90);
    const full = planDailySpending(i, f, [], { calendarIncomplete: false });
    const partial = planDailySpending(i, f, [], { calendarIncomplete: true });
    expect(partial.bufferCents).toBeGreaterThan(0);
    expect(partial.poolCents).toBe(full.poolCents - partial.bufferCents);
  });

  it("recommends cheaper, postpone or skip when an event doesn't fit", () => {
    const i = base();
    const f = buildForecast(i, 90);
    const plan = planDailySpending(
      i,
      f,
      [
        ev({ id: "trip", date: "2026-01-04", estimateCents: 5_000_000 }),
        ev({ id: "show", date: "2026-01-05", estimateCents: 9_999_999 }),
      ],
      { calendarIncomplete: false },
    );
    const recs = Object.fromEntries(plan.advice.map((a) => [a.eventId, a.recommendation]));
    expect(["postpone", "skip"]).toContain(recs.trip);
    expect(recs.show).toBe("skip");
    expect(plan.advice.every((a) => a.recommendation === "proceed" || a.capCents <= a.estimateCents)).toBe(true);
  });

  it("honors the user's own decisions and caps", () => {
    const i = base();
    const f = buildForecast(i, 90);
    const plan = planDailySpending(
      i,
      f,
      [ev({ id: "bday", date: "2026-01-02", estimateCents: 8_000, userCapCents: 5_000, decision: "cheaper" })],
      { calendarIncomplete: false },
    );
    expect(plan.advice[0]).toMatchObject({ recommendation: "cheaper", capCents: 5_000, userDecided: true });
  });

  it("ignores duplicates and asks for missing estimates", () => {
    const i = base();
    const f = buildForecast(i, 90);
    const plan = planDailySpending(
      i,
      f,
      [
        ev({ id: "a", date: "2026-01-03", estimateCents: 3_000 }),
        ev({ id: "b", date: "2026-01-03", estimateCents: 3_000, duplicateOf: "a" }),
        ev({ id: "c", date: "2026-01-04", estimateCents: 0, needsEstimate: true }),
      ],
      { calendarIncomplete: false },
    );
    expect(plan.advice.map((a) => a.eventId).sort()).toEqual(["a", "c"]);
    expect(plan.advice.find((a) => a.eventId === "c")!.reason).toMatch(/estimate/);
  });

  it("recalculates when spending is logged (no double subtraction)", () => {
    const i = base();
    const before = planDailySpending(i, buildForecast(i, 90), [], { calendarIncomplete: false });
    const logged = {
      ...i,
      transactions: [
        { id: "t", date: "2026-01-01", amountCents: 2_000, direction: "out" as const, accountId: "chk", description: "Lunch", status: "posted" as const, flexible: true },
      ],
    };
    const after = planDailySpending(logged, buildForecast(logged, 90), [], { calendarIncomplete: false });
    expect(after.todayCap.spentCents).toBe(2_000);
    // The pool shrinks by at most what was spent.
    expect(before.poolCents - after.poolCents).toBeLessThanOrEqual(2_000);
    expect(after.poolCents).toBeLessThan(before.poolCents);
  });

  it("explains card, debt and savings effects", () => {
    const i = base();
    i.accounts.push({ id: "loan", name: "Car loan", kind: "loan", balanceCents: 1_000_000, balanceAsOf: "2026-01-01", balanceSource: "manual", balanceUpdatedAt: null, isSpendable: false, aprBps: 690 });
    i.goals[0]!.monthlyContributionCents = 60_000;
    const f = buildForecast(i, 90);
    const plan = planDailySpending(i, f, [ev({ id: "x", date: "2026-01-03", estimateCents: 10_000, paymentAccountId: "visa" })], {
      calendarIncomplete: false,
    });
    const text = plan.advice[0]!.impacts.join(" ");
    expect(text).toMatch(/Visa/);
    expect(text).toMatch(/Car loan/);
    expect(text).toMatch(/Wedding/);
  });
});

describe("planPurchase (savings ammo)", () => {
  it("fits from cash flow when there's room", () => {
    const p = planPurchase(base(), { label: "Shoes", amountCents: 5_000, date: "2026-01-12" });
    expect(p.verdict).toBe("fits");
    expect(p.sources.every((s) => s.useCents === 0)).toBe(true);
  });

  it("draws from unprotected savings before protected, with a rebuild plan", () => {
    const p = planPurchase(base(), { label: "Laptop", amountCents: 200_000, date: "2026-01-05" });
    expect(p.verdict).toBe("fits_with_savings");
    const used = p.sources.filter((s) => s.useCents > 0);
    expect(used.map((s) => s.accountId)).toEqual(["sav"]);
    expect(used[0]!.useCents).toBe(p.shortfallCents);
    expect(p.transferDate).toBe("2026-01-05");
    expect(p.rebuild.map((r) => r.months)).toEqual([3, 6, 12]);
    expect(p.rebuild[0]!.monthlyCents * 3).toBeGreaterThanOrEqual(p.shortfallCents);
  });

  it("does not touch the wedding fund unless allowed", () => {
    const p = planPurchase(base(), { label: "Car repair", amountCents: 600_000, date: "2026-01-05" });
    expect(p.sources.find((s) => s.accountId === "wed")!.useCents).toBe(0);
    expect(p.verdict).toBe("not_covered");
    const allowed = planPurchase(base(), { label: "Car repair", amountCents: 600_000, date: "2026-01-05", allowProtected: true });
    expect(allowed.verdict).toBe("needs_protected_savings");
    expect(allowed.sources.find((s) => s.accountId === "wed")!.useCents).toBeGreaterThan(0);
  });

  it("a purchase on a card is paid at the statement due date", () => {
    const p = planPurchase(base(), { label: "Couch", amountCents: 50_000, date: "2026-01-05", paymentAccountId: "visa" });
    expect(p.cardNote).toMatch(/Feb 15/);
  });
});

describe("scenarios", () => {
  it("compares a what-if against the base forecast without mutating input", () => {
    const i = base();
    const snapshot = JSON.stringify(i);
    const c = compareScenario(i, [{ type: "change_rule_amount", ruleId: "rent", amountCents: 100_000 }], 30);
    expect(c.endingDeltaCents).toBe(50_000);
    expect(JSON.stringify(i)).toBe(snapshot);
    const skip = compareScenario(i, [{ type: "skip_occurrence", ruleId: "rent", date: "2026-01-10" }], 30);
    expect(skip.endingDeltaCents).toBe(150_000);
  });
});

describe("spending", () => {
  it("counts card purchases once and excludes card payments and transfers", () => {
    const i = input({
      today: "2026-01-31",
      accounts: [checking(100_000), card(5_000)],
      transactions: [
        { id: "a", date: "2026-01-05", amountCents: 5_000, direction: "out", accountId: "visa", description: "Groceries", category: "Groceries", status: "posted" },
        { id: "b", date: "2026-01-06", amountCents: 2_000, direction: "out", accountId: "chk", description: "Lunch", category: "Dining", status: "posted" },
      ],
      transfers: [{ id: "p", date: "2026-01-25", fromAccountId: "chk", toAccountId: "visa", amountCents: 5_000 }],
    });
    const totals = spendingByCategory(i, "2026-01-01", "2026-01-31");
    expect(totals.reduce((s, t) => s + t.cents, 0)).toBe(7_000);
    expect(totals.find((t) => t.category === "Groceries")!.onCardCents).toBe(5_000);
  });

  it("learns a weekday baseline", () => {
    const txns = Array.from({ length: 28 }, (_, k) => ({
      id: `t${k}`,
      date: `2026-01-${String(k + 1).padStart(2, "0")}`,
      amountCents: k % 7 === 1 ? 7_000 : 1_000, // Fridays (Jan 2 is Fri) cost more
      direction: "out" as const,
      accountId: "chk",
      description: "spend",
      status: "posted" as const,
    }));
    const b = spendingBaseline(input({ today: "2026-01-29", accounts: [checking(0)], transactions: txns }));
    expect(b.reliable).toBe(true);
    expect(b.byWeekday[5]).toBe(7_000);
    expect(b.byWeekday[1]).toBe(1_000);
  });
});

describe("debt", () => {
  it("amortizes and measures extra payments", () => {
    const p = payoff(1_000_000, 600, 20_000);
    expect(p.months).toBeGreaterThan(50);
    expect(p.months).toBeLessThan(60);
    const e = extraPaymentEffect(1_000_000, 600, 20_000, 10_000);
    expect(e.monthsSaved).toBeGreaterThan(10);
    expect(e.interestSavedCents).toBeGreaterThan(0);
    expect(payoff(1_000_000, 2400, 1_000).months).toBeNull();
  });
});
