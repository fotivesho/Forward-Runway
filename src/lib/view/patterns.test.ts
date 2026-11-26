import { describe, expect, it } from "vitest";
import { demoSnapshot } from "../data/demo";
import { insights, paceUntil, predict, spendModel, typicalDay } from "./patterns";
import { addDays, eachDay } from "../dates";
import type { Snapshot } from "../data/snapshot";

const today = "2026-11-26";
const s = demoSnapshot(today, "2026-11-26T15:00:00Z");

describe("patterns", () => {
  it("learns the demo's habits", () => {
    const m = spendModel(s, today)!;
    expect(m).not.toBeNull();
    expect(m.payday).toBeGreaterThan(1.3);
    expect(m.weekday[6]).toBeGreaterThan(1.2);
    expect(m.excluded).toContain("Groceries"); // the weekly groceries rule already covers it
    expect(m.lumpy.map((l) => l.category)).toContain("Car");
    const ids = insights(s, today, m).map((i) => i.id);
    expect(ids).toEqual(expect.arrayContaining(["payday", "lumpy-Car", "price-music app", "subs", "weekday"]));
    expect(ids.some((i) => i.startsWith("creep-"))).toBe(true);
  });

  it("predictions add up to the past rate and favor paydays and Saturdays", () => {
    const m = spendModel(s, today)!;
    const end = addDays(m.from, m.days - 1);
    const p = predict(m, m.from, end);
    expect(Math.abs(p.totalCents - m.perDayCents * m.days)).toBeLessThan(m.days * 2);
    const payday = m.paydays.find((d) => d > today)!;
    expect(typicalDay(m, payday).cents).toBeGreaterThan(m.perDayCents);
    expect(typicalDay(m, payday).why).toBe("right after payday");
    const pace = paceUntil(m, today, addDays(today, 30), 0);
    expect(pace.usualCents).toBeGreaterThan(0);
    expect(pace.lumpy.map((l) => l.category)).toContain("Car");
  });

  it("needs three weeks of history", () => {
    const fresh: Snapshot = { ...s, transactions: s.transactions.filter((t) => t.date >= addDays(today, -10)) };
    expect(spendModel(fresh, today)).toBeNull();
    expect(eachDay(today, today)).toHaveLength(1);
  });
});
