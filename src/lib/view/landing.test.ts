import { describe, expect, it } from "vitest";
import { addDays } from "../dates";
import { buildLanding } from "./landing";

describe("landing page data", () => {
  it("every number adds up, on any day of the year", () => {
    for (let i = 0; i < 365; i += 5) {
      const today = addDays("2026-01-01", i);
      const d = buildLanding(today, `${today}T15:00:00Z`);
      // The running balance in "what your bank isn't telling you" reconciles exactly.
      let running = d.spokenFor.startCents;
      for (const s of d.spokenFor.steps) {
        running += s.amountCents;
        expect(s.balanceAfterCents).toBe(running);
      }
      expect(d.hero.points).toHaveLength(30);
      expect(d.hero.safeTodayCents).toBeGreaterThanOrEqual(0);
      expect(d.hero.lowest.cents).toBe(Math.min(...d.hero.points.map((p) => p.cents)));
      expect(d.weekCaps.length).toBeGreaterThan(0);
      // The demo's duplicate concert is caught and shown.
      expect(d.events.some((e) => e.recommendation === "duplicate")).toBe(true);
    }
  });

  it("uses only the fictional demo data", () => {
    const d = buildLanding("2026-05-05", "2026-05-05T15:00:00Z");
    expect(d.snapshot.profile.displayName).toMatch(/demo/i);
    expect(d.snapshot.calendarSources.every((c) => c.urlHint === "calendar.example.com")).toBe(true);
  });
});
