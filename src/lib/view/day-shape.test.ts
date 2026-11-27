import { describe, expect, it } from "vitest";
import { addDays } from "../dates";
import { demoSnapshot } from "../data/demo";
import { dayShape, dueTrips } from "./day-shape";
import { buildDashboard } from "./dashboard";

const today = "2026-11-27";
const demo = demoSnapshot(today, `${today}T15:00:00Z`);

describe("daily limits that follow your habits", () => {
  it("spots a trip that's overdue and puts it on today", () => {
    const g = (n: number) => ({ id: `g${n}`, accountId: demo.accounts[0]!.id, direction: "out" as const, amountCents: 8_000, description: "Grocer", date: addDays(today, -n), status: "posted" as const, category: "Groceries" });
    const s = { ...demo, transactions: [...demo.transactions.filter((t) => t.category !== "Groceries"), ...[10, 16, 22, 28, 34, 40].map(g)] };
    const trips = dueTrips(s, today, addDays(today, 14)).filter((t) => t.category === "Groceries");
    expect(trips[0]).toMatchObject({ date: today, overdue: true, everyDays: 6, cents: 8_000 });
    expect(dayShape(s, today, addDays(today, 6))!.reasons[today]!.join(" ")).toMatch(/Groceries likely: last time was 10 days ago, usually every 6/);
  });

  it("shapes the days but keeps the same total", () => {
    const m = buildDashboard(demo, today, 30, new Date(`${today}T15:00:00Z`));
    const days = m.plan.days;
    const base = days.map((d) => d.baseCents);
    expect(new Set(base).size).toBeGreaterThan(1);
    const pool = m.plan.poolCents - days.reduce((t, d) => t + d.eventCents, 0);
    expect(base.reduce((a, b) => a + b, 0)).toBe(Math.max(0, pool));
  });
});
