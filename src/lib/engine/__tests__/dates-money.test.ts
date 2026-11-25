import { describe, expect, it } from "vitest";
import {
  addDays,
  addMonths,
  adjustForWeekend,
  dayOfWeek,
  diffDays,
  isISODate,
  nextDayOfMonthAfterSafe,
  todayInZone,
} from "./helpers";
import { allocate, formatCents, friendlyRoundUp, parseDollars } from "../../money";

describe("dates", () => {
  it("validates ISO dates including leap years", () => {
    expect(isISODate("2024-02-29")).toBe(true);
    expect(isISODate("2025-02-29")).toBe(false);
    expect(isISODate("2026-13-01")).toBe(false);
    expect(isISODate("2026-1-01")).toBe(false);
  });

  it("adds days across month, year and DST boundaries", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-07", 2)).toBe("2026-03-09"); // US DST starts Mar 8 2026
    expect(addDays("2026-11-01", 1)).toBe("2026-11-02"); // US DST ends Nov 1 2026
    expect(diffDays("2026-01-01", "2027-01-01")).toBe(365);
    expect(diffDays("2028-01-01", "2029-01-01")).toBe(366);
  });

  it("clamps month arithmetic at month end", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2028-01-31", 1)).toBe("2028-02-29");
    expect(addMonths("2026-03-31", -1)).toBe("2026-02-28");
    expect(addMonths("2026-12-15", 1)).toBe("2027-01-15");
  });

  it("knows weekdays and weekend adjustment", () => {
    expect(dayOfWeek("2026-01-01")).toBe(4); // Thursday
    expect(adjustForWeekend("2026-01-03", "before")).toBe("2026-01-02"); // Sat → Fri
    expect(adjustForWeekend("2026-01-04", "after")).toBe("2026-01-05"); // Sun → Mon
    expect(adjustForWeekend("2026-01-05", "before")).toBe("2026-01-05");
  });

  it("finds the next day-of-month strictly after a date", () => {
    expect(nextDayOfMonthAfterSafe("2026-01-20", 15)).toBe("2026-02-15");
    expect(nextDayOfMonthAfterSafe("2026-01-10", 15)).toBe("2026-01-15");
    expect(nextDayOfMonthAfterSafe("2026-01-31", 31)).toBe("2026-02-28");
  });

  it("computes today in a time zone", () => {
    const instant = new Date("2026-01-01T03:00:00Z");
    expect(todayInZone("America/Los_Angeles", instant)).toBe("2025-12-31");
    expect(todayInZone("Asia/Tokyo", instant)).toBe("2026-01-01");
  });
});

describe("money", () => {
  it("parses dollar input to integer cents", () => {
    expect(parseDollars("1,234.56")).toBe(123456);
    expect(parseDollars("$12")).toBe(1200);
    expect(parseDollars("0.1")).toBe(10);
    expect(parseDollars(".05")).toBe(5);
    expect(parseDollars("-3.50")).toBe(-350);
    expect(parseDollars("(40)")).toBe(-4000);
    expect(parseDollars("12.345")).toBeNull();
    expect(parseDollars("abc")).toBeNull();
    expect(parseDollars("")).toBeNull();
  });

  it("never introduces float error", () => {
    expect(parseDollars("0.29")).toBe(29); // 0.29*100 = 28.999... in floats
    expect(parseDollars("19.99")).toBe(1999);
  });

  it("formats cents", () => {
    expect(formatCents(123456)).toBe("$1,234.56");
    expect(formatCents(-5)).toBe("−$0.05");
    expect(formatCents(500, { sign: true })).toBe("+$5.00");
  });

  it("allocates exactly, with no lost cents", () => {
    const parts = allocate(1000, [1, 1, 1]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(1000);
    expect(parts).toEqual([334, 333, 333]);
    expect(allocate(10, [0, 0])).toEqual([5, 5]);
    expect(allocate(-7, [1, 1]).reduce((a, b) => a + b, 0)).toBe(-7);
  });

  it("rounds caps to friendly amounts", () => {
    expect(friendlyRoundUp(4210)).toBe(4500);
    expect(friendlyRoundUp(12_340)).toBe(13_000);
  });
});
