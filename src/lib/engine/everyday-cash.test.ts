import { describe, expect, it } from "vitest";
import { demoSnapshot } from "../data/demo";
import { toEngineInput } from "../data/snapshot";
import { buildForecast } from "./forecast";
import { everydayCash } from "./everyday-cash";

describe("when everyday spending leaves cash", () => {
  const today = "2026-11-27";
  const s = demoSnapshot(today, `${today}T12:00:00Z`);
  const card = s.accounts.find((a) => a.kind === "credit_card")!;
  const per = () => 5_000;

  it("debit: the same day", () => {
    const input = { ...toEngineInput(s, today), everydayPay: "debit" };
    const f = buildForecast(input, 30);
    expect(everydayCash(input, f, per).cumulative[0]).toBe(5_000);
  });

  it("on a card: nothing leaves until the statement is due, then it all does", () => {
    const input = { ...toEngineInput(s, today), everydayPay: card.id };
    const f = buildForecast(input, 60);
    const c = everydayCash(input, f, per);
    expect(c.cumulative[0]).toBe(0);
    const due = f.cards.find((x) => x.accountId === card.id)!.statements.find((x) => x.closingDate >= today)!.dueDate;
    const i = f.days.findIndex((d) => d.date === due);
    expect(c.cumulative[i]).toBeGreaterThan(0);
    expect(c.cumulative[i - 1]).toBe(0);
  });
});
