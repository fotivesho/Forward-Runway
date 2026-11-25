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

import { checkAffordability } from "../engine/afford";
import { toEngineInput } from "../data/snapshot";

describe("landing affordability checker", () => {
  const today = "2026-11-25";
  const d = buildLanding(today, `${today}T15:00:00Z`);
  const ctx = { input: toEngineInput(d.snapshot, today), events: d.afford.events, calendarIncomplete: d.afford.calendarIncomplete, nextPayday: d.hero.nextPayday };

  it("uses the same safe-to-spend number as the hero", () => {
    const r = checkAffordability(ctx, { amountCents: 2_000, date: today });
    expect(r.safeToday.before).toBe(d.hero.safeTodayCents);
  });

  it("a small purchase is a plain yes and lowers today's number at most by its cost", () => {
    const r = checkAffordability(ctx, { amountCents: 2_000, date: addDays(today, 3) });
    expect(r.verdict).toBe("yes");
    expect(r.action.kind).toBe("go");
    expect(r.safeToday.after).toBeLessThanOrEqual(r.safeToday.before);
    expect(r.lowest.after.cents).toBeLessThanOrEqual(r.lowest.before.cents);
  });

  it("a big purchase comes with a plan or a computed alternative", () => {
    for (const cents of [240_000, 600_000, 1_500_000]) {
      const r = checkAffordability(ctx, { amountCents: cents, date: addDays(today, 3) });
      expect(r.verdict).not.toBe("yes");
      if (r.verdict === "yes_with_plan") expect(r.action.kind).toBe("move");
      else expect(["wait", "tighten", "cheaper", "none"]).toContain(r.action.kind);
      // Any "go cheaper" suggestion really fits.
      for (const a of [r.action, ...r.alternatives].filter((x) => x.kind === "cheaper")) {
        const amount = Number(a.title.replace(/[^0-9.]/g, "")) * 100;
        expect(checkAffordability(ctx, { amountCents: Math.round(amount), date: addDays(today, 3) }).verdict).toBe("yes");
      }
    }
  });

  it("never suggests the protected wedding fund", () => {
    const r = checkAffordability(ctx, { amountCents: 600_000, date: addDays(today, 3) });
    expect(r.action.title).not.toMatch(/Wedding/);
  });
});

describe("yes, with a plan", () => {
  it("moves enough savings to keep today's safe-to-spend, without emptying savings", () => {
    const today = "2026-11-25";
    const d = buildLanding(today, `${today}T15:00:00Z`);
    const ctx = { input: toEngineInput(d.snapshot, today), events: d.afford.events, calendarIncomplete: d.afford.calendarIncomplete, nextPayday: d.hero.nextPayday };
    const r = checkAffordability(ctx, { amountCents: 240_000, date: addDays(today, 3) });
    expect(r.verdict).toBe("yes_with_plan");
    expect(r.safeToday.after).toBeGreaterThanOrEqual(Math.floor(r.safeToday.before * 0.8));
    expect(r.lowest.after.cents).toBeGreaterThanOrEqual(d.hero.floorCents);
    const moved = Number(r.action.title.match(/\$([\d,]+\.\d\d)/)![1]!.replace(/,/g, "")) * 100;
    expect(moved).toBeGreaterThanOrEqual(r.plan.shortfallCents);
    expect(moved).toBeLessThanOrEqual(r.plan.shortfallCents + 240_000);
  });
});

describe("a yes means today's number stays close to normal", () => {
  it("never answers yes while squeezing today's safe-to-spend below 80%", () => {
    const today = "2026-11-25";
    const d = buildLanding(today, `${today}T15:00:00Z`);
    const ctx = { input: toEngineInput(d.snapshot, today), events: d.afford.events, calendarIncomplete: d.afford.calendarIncomplete, nextPayday: d.hero.nextPayday };
    for (const cents of [5_000, 18_000, 65_000, 120_000, 210_000, 240_000]) {
      const r = checkAffordability(ctx, { amountCents: cents, date: addDays(today, 3) });
      if (r.verdict === "yes") expect(r.safeToday.after).toBeGreaterThanOrEqual(Math.floor(r.safeToday.before * 0.8));
      if (r.verdict !== "not_yet") expect(r.lowest.after.cents).toBeGreaterThanOrEqual(d.hero.floorCents);
    }
    // The $2,100 case that used to say "fits" while leaving $0.40 a day is no longer a plain yes.
    expect(checkAffordability(ctx, { amountCents: 210_000, date: addDays(today, 3) }).verdict).not.toBe("yes");
  });
});
