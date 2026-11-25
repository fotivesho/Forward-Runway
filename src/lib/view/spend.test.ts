import { describe, expect, it } from "vitest";
import { demoSnapshot } from "../data/demo";
import { addDays } from "../dates";
import { cashFlow, categoryHistory, monthBuckets, payPeriodBuckets, weekBuckets } from "./spend";

const today = "2026-11-25";
const s = demoSnapshot(today, `${today}T15:00:00Z`);

describe("spend insights", () => {
  it("builds six months ending with the current one", () => {
    const b = monthBuckets(today);
    expect(b).toHaveLength(6);
    expect(b[5]).toMatchObject({ start: "2026-11-01", end: "2026-11-30", current: true, label: "Nov" });
    expect(b[0]!.start).toBe("2026-06-01");
  });

  it("builds pay periods from the main paycheck, payday to the day before the next", () => {
    const b = payPeriodBuckets(s, today)!;
    expect(b.length).toBeGreaterThan(3);
    const last = b[b.length - 1]!;
    expect(last.current).toBe(true);
    for (let i = 1; i < b.length; i++) expect(b[i]!.start).toBe(addDays(b[i - 1]!.end, 1));
  });

  it("counts income and bills by month, without card payments or transfers", () => {
    const flow = cashFlow(s, today, monthBuckets(today));
    const oct = flow.find((f) => f.start === "2026-10-01")!;
    // Two or three biweekly paychecks of $2,150.
    expect([430_000, 645_000]).toContain(oct.inCents);
    // Rent alone is in October's money out; wedding savings are counted as set aside.
    expect(oct.outCents).toBeGreaterThan(165_000);
    expect(oct.savingsCents).toBe(80_000);
  });

  it("sums a category exactly like the transactions do", () => {
    const weeks = weekBuckets(today);
    const hist = categoryHistory(s, "Dining", weeks, today);
    const direct = s.transactions
      .filter((t) => t.category === "Dining" && t.direction === "out" && t.status === "posted" && t.date >= weeks[0]!.start && t.date <= today)
      .reduce((a, t) => a + t.amountCents, 0);
    expect(hist.reduce((a, b) => a + b.cents, 0)).toBe(direct);
  });
});
