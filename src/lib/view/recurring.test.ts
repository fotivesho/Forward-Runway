import { describe, expect, it } from "vitest";
import { addDays, addMonths } from "../dates";
import type { OneTimeTransaction, RecurringRule } from "../engine";
import { cleanName, findRecurring } from "./recurring";

const today = "2026-11-25";
let n = 0;
const tx = (date: string, cents: number, description: string, direction: "in" | "out" = "out", category: string | null = null): OneTimeTransaction => ({
  id: `t${n++}`,
  date,
  amountCents: cents,
  direction,
  accountId: "chk",
  description,
  category,
  status: "posted",
  cleared: true,
});

describe("finding what repeats", () => {
  it("cleans merchant names", () => {
    expect(cleanName("NETFLIX.COM 866-579-7172 CA")).toBe("netflix");
    expect(cleanName("AMAZON PRIME*2K4 Seattle WA")).toBe("amazon prime");
  });

  it("finds a twice-monthly paycheck on the 1st and 15th", () => {
    const t: OneTimeTransaction[] = [];
    for (let m = -5; m <= 0; m++) {
      const first = addMonths("2026-11-01", m);
      t.push(tx(first, 373_500, "ACME CORP PAYROLL", "in", "Income"));
      if (addMonths("2026-11-15", m) <= today) t.push(tx(addMonths("2026-11-15", m), 373_500, "ACME CORP PAYROLL", "in", "Income"));
    }
    const [pay] = findRecurring(t, [], today);
    expect(pay).toMatchObject({ kind: "income", frequency: "semimonthly", dayOfMonth: 1, secondDayOfMonth: 15, amountCents: 373_500, nextDate: "2026-12-01" });
  });

  it("finds a monthly subscription and a weekly habit, but not one-off purchases", () => {
    const t: OneTimeTransaction[] = [];
    for (let m = -4; m <= 0; m++) t.push(tx(addMonths("2026-11-08", m), 1_549, "NETFLIX.COM 866-579-7172", "out", "Entertainment"));
    for (let w = 0; w < 8; w++) t.push(tx(addDays("2026-11-23", -7 * w), 2_500, "Sunday Farmers Market"));
    t.push(tx("2026-10-02", 89_900, "Best Buy 1123"));
    const found = findRecurring(t, [], today);
    expect(found.map((f) => f.frequency).sort()).toEqual(["monthly", "weekly"]);
    expect(found.find((f) => f.frequency === "monthly")).toMatchObject({ kind: "subscription", amountCents: 1_549, nextDate: "2026-12-08" });
  });

  it("skips what you've already set up, what stopped, card payments and dismissed ones", () => {
    const t: OneTimeTransaction[] = [];
    for (let m = -4; m <= 0; m++) t.push(tx(addMonths("2026-11-01", m), 165_000, "Maple Street Apartments", "out", "Housing"));
    for (let m = -6; m <= -3; m++) t.push(tx(addMonths("2026-11-10", m), 999, "Old Gym"));
    for (let m = -4; m <= 0; m++) t.push(tx(addMonths("2026-11-15", m), 64_000, "Chase card autopay", "out", "Card payment"));
    for (let m = -4; m <= 0; m++) t.push(tx(addMonths("2026-11-03", m), 1_099, "Spotify"));
    const rent: RecurringRule = { id: "r", name: "Rent", kind: "bill", amountCents: 165_000, accountId: "chk", schedule: { frequency: "monthly", startDate: "2026-01-01", dayOfMonth: 1 } };
    const found = findRecurring(t, [rent], today, new Set(["out|spotify"]));
    expect(found).toEqual([]);
  });
});
