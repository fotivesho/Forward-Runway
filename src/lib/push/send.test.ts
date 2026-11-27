import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { demoSnapshot } from "../data/demo";
import { buildDashboard } from "../view/dashboard";
import { morningMessage } from "./send";

describe("morning note", () => {
  it("leads with today's limit and one thing about the day", () => {
    const today = "2026-11-27";
    const m = buildDashboard(demoSnapshot(today, `${today}T12:00:00Z`), today, 30, new Date(`${today}T12:00:00Z`));
    const msg = morningMessage(m, today);
    expect(msg.title).toMatch(/^Today's limit: \$\d/);
    expect(msg.body.length).toBeGreaterThan(3);
  });
});
