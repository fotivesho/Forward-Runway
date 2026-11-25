import { describe, expect, it } from "vitest";
import { buildForecast, topQuestion } from "../forecast";
import { card, checking, input, payday, rule, savings } from "./fixtures";

describe("buildForecast: basics", () => {
  it("computes opening, inflows, outflows and closing for every day", () => {
    const f = buildForecast(
      input({
        accounts: [checking(100_000)],
        rules: [
          payday(),
          rule({ id: "rent", amountCents: 150_000, schedule: { frequency: "monthly", startDate: "2026-01-05" } }),
        ],
      }),
      30,
    );
    expect(f.days).toHaveLength(30);
    expect(f.startDate).toBe("2026-01-01");
    expect(f.endDate).toBe("2026-01-30");
    expect(f.days[0]).toMatchObject({ openingCents: 100_000, closingCents: 100_000 });
    expect(f.days[1]).toMatchObject({ inflowsCents: 200_000, closingCents: 300_000 });
    expect(f.days[4]).toMatchObject({ outflowsCents: 150_000, closingCents: 150_000 });
    // Each day's opening is the previous day's closing.
    for (let i = 1; i < f.days.length; i++) expect(f.days[i]!.openingCents).toBe(f.days[i - 1]!.closingCents);
    for (const d of f.days) expect(d.closingCents).toBe(d.openingCents + d.inflowsCents - d.outflowsCents);
    expect(f.endingCashCents).toBe(100_000 + 3 * 200_000 - 150_000);
    expect(f.totalInflowsCents - f.totalOutflowsCents).toBe(f.endingCashCents - f.startingCashCents);
  });

  it("supports 30/60/90 day horizons", () => {
    const i = input({ accounts: [checking(0)], rules: [payday()] });
    expect(buildForecast(i, 30).days).toHaveLength(30);
    expect(buildForecast(i, 60).days).toHaveLength(60);
    expect(buildForecast(i, 90).days).toHaveLength(90);
  });

  it("is deterministic", () => {
    const i = input({ accounts: [checking(50_000), card(30_000)], rules: [payday()] });
    expect(JSON.stringify(buildForecast(i, 90))).toBe(JSON.stringify(buildForecast(i, 90)));
  });

  it("finds the lowest balance and first floor breach", () => {
    const f = buildForecast(
      input({
        accounts: [checking(50_000)],
        settings: { ...input({}).settings, cashFloorCents: 20_000 },
        rules: [
          rule({ id: "car", amountCents: 40_000, schedule: { frequency: "once", startDate: "2026-01-03" } }),
          payday(100_000, "2026-01-09"),
        ],
      }),
      30,
    );
    expect(f.lowest).toEqual({ date: "2026-01-03", cents: 10_000 });
    expect(f.firstBelowFloor).toBe("2026-01-03");
    expect(f.firstNegative).toBeNull();
  });

  it("only counts spendable accounts as cash; savings transfers reduce cash", () => {
    const f = buildForecast(
      input({
        accounts: [checking(100_000), savings("sav", 500_000)],
        rules: [
          payday(),
          rule({
            id: "save",
            kind: "savings_transfer",
            amountCents: 25_000,
            toAccountId: "sav",
            schedule: { frequency: "once", startDate: "2026-01-03" },
          }),
        ],
      }),
      10,
    );
    expect(f.startingCashCents).toBe(100_000);
    expect(f.days[2]!.outflowsCents).toBe(25_000);
    expect(f.closingByAccount["sav"]).toBe(525_000);
  });

  it("transfers between two cash accounts don't change total cash", () => {
    const f = buildForecast(
      input({
        accounts: [checking(100_000), { ...savings("wallet", 5_000), kind: "cash", isSpendable: true }],
        transfers: [{ id: "t", date: "2026-01-02", fromAccountId: "chk", toAccountId: "wallet", amountCents: 2_000 }],
      }),
      5,
    );
    expect(f.days[1]!.closingCents).toBe(105_000);
    expect(f.days[1]!.nonCashItems).toHaveLength(1);
  });

  it("rolls items between the balance date and today into the opening balance", () => {
    const f = buildForecast(
      input({
        today: "2026-01-10",
        accounts: [checking(100_000, "2026-01-05")],
        rules: [rule({ id: "gym", amountCents: 5_000, schedule: { frequency: "once", startDate: "2026-01-07" } })],
      }),
      5,
    );
    expect(f.startingCashCents).toBe(95_000);
    expect(f.assumptions.join(" ")).toMatch(/assumed to have happened/);
  });

  it("ignores items marked as already posted or cleared", () => {
    const f = buildForecast(
      input({
        accounts: [checking(100_000)],
        rules: [payday(200_000, "2026-01-01")],
        overrides: [{ id: "o", ruleId: "pay", originalDate: "2026-01-01", action: "posted" }],
        transactions: [
          { id: "t", date: "2026-01-01", amountCents: 3_000, direction: "out", accountId: "chk", description: "x", status: "posted", cleared: true },
        ],
      }),
      5,
    );
    expect(f.days[0]!.closingCents).toBe(100_000);
  });

  it("logged spending after the balance date reduces cash", () => {
    const f = buildForecast(
      input({
        accounts: [checking(100_000)],
        transactions: [
          { id: "t", date: "2026-01-01", amountCents: 4_200, direction: "out", accountId: "chk", description: "Dinner", status: "posted", flexible: true },
        ],
      }),
      3,
    );
    expect(f.days[0]!.closingCents).toBe(95_800);
  });
});

