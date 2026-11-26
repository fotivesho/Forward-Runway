import { describe, expect, it } from "vitest";
import { demoSnapshot } from "../data/demo";
import { exploreData } from "./explore";
import { estimatePlan, readTitle } from "./estimate";

const today = "2026-11-26";
const x = exploreData(demoSnapshot(today, `${today}T15:00:00Z`), today);

describe("smart estimates", () => {
  it("reads people, kind and place from a title", () => {
    expect(readTitle("Dinner with Sam at Lucia's")).toMatchObject({ category: "Dining", people: 2, place: "lucia s" });
    expect(readTitle("Brunch with Sam and Priya")).toMatchObject({ category: "Dining", people: 3 });
    expect(readTitle("Concert tickets for 4")).toMatchObject({ category: "Entertainment", people: 4 });
    expect(readTitle("Weekend away with friends")).toMatchObject({ category: "Travel", people: 4, nights: 2 });
    expect(readTitle("Haircut", null).category).toBe("Personal care");
  });

  it("uses your history, scales by people, and says why", () => {
    const one = estimatePlan({ category: "Dining", people: 1 }, x);
    const two = estimatePlan({ category: "Dining", people: 2 }, x);
    expect(one.confidence).toBe("high");
    expect(two.cents).toBeGreaterThan(one.cents * 1.6);
    expect(two.reasons.join(" ")).toMatch(/2 people/);
    expect(two.low).toBeLessThanOrEqual(two.cents);
    expect(two.high).toBeGreaterThanOrEqual(two.cents);
  });

  it("starts from typical amounts with no history, tax and tip included for dining out", () => {
    const e = estimatePlan({ category: "Dining", people: 2 }, null);
    expect(e.confidence).toBe("starter");
    expect(e.reasons.join(" ")).toMatch(/Tax and tip included/);
    expect(estimatePlan({ category: "Car", people: 3 }, null).people).toBe(3);
    expect(estimatePlan({ category: "Car", people: 3 }, null).cents).toBe(estimatePlan({ category: "Car", people: 1 }, null).cents);
  });
});
