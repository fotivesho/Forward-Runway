import { describe, expect, it } from "vitest";
import { addDays } from "@/lib/dates";
import type { OneTimeTransaction, RecurringRule } from "@/lib/engine";
import { ruleOccurrences } from "@/lib/engine";
import { ruleHistory, sameThing, txnHistory } from "./history";

const today = "2026-11-26";
let n = 0;
const tx = (date: string, cents: number, description = "Lunch"): OneTimeTransaction =>
  ({ id: `t${n++}`, accountId: "a", direction: "out", amountCents: cents, description, date, status: "posted", category: "Dining" }) as OneTimeTransaction;

describe("history", () => {
  it("matches names loosely", () => {
    expect(sameThing("NETFLIX.COM 8273", "Netflix")).toBe(true);
    expect(sameThing("Lunch", "Coffee")).toBe(false);
  });

  it("shows frequent things by month, with this month's rest and next month ahead", () => {
    const txns = Array.from({ length: 60 }, (_, i) => tx(addDays(today, -i * 2), 1200));
    const h = txnHistory(txns[0]!, txns, today)!;
    expect(h.unit).toBe("month");
    const now = h.bars.find((b) => b.kind === "now")!;
    expect(now.doneCents).toBeGreaterThan(0);
    expect(now.cents).toBeGreaterThan(now.doneCents!);
    expect(h.bars.at(-1)!.kind).toBe("ahead");
    expect(h.perMonthCents).toBeGreaterThan(15_000);
  });

  it("projects the next ones for regular charges, and nothing for a one-off", () => {
    const txns = [tx("2026-08-03", 1599, "Netflix"), tx("2026-09-03", 1599, "Netflix"), tx("2026-10-03", 1599, "Netflix"), tx("2026-11-03", 1599, "Netflix")];
    const h = txnHistory(txns[3]!, txns, today)!;
    expect(h.unit).toBe("charge");
    expect(h.everyDays).toBeGreaterThanOrEqual(30);
    expect(h.bars.filter((b) => b.kind === "ahead")).toHaveLength(2);
    expect(h.bars.find((b) => b.kind === "ahead")!.title).toContain("Dec");
    expect(txnHistory(tx("2026-11-01", 5000, "Concert"), [tx("2026-11-01", 5000, "Concert")], today)).toBeNull();
  });

  it("gives a repeating item its past dates and the next ones", () => {
    const rule = { id: "r", name: "Paycheck", kind: "income", amountCents: 215_000, accountId: "a", schedule: { frequency: "biweekly", startDate: "2026-01-02" } } as RecurringRule;
    const ahead = ruleOccurrences(rule, [], today, addDays(today, 60));
    const h = ruleHistory(rule, [], [], today, ahead);
    expect(h.bars.filter((b) => b.kind === "past").length).toBeGreaterThanOrEqual(5);
    expect(h.bars.filter((b) => b.kind === "ahead")).toHaveLength(4);
    expect(h.bars.find((b) => b.kind === "ahead")!.occurrence).toBeDefined();
  });
});