describe("credit cards: never double-count", () => {
  it("card purchases do not touch checking until the statement is paid", () => {
    const f = buildForecast(
      input({
        accounts: [checking(500_000), card(0)],
        transactions: [
          { id: "tv", date: "2026-01-05", amountCents: 80_000, direction: "out", accountId: "visa", description: "TV", status: "planned" },
        ],
      }),
      60,
    );
    // Purchase on Jan 5: zero cash effect that day.
    const jan5 = f.days.find((d) => d.date === "2026-01-05")!;
    expect(jan5.outflowsCents).toBe(0);
    expect(jan5.nonCashItems.map((i) => i.label)).toContain("TV");
    // Closes Jan 20, due Feb 15: paid exactly once, in full.
    const payments = f.days.flatMap((d) => d.items).filter((i) => i.kind === "card_payment");
    expect(payments).toHaveLength(1);
    expect(payments[0]).toMatchObject({ date: "2026-02-15", cashEffectCents: -80_000 });
    expect(f.endingCashCents).toBe(500_000 - 80_000);
    // Total cash out equals the purchase exactly once.
    expect(f.totalOutflowsCents).toBe(80_000);
  });

  it("pays a known unpaid statement in full on its due date and projects the rest", () => {
    const f = buildForecast(
      input({
        today: "2026-01-25",
        accounts: [checking(500_000, "2026-01-25"), card(70_000, "2026-01-25")],
        statements: [
          { id: "s1", accountId: "visa", closingDate: "2026-01-20", statementBalanceCents: 50_000, dueDate: "2026-02-15", paidCents: 0, status: "unpaid" },
        ],
      }),
      60,
    );
    const payments = f.days.flatMap((d) => d.items).filter((i) => i.kind === "card_payment");
    // Feb 15: the 500 statement. Mar 15: the 200 of purchases since Jan 20 that close Feb 20.
    expect(payments.map((p) => [p.date, -p.cashEffectCents])).toEqual([
      ["2026-02-15", 50_000],
      ["2026-03-15", 20_000],
    ]);
    // Never more than what's owed.
    expect(payments.reduce((s, p) => s - p.cashEffectCents, 0)).toBe(70_000);
  });

  it("an explicitly scheduled card payment replaces the automatic one (no double payment)", () => {
    const f = buildForecast(
      input({
        today: "2026-01-25",
        accounts: [checking(500_000, "2026-01-25"), card(50_000, "2026-01-25")],
        statements: [
          { id: "s1", accountId: "visa", closingDate: "2026-01-20", statementBalanceCents: 50_000, dueDate: "2026-02-15", paidCents: 0, status: "unpaid" },
        ],
        transfers: [{ id: "p", date: "2026-02-10", fromAccountId: "chk", toAccountId: "visa", amountCents: 50_000 }],
      }),
      60,
    );
    const outflows = f.days.flatMap((d) => d.items).filter((i) => i.cashEffectCents < 0);
    expect(outflows).toHaveLength(1);
    expect(outflows[0]).toMatchObject({ date: "2026-02-10", source: "transfer" });
    expect(f.cards[0]!.statements[0]).toMatchObject({ paidOrScheduledCents: 50_000, autoPaymentCents: 0 });
  });

  it("a partial scheduled payment leaves the remainder to be paid on the due date", () => {
    const f = buildForecast(
      input({
        today: "2026-01-25",
        accounts: [checking(500_000, "2026-01-25"), card(50_000, "2026-01-25")],
        statements: [
          { id: "s1", accountId: "visa", closingDate: "2026-01-20", statementBalanceCents: 50_000, dueDate: "2026-02-15", paidCents: 10_000, status: "partial" },
        ],
        transfers: [{ id: "p", date: "2026-02-01", fromAccountId: "chk", toAccountId: "visa", amountCents: 15_000 }],
      }),
      30,
    );
    const auto = f.days.flatMap((d) => d.items).filter((i) => i.source === "card_statement");
    expect(auto).toHaveLength(1);
    expect(auto[0]!.cashEffectCents).toBe(-25_000);
  });

  it("recurring bills charged to a card are paid via the card, not twice", () => {
    const f = buildForecast(
      input({
        accounts: [checking(500_000), card(0)],
        rules: [
          rule({ id: "netflix", accountId: "visa", kind: "subscription", amountCents: 1_599, schedule: { frequency: "monthly", startDate: "2026-01-10" } }),
        ],
      }),
      90,
    );
    const cashOut = f.days.flatMap((d) => d.items).filter((i) => i.cashEffectCents < 0);
    expect(cashOut.every((i) => i.kind === "card_payment")).toBe(true);
    const netflixCash = f.days.flatMap((d) => d.items).filter((i) => i.label === "netflix");
    expect(netflixCash).toHaveLength(0);
    // Jan 10 charge → Jan 20 statement → Feb 15; Feb 10 → Feb 20 → Mar 15.
    expect(cashOut.map((i) => [i.date, i.cashEffectCents])).toEqual([
      ["2026-02-15", -1_599],
      ["2026-03-15", -1_599],
    ]);
  });

  it("pays an overdue unpaid statement today and asks about it", () => {
    const f = buildForecast(
      input({
        today: "2026-02-20",
        accounts: [checking(500_000, "2026-02-20"), card(30_000, "2026-02-20")],
        statements: [
          { id: "s", accountId: "visa", closingDate: "2026-01-20", statementBalanceCents: 30_000, dueDate: "2026-02-15", paidCents: 0, status: "unpaid" },
        ],
      }),
      30,
    );
    expect(f.days[0]!.items.some((i) => i.kind === "card_payment" && i.cashEffectCents === -30_000)).toBe(true);
    expect(f.issues.some((i) => i.question?.includes("due Feb 15"))).toBe(true);
  });

  it("refunds reduce the next statement", () => {
    const f = buildForecast(
      input({
        accounts: [checking(500_000), card(10_000)],
        transactions: [
          { id: "r", date: "2026-01-08", amountCents: 4_000, direction: "in", accountId: "visa", description: "Return", status: "planned" },
        ],
        statements: [],
      }),
      60,
    );
    const pay = f.days.flatMap((d) => d.items).filter((i) => i.kind === "card_payment");
    expect(pay[0]!.cashEffectCents).toBe(-6_000);
  });

  it("minimum-payment cards pay the minimum and say interest accrues", () => {
    const f = buildForecast(
      input({
        today: "2026-01-25",
        accounts: [checking(500_000, "2026-01-25"), card(100_000, "2026-01-25", { payInFull: false })],
        statements: [
          { id: "s", accountId: "visa", closingDate: "2026-01-20", statementBalanceCents: 100_000, minimumDueCents: 3_500, dueDate: "2026-02-15", paidCents: 0, status: "unpaid" },
        ],
      }),
      30,
    );
    const pay = f.days.flatMap((d) => d.items).filter((i) => i.kind === "card_payment");
    expect(pay[0]!.cashEffectCents).toBe(-3_500);
    expect(f.assumptions.join(" ")).toMatch(/interest will accrue/);
  });

  it("cards are never spendable even if flagged that way", () => {
    const f = buildForecast(input({ accounts: [checking(1_000), card(50_000, "2026-01-01", { isSpendable: true })] }), 5);
    expect(f.startingCashCents).toBe(1_000);
  });
});

