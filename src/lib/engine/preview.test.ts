import { describe, expect, it } from "vitest";
import { buildLanding } from "../view/landing";
import { toEngineInput } from "../data/snapshot";
import { checkAffordability, previewOption } from "./afford";

const today = "2026-11-26";
const d = buildLanding(today, `${today}T15:00:00Z`);
const ctx = { input: toEngineInput(d.snapshot, today), events: d.afford.events, calendarIncomplete: d.afford.calendarIncomplete, nextPayday: d.hero.nextPayday };

describe("previewing an option", () => {
  it("moving savings in, skipping a plan or cutting the price makes it fit better", () => {
    const visa = d.snapshot.accounts.find((a) => a.kind === "credit_card")!.id;
    for (const req of [{ amountCents: 65_000, date: today }, { amountCents: 240_000, date: today, paymentAccountId: visa }]) {
      const base = checkAffordability(ctx, req);
      expect(base.verdict).not.toBe("yes");
      const rank = { yes: 0, yes_with_plan: 1, not_yet: 2 } as const;
      for (const o of [base.action, ...base.alternatives]) {
        const p = previewOption(ctx, req, o);
        if (!p) continue;
        expect(rank[p.verdict]).toBeLessThanOrEqual(rank[base.verdict]);
        if (o.kind === "move" || o.kind === "cheaper") expect(p.verdict).toBe("yes");
      }
    }
  });
});
