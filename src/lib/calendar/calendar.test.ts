import { describe, expect, it } from "vitest";
import { parseIcs } from "./ics";
import { estimateEventCost, normalizeTitle } from "./estimate";
import { findDuplicates } from "./duplicates";
import { calendarCoverage } from "./coverage";

const ICS = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//EN
X-WR-CALNAME:Home
BEGIN:VTIMEZONE
TZID:America/New_York
BEGIN:STANDARD
DTSTART:19701101T020000
RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU
TZOFFSETFROM:-0400
TZOFFSETTO:-0500
END:STANDARD
BEGIN:DAYLIGHT
DTSTART:19700308T020000
RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU
TZOFFSETFROM:-0500
TZOFFSETTO:-0400
END:DAYLIGHT
END:VTIMEZONE
BEGIN:VEVENT
UID:dinner-1
DTSTART;TZID=America/New_York:20260110T190000
DTEND;TZID=America/New_York:20260110T210000
SUMMARY:Dinner w/ Sam
END:VEVENT
BEGIN:VEVENT
UID:late-1
DTSTART:20260111T040000Z
SUMMARY:Late show
END:VEVENT
BEGIN:VEVENT
UID:allday-1
DTSTART;VALUE=DATE:20260115
DTEND;VALUE=DATE:20260116
SUMMARY:Sarah's birthday party
END:VEVENT
BEGIN:VEVENT
UID:yoga
DTSTART;TZID=America/New_York:20260105T180000
RRULE:FREQ=WEEKLY;COUNT=4
SUMMARY:Yoga class
END:VEVENT
BEGIN:VEVENT
UID:yoga
RECURRENCE-ID;TZID=America/New_York:20260112T180000
DTSTART;TZID=America/New_York:20260112T180000
SUMMARY:Yoga class
STATUS:CANCELLED
END:VEVENT
BEGIN:VEVENT
UID:out-of-window
DTSTART;VALUE=DATE:20270101
SUMMARY:Far away
END:VEVENT
END:VCALENDAR`;

describe("parseIcs", () => {
  const r = parseIcs(ICS, "2026-01-01", "2026-01-31", "America/New_York");

  it("reads the calendar name and events within the window", () => {
    expect(r.calendarName).toBe("Home");
    expect(r.events.find((e) => e.title === "Far away")).toBeUndefined();
  });

  it("converts timed events to the user's local day", () => {
    expect(r.events.find((e) => e.uid === "dinner-1")!.date).toBe("2026-01-10");
    // 04:00Z on the 11th is 11pm on the 10th in New York.
    expect(r.events.find((e) => e.uid === "late-1")!.date).toBe("2026-01-10");
    const la = parseIcs(ICS, "2026-01-01", "2026-01-31", "Asia/Tokyo");
    expect(la.events.find((e) => e.uid === "late-1")!.date).toBe("2026-01-11");
  });

  it("keeps all-day dates as-is", () => {
    const e = r.events.find((x) => x.uid === "allday-1")!;
    expect(e).toMatchObject({ date: "2026-01-15", allDay: true });
  });

  it("expands recurrences and applies exceptions", () => {
    const yoga = r.events.filter((e) => e.title === "Yoga class");
    expect(yoga.map((e) => e.date)).toEqual(["2026-01-05", "2026-01-12", "2026-01-19", "2026-01-26"]);
    expect(yoga.find((e) => e.date === "2026-01-12")!.cancelled).toBe(true);
    expect(new Set(yoga.map((e) => e.uid)).size).toBe(4);
  });

  it("throws on garbage instead of returning an empty list", () => {
    expect(() => parseIcs("<html>login page</html>", "2026-01-01", "2026-01-31", "UTC")).toThrow();
  });
});

describe("estimateEventCost", () => {
  it("normalizes titles", () => {
    expect(normalizeTitle("Dinner w/ Sam @ 7pm!")).toBe("dinner sam");
  });

  it("prefers the user's correction, then similar corrections", () => {
    const corrections = [{ matchKey: "dinner sam", estimateCents: 9_000 }];
    expect(estimateEventCost("Dinner with Sam", corrections)).toMatchObject({ cents: 9_000, source: "your_correction" });
    expect(estimateEventCost("Sam dinner downtown", corrections).source).toBe("similar_correction");
  });

  it("remembers 'not a spending event'", () => {
    expect(estimateEventCost("Team offsite", [{ matchKey: "team offsite", notSpending: true }])).toMatchObject({
      cents: 0,
      source: "not_spending",
    });
  });

  it("uses history, then typical costs, and asks when unknown", () => {
    expect(estimateEventCost("Dinner at Luca", [], { Dining: 4_500 })).toMatchObject({ cents: 4_500, source: "your_history" });
    expect(estimateEventCost("Concert", [])).toMatchObject({ cents: 8_000, source: "typical" });
    expect(estimateEventCost("Weekly sync", [])).toMatchObject({ cents: 0, source: "not_spending" });
    expect(estimateEventCost("Zxqv", [])).toMatchObject({ cents: 0, needsInput: true });
  });
});

describe("findDuplicates", () => {
  it("matches the same event across calendars", () => {
    const m = findDuplicates([
      { id: "a", title: "Dinner with Sam", date: "2026-01-10", sourceId: "home" },
      { id: "b", title: "Dinner w/ Sam", date: "2026-01-10", sourceId: "shared" },
      { id: "c", title: "Dinner with Sam", date: "2026-01-17", sourceId: "home" },
      { id: "d", title: "Sarah's birthday", date: "2026-01-10", sourceId: "home" },
    ]);
    expect(m).toEqual([{ id: "b", duplicateOf: "a", reason: "Same title on the same day" }]);
  });

  it("catches one-day drift across calendars only for identical titles", () => {
    const m = findDuplicates([
      { id: "a", title: "Concert", date: "2026-01-10", sourceId: "x" },
      { id: "b", title: "Concert", date: "2026-01-11", sourceId: "y" },
    ]);
    expect(m).toHaveLength(1);
  });

  it("respects the user's 'not a duplicate' answer and prefers corrected events", () => {
    const events = [
      { id: "a", title: "Brunch", date: "2026-01-10", sourceId: "x" },
      { id: "b", title: "Brunch", date: "2026-01-10", sourceId: "y", userCorrected: true },
    ];
    expect(findDuplicates(events)).toEqual([{ id: "a", duplicateOf: "b", reason: "Same title on the same day" }]);
    expect(findDuplicates(events, [["a", "b"]])).toEqual([]);
  });
});

describe("calendarCoverage", () => {
  const now = new Date("2026-01-10T12:00:00Z");
  const ok = { id: "1", name: "Home", enabled: true, lastStatus: "ok" as const, lastSyncedAt: "2026-01-10T10:00:00Z", lastAttemptAt: null, lastError: null, eventCount: 5 };

  it("no calendars is not the same as no plans", () => {
    expect(calendarCoverage([], now)).toMatchObject({ status: "none", incomplete: true });
  });

  it("failed, stale and suspiciously empty syncs are incomplete", () => {
    expect(calendarCoverage([{ ...ok, lastStatus: "error", lastError: "timeout" }], now).incomplete).toBe(true);
    expect(calendarCoverage([{ ...ok, lastSyncedAt: "2026-01-08T00:00:00Z" }], now).incomplete).toBe(true);
    expect(calendarCoverage([{ ...ok, lastStatus: "empty_suspicious" }], now).incomplete).toBe(true);
  });

  it("fresh successful syncs are complete", () => {
    expect(calendarCoverage([ok], now)).toMatchObject({ status: "complete", incomplete: false });
  });
});

import { isPrivateAddress } from "./net-guard";
describe("isPrivateAddress (SSRF guard)", () => {
  it("blocks private, loopback and link-local addresses", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1"]) {
      expect(isPrivateAddress(ip)).toBe(true);
    }
  });
  it("allows public addresses", () => {
    for (const ip of ["8.8.8.8", "142.250.72.14", "2607:f8b0:4005:80b::200e"]) expect(isPrivateAddress(ip)).toBe(false);
  });
});
