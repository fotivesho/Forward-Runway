import { describe, expect, it } from "vitest";
import { rawOccurrences, ruleOccurrences } from "../schedule";
import { rule } from "./fixtures";

describe("rawOccurrences", () => {
  it("one-time", () => {
    expect(rawOccurrences({ frequency: "once", startDate: "2026-01-10" }, "2026-01-01", "2026-01-31")).toEqual(["2026-01-10"]);
    expect(rawOccurrences({ frequency: "once", startDate: "2026-02-10" }, "2026-01-01", "2026-01-31")).toEqual([]);
  });

  it("weekly anchored to start date, window starting mid-cycle", () => {
    expect(rawOccurrences({ frequency: "weekly", startDate: "2025-12-05" }, "2026-01-01", "2026-01-20")).toEqual([
      "2026-01-02",
      "2026-01-09",
      "2026-01-16",
    ]);
  });

  it("biweekly keeps its phase across long gaps", () => {
    const d = rawOccurrences({ frequency: "biweekly", startDate: "2025-01-03" }, "2026-01-01", "2026-01-31");
    expect(d).toEqual(["2026-01-02", "2026-01-16", "2026-01-30"]);
  });

  it("monthly on the 31st clamps to month end without drifting", () => {
    const d = rawOccurrences({ frequency: "monthly", startDate: "2026-01-31" }, "2026-01-01", "2026-05-31");
    expect(d).toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30", "2026-05-31"]);
  });

  it("monthly last-day (-1) handles leap years", () => {
    const d = rawOccurrences({ frequency: "monthly", startDate: "2028-01-01", dayOfMonth: -1 }, "2028-01-01", "2028-03-31");
    expect(d).toEqual(["2028-01-31", "2028-02-29", "2028-03-31"]);
  });

  it("semi-monthly 15th and last day", () => {
    const d = rawOccurrences(
      { frequency: "semimonthly", startDate: "2026-01-01", dayOfMonth: 15, secondDayOfMonth: -1 },
      "2026-01-01",
      "2026-02-28",
    );
    expect(d).toEqual(["2026-01-15", "2026-01-31", "2026-02-15", "2026-02-28"]);
  });

  it("semi-monthly 30th and 31st collapse to one date in February", () => {
    const d = rawOccurrences(
      { frequency: "semimonthly", startDate: "2026-02-01", dayOfMonth: 30, secondDayOfMonth: 31 },
      "2026-02-01",
      "2026-02-28",
    );
    expect(d).toEqual(["2026-02-28"]);
  });

  it("semi-monthly defaults to the 1st and 15th", () => {
    expect(rawOccurrences({ frequency: "semimonthly", startDate: "2026-01-01" }, "2026-01-01", "2026-01-31")).toEqual([
      "2026-01-01",
      "2026-01-15",
    ]);
  });

  it("respects end dates and start dates", () => {
    expect(
      rawOccurrences({ frequency: "monthly", startDate: "2026-02-10", endDate: "2026-03-10" }, "2026-01-01", "2026-06-30"),
    ).toEqual(["2026-02-10", "2026-03-10"]);
  });
});

describe("ruleOccurrences", () => {
  const r = rule({
    id: "rent",
    amountCents: 150_000,
    schedule: { frequency: "monthly", startDate: "2026-01-01", dayOfMonth: 1, weekendAdjust: "before" },
  });

  it("moves weekend dates", () => {
    // 2026-02-01 is a Sunday → Friday Jan 30
    const occ = ruleOccurrences(r, [], "2026-01-15", "2026-02-15");
    expect(occ.map((o) => [o.originalDate, o.date])).toEqual([["2026-02-01", "2026-01-30"]]);
  });

  it("applies skip, modify and posted overrides", () => {
    const occ = ruleOccurrences(
      r,
      [
        { id: "o1", ruleId: "rent", originalDate: "2026-03-01", action: "skip" },
        { id: "o2", ruleId: "rent", originalDate: "2026-04-01", action: "modify", newDate: "2026-04-03", amountCents: 160_000 },
        { id: "o3", ruleId: "rent", originalDate: "2026-05-01", action: "posted" },
      ],
      "2026-03-01",
      "2026-05-31",
    );
    expect(occ).toHaveLength(2);
    expect(occ[0]).toMatchObject({ date: "2026-04-03", amountCents: 160_000, movedFrom: "2026-04-01" });
    expect(occ[1]).toMatchObject({ date: "2026-05-01", posted: true });
  });

  it("an override can move an occurrence into the window", () => {
    const occ = ruleOccurrences(
      r,
      [{ id: "o", ruleId: "rent", originalDate: "2026-06-01", action: "modify", newDate: "2026-05-20" }],
      "2026-05-15",
      "2026-05-25",
    );
    expect(occ.map((o) => o.date)).toEqual(["2026-05-20"]);
  });

  it("inactive rules produce nothing", () => {
    expect(ruleOccurrences({ ...r, active: false }, [], "2026-01-01", "2026-12-31")).toEqual([]);
  });
});
