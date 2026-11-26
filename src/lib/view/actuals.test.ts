import { describe, expect, it } from "vitest";
import { demoSnapshot } from "../data/demo";
import { accuracy, biasByCategory, planResults } from "./actuals";

const today = "2026-11-26";
const s = demoSnapshot(today, `${today}T15:00:00Z`);

describe("how plans went", () => {
  it("matches finished plans to real charges and learns the error", () => {
    const r = planResults(s, today);
    const osteria = r.find((x) => x.title.includes("Osteria"))!;
    expect(osteria.actual?.description).toBe("Osteria Nove");
    expect(osteria.diffCents).toBe(620);
    expect(r.find((x) => x.title === "Haircut")!.diffCents).toBe(0);
    const dining = accuracy(r).find((a) => a.category === "Dining")!;
    expect(dining.plans).toBe(3);
    expect(dining.bias).toBeGreaterThan(1.05);
    expect(biasByCategory(s, today).Dining).toBeGreaterThan(1.05);
  });
});
