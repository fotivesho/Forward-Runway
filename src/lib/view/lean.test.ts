import { describe, expect, it } from "vitest";
import { demoSnapshot } from "../data/demo";
import { buildDashboard } from "./dashboard";

describe("lean mode", () => {
  const today = "2026-11-27";
  const base = demoSnapshot(today, `${today}T12:00:00Z`);

  it("stays off when there's room", () => {
    expect(buildDashboard(base, today, 30, new Date(`${today}T12:00:00Z`)).lean).toBeNull();
  });

  it("when the pay period is short, limits become needs-only and follow the day, not $0", () => {
    // A big bill tomorrow empties this pay period.
    const chk = base.accounts.find((a) => a.kind === "checking")!;
    const s = { ...base, rules: [...base.rules, { id: "big", name: "Big bill", kind: "bill" as const, amountCents: 900_000, accountId: chk.id, schedule: { frequency: "once" as const, startDate: "2026-11-28" } }] };
    const m = buildDashboard(s, today, 30, new Date(`${today}T12:00:00Z`));
    expect(m.lean).not.toBeNull();
    expect(m.plan.days.every((d) => d.lean)).toBe(true);
    const caps = m.plan.days.map((d) => d.baseCents);
    expect(caps.some((c) => c > 0)).toBe(true);
    expect(m.plan.days[0]!.reasons?.[0]).toMatch(/Lean: needs only/);
  });
});
