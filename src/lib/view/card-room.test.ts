import { describe, expect, it } from "vitest";
import { demoSnapshot } from "../data/demo";
import { cardRoom } from "./card-room";

describe("room for a card bill", () => {
  it("adds up: every line sums to the room", () => {
    const today = "2026-11-27";
    const s = demoSnapshot(today, `${today}T12:00:00Z`);
    const card = s.accounts.find((a) => a.kind === "credit_card")!;
    const rooms = cardRoom(s, today, card.id);
    expect(rooms.length).toBeGreaterThan(0);
    for (const r of rooms) {
      expect(r.lines.reduce((t, l) => t + l.cents, 0)).toBe(r.maxCents);
      expect(r.billCents).toBeGreaterThan(0);
    }
  });
});
