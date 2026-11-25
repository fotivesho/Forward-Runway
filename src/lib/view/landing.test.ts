import { describe, expect, it } from "vitest";
import { addDays, formatShort } from "../dates";
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

describe("can I afford it: pay-period free money", () => {
  const today = "2026-11-25";
  const d = buildLanding(today, `${today}T15:00:00Z`);
  const ctx = { input: toEngineInput(d.snapshot, today), events: d.afford.events, calendarIncomplete: d.afford.calendarIncomplete, nextPayday: d.hero.nextPayday };
  const visa = d.snapshot.accounts.find((a) => a.kind === "credit_card")!.id;
  const check = (amountCents: number, date: string, card = false, reservedCents = 0) =>
    checkAffordability(ctx, { amountCents, date, paymentAccountId: card ? visa : null, reservedCents });

  it("a purchase that fits its pay period's free money is a plain yes, and the numbers add up", () => {
    const r = check(10_000, "2026-11-29");
    expect(r.verdict).toBe("yes");
    expect(r.room.start <= "2026-11-29" && r.room.end >= "2026-11-29").toBe(true);
    expect(r.room.after).toBe(r.room.before - 10_000);
    expect(r.room.shortfall).toBe(0);
  });

  it("only calls it a yes when it fits, or costs at most a little everyday money later", () => {
    for (const cents of [5_000, 18_000, 65_000, 120_000, 240_000]) {
      for (const date of ["2026-11-25", "2026-11-28", "2026-11-29"]) {
        const r = check(cents, date);
        if (r.verdict === "yes") expect(r.room.shortfall === 0 || /a day less until/.test(r.action.detail)).toBe(true);
        else expect(r.room.shortfall + Math.max(0, ctx.input.settings.cashFloorCents - r.lowest.after.cents)).toBeGreaterThan(0);
      }
    }
  });

  it("a savings move covers the shortfall, is a round amount, and never uses the wedding fund", () => {
    const r = check(170_000, "2026-11-25");
    const move = [r.action, ...r.alternatives].find((a) => a.kind === "move")!;
    expect(move).toBeTruthy();
    expect(move.title).not.toMatch(/Wedding/);
    const moved = Number(move.title.match(/\$([\d,]+(?:\.\d\d)?)/)![1]!.replace(/,/g, "")) * 100;
    expect(moved).toBeGreaterThanOrEqual(r.room.shortfall);
    expect(moved % 1_000).toBe(0);
  });

  it("by card: cash leaves on the due date, measured against that pay period, with the payment shown", () => {
    const r = check(90_000, "2026-11-25", true);
    expect(r.cash.viaCard).toBeTruthy();
    expect(r.card).not.toBeNull();
    expect(r.cash.date).toBe(r.card!.due);
    expect(r.room.start <= r.card!.due && r.room.end >= r.card!.due).toBe(true);
    expect(r.card!.withCents).toBe(r.card!.usualCents + 90_000);
    expect(r.card!.usualCents).toBeGreaterThanOrEqual(r.card!.typicalCents);
    for (const a of [r.action, ...r.alternatives].filter((x) => x.kind === "move")) expect(a.title).toContain(formatShort(r.card!.due));
  });

  it("a plan already on the calendar isn't counted twice", () => {
    const planned = check(6_000, "2026-11-30", false, 6_000);
    expect(planned.verdict).toBe("yes");
    expect(planned.room.after).toBe(planned.room.before);
    expect(planned.action.detail).toMatch(/already set aside/);
    // Over its cap: only the extra is tested.
    expect(check(9_000, "2026-11-30", false, 6_000).room.after).toBe(check(3_000, "2026-11-30").room.after);
  });

  it("every 'cut it to' and 'skip a plan' suggestion really makes room", () => {
    for (const [cents, date] of [[65_000, "2026-11-29"], [120_000, "2026-11-28"], [240_000, "2026-11-29"]] as const) {
      const r = check(cents, date);
      for (const a of [r.action, ...r.alternatives]) {
        if (a.kind === "cheaper") {
          const amount = Math.round(Number(a.title.replace(/[^0-9.]/g, "")) * 100);
          expect(check(amount, date).verdict).toBe("yes");
        }
        if (a.kind === "skip_plan") {
          const freed = Number(a.detail.match(/\$([\d,]+(?:\.\d\d)?)/)![1]!.replace(/,/g, "")) * 100;
          expect(freed).toBeGreaterThanOrEqual(r.room.shortfall);
        }
      }
    }
  });

  it("flags a card statement that falls beyond the 90-day window", () => {
    expect(check(50_000, addDays(today, 80), true).cash.beyondHorizon).toBe(true);
  });

  it("a purchase far too big is 'not yet', still offering the most that fits", () => {
    const r = check(1_000_000, "2026-11-28");
    expect(r.verdict).toBe("not_yet");
    expect([r.action, ...r.alternatives].some((a) => a.kind === "cheaper")).toBe(true);
  });
});

describe("card statement cap", () => {
  const today = "2026-11-25";
  const d = buildLanding(today, `${today}T15:00:00Z`);
  const ctx = { input: toEngineInput(d.snapshot, today), events: d.afford.events, calendarIncomplete: d.afford.calendarIncomplete, nextPayday: d.hero.nextPayday };
  const visa = d.snapshot.accounts.find((a) => a.kind === "credit_card")!.id;

  it("cap = what's already headed to the statement + the due-date pay period's free money", () => {
    const r = checkAffordability(ctx, { amountCents: 100, date: "2026-11-29", paymentAccountId: visa });
    expect(r.card!.capCents).toBe(r.card!.usualCents + r.room.before);
    expect(r.verdict).toBe("yes");
    expect(r.action.detail).toMatch(/can be paid in full/);
  });

  it("staying under the cap needs no savings; going over it is short by exactly the overage", () => {
    const small = checkAffordability(ctx, { amountCents: 50_000, date: "2026-11-29", paymentAccountId: visa });
    expect(small.card!.withCents).toBeLessThanOrEqual(small.card!.capCents);
    expect([small.action, ...small.alternatives].some((a) => a.kind === "move")).toBe(false);
    const big = checkAffordability(ctx, { amountCents: 170_000, date: "2026-11-29", paymentAccountId: visa });
    expect(big.card!.withCents - big.card!.capCents).toBe(big.room.shortfall);
  });
});