describe("completeness and freshness", () => {
  it("flags missing balances, missing income and missing card dates, asking one question", () => {
    const f = buildForecast(
      input({ accounts: [checking(null), card(20_000, "2026-01-01", { statementCloseDay: null, paymentDueDay: null })] }),
      30,
    );
    expect(f.complete).toBe(false);
    const codes = f.issues.map((i) => i.code);
    expect(codes).toContain("missing_balance");
    expect(codes).toContain("no_income");
    expect(codes).toContain("card_missing_dates");
    expect(topQuestion(f.issues)?.question).toBeTruthy();
  });

  it("flags stale balances", () => {
    const f = buildForecast(input({ today: "2026-01-20", accounts: [checking(100_000, "2026-01-01")], rules: [payday()] }), 30);
    expect(f.issues.find((i) => i.code === "stale_balance")).toBeTruthy();
    expect(f.complete).toBe(false);
  });

  it("is complete with fresh balances, income and card dates", () => {
    const f = buildForecast(
      input({
        accounts: [checking(100_000), card(0)],
        rules: [payday()],
      }),
      30,
    );
    expect(f.complete).toBe(true);
  });
});

describe("goal reserves", () => {
  it("reserves a planned contribution when no transfer funds the goal", () => {
    const i = input({
      accounts: [checking(500_000), savings("wed", 100_000)],
      rules: [payday()],
      goals: [{ id: "g", name: "Wedding", kind: "wedding", accountId: "wed", targetCents: 2_000_000, monthlyContributionCents: 50_000 }],
    });
    const f = buildForecast(i, 60);
    const reserves = f.days.flatMap((d) => d.items).filter((x) => x.kind === "goal_reserve");
    expect(reserves.map((r) => r.date)).toEqual(["2026-02-01", "2026-03-01"]);
    expect(f.closingByAccount["wed"]).toBe(200_000);
    // With a funding rule, no reserve is added (no double savings).
    const funded = buildForecast(
      {
        ...i,
        rules: [
          ...i.rules,
          rule({ id: "s", kind: "savings_transfer", toAccountId: "wed", amountCents: 50_000, schedule: { frequency: "monthly", startDate: "2026-01-15" } }),
        ],
      },
      60,
    );
    expect(funded.days.flatMap((d) => d.items).filter((x) => x.kind === "goal_reserve")).toHaveLength(0);
  });
});
