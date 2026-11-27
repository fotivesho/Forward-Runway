import { describe, expect, it } from "vitest";
import type { OneTimeTransaction, RecurringRule } from "@/lib/engine";
import { ruleOccurrences } from "@/lib/engine";
import { autoPosted } from "./match";
import { ruleHistory } from "@/lib/view/history";

const rent = { id: "r", name: "Northvale", kind: "bill", amountCents: 204_300, accountId: "chk", category: "Housing", schedule: { frequency: "monthly", startDate: "2026-12-02", dayOfMonth: 2 } } as RecurringRule;
const tx = (id: string, date: string, cents: number, description = "NORTHVALE PROPERTY MGMT", accountId = "chk"): OneTimeTransaction =>
  ({ id, accountId, direction: "out", amountCents: cents, description, date, status: "posted", category: "Housing" }) as OneTimeTransaction;

describe("matching real charges to repeating items", () => {
  it("marks a date done when the charge comes in at a different amount, even a day early", () => {
    const auto = autoPosted([rent], [tx("a", "2026-12-01", 198_500)], [], "2026-12-01");
    expect(auto).toHaveLength(1);
    expect(auto[0]).toMatchObject({ ruleId: "r", originalDate: "2026-12-02", action: "posted", amountCents: 198_500 });
    // So it's no longer counted as still coming.
    const occ = ruleOccurrences(rent, auto, "2026-12-01", "2026-12-05");
    expect(occ[0]!.posted).toBe(true);
  });

  it("ignores other accounts, far-off dates and unrelated charges", () => {
    expect(autoPosted([rent], [tx("a", "2026-12-01", 198_500, "Northvale", "card")], [], "2026-12-01")).toHaveLength(0);
    expect(autoPosted([rent], [tx("a", "2026-11-20", 198_500)], [], "2026-12-01")).toHaveLength(0);
    expect(autoPosted([rent], [tx("a", "2026-12-01", 5_000, "Hardware store")], [], "2026-12-01")).toHaveLength(0);
  });

  it("the chart shows the real charges from before the item was set up", () => {
    const txns = [tx("a", "2026-10-02", 207_600), tx("b", "2026-11-02", 201_000)];
    const ahead = ruleOccurrences(rent, [], "2026-11-27", "2027-01-27");
    const h = ruleHistory(rent, txns, [], "2026-11-27", ahead);
    expect(h.bars.filter((b) => b.kind === "past").map((b) => b.cents)).toEqual([207_600, 201_000]);
    expect(h.bars.filter((b) => b.kind === "ahead")).toHaveLength(2);
  });
});
