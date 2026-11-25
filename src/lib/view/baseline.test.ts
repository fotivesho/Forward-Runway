import { describe, expect, it } from "vitest";
import { demoSnapshot } from "../data/demo";
import { addDays } from "../dates";
import { buildDashboard } from "./dashboard";

const today = "2026-11-25";
const now = new Date(`${today}T15:00:00Z`);

describe("everyday safe-to-spend per day", () => {
  const s = demoSnapshot(today, now.toISOString());
  const m = buildDashboard(s, today, 30, now);

  it("covers every day of the forecast, never negative", () => {
    for (const d of m.forecast90.days) {
      expect(m.baselineByDay[d.date]).toBeTypeOf("number");
      expect(m.baselineByDay[d.date]!).toBeGreaterThanOrEqual(0);
    }
  });

  it("matches the daily caps this pay period", () => {
    for (const d of m.plan.days) expect(m.baselineByDay[d.date]).toBe(d.baseCents);
  });

  it("drops when you add a plan in that pay period, and comes back when you remove it", () => {
    const later = m.plan.allowance.periods[2]!;
    const date = addDays(later.start, 2);
    const withPlan = {
      ...s,
      calendarEvents: [
        ...s.calendarEvents,
        { ...s.calendarEvents[0]!, id: "00000000-0000-4000-e000-000000000099", externalUid: "x", title: "Big night out", date, estimateCents: 20_000, estimateConfirmed: true, capCents: null },
      ],
    };
    const m2 = buildDashboard(withPlan, today, 30, now);
    expect(m2.baselineByDay[later.end]!).toBeLessThan(m.baselineByDay[later.end]!);
    expect(buildDashboard(s, today, 30, now).baselineByDay[later.end]).toBe(m.baselineByDay[later.end]);
  });
});
