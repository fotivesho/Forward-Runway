import ICAL from "ical.js";
import { todayInZone, type ISODate } from "../dates";

export interface ParsedEvent {
  uid: string;
  /** Occurrence date (local calendar day in the user's time zone). Together with uid identifies an occurrence. */
  date: ISODate;
  title: string;
  location: string | null;
  allDay: boolean;
  cancelled: boolean;
}

export interface ParseResult {
  calendarName: string | null;
  events: ParsedEvent[];
  /** Number of VEVENTs in the file (before window filtering). */
  totalComponents: number;
  warnings: string[];
}

const MAX_OCCURRENCES_PER_EVENT = 400;

/**
 * Parse an iCalendar (.ics) document and expand events (including RRULE
 * recurrences) that fall within [from, to], converted to the user's local
 * calendar day. Throws on unparseable input so callers can record the
 * failure instead of treating it as "no plans".
 */
export function parseIcs(text: string, from: ISODate, to: ISODate, timeZone: string): ParseResult {
  if (!/BEGIN:VCALENDAR/i.test(text)) throw new Error("Not an iCalendar file (missing BEGIN:VCALENDAR).");
  const jcal = ICAL.parse(text);
  const root = new ICAL.Component(jcal);
  const warnings: string[] = [];

  for (const tz of root.getAllSubcomponents("vtimezone")) {
    try {
      ICAL.TimezoneService.register(tz);
    } catch {
      warnings.push("A time zone definition could not be read; some times may be off by a day.");
    }
  }

  const calendarName = (root.getFirstPropertyValue("x-wr-calname") as string | null) ?? null;
  const vevents = root.getAllSubcomponents("vevent");
  const out: ParsedEvent[] = [];
  // Exceptions (RECURRENCE-ID) override individual occurrences of their master event.
  const exceptions = new Map<string, ICAL.Component[]>();
  const masters: ICAL.Component[] = [];
  for (const v of vevents) {
    if (v.hasProperty("recurrence-id")) {
      const uid = String(v.getFirstPropertyValue("uid") ?? "");
      exceptions.set(uid, [...(exceptions.get(uid) ?? []), v]);
    } else masters.push(v);
  }

  const toLocalDate = (t: ICAL.Time): ISODate => {
    if (t.isDate) return `${t.year}-${String(t.month).padStart(2, "0")}-${String(t.day).padStart(2, "0")}`;
    return todayInZone(timeZone, t.toJSDate());
  };

  for (const v of masters) {
    let event: ICAL.Event;
    try {
      event = new ICAL.Event(v, { strictExceptions: false });
      for (const ex of exceptions.get(event.uid) ?? []) event.relateException(ex);
    } catch {
      warnings.push("Skipped an event that couldn't be read.");
      continue;
    }
    const title = (event.summary || "Untitled event").trim();
    const location = event.location ? String(event.location) : null;
    const status = String(v.getFirstPropertyValue("status") ?? "").toUpperCase();
    const uid = event.uid || `${title}-${event.startDate?.toString()}`;
    if (!event.startDate) continue;

    if (event.isRecurring()) {
      const it = event.iterator();
      let next: ICAL.Time | null;
      let n = 0;
      while ((next = it.next()) && n < MAX_OCCURRENCES_PER_EVENT) {
        n++;
        const details = event.getOccurrenceDetails(next);
        const date = toLocalDate(details.startDate);
        if (date > to) break;
        if (date < from) continue;
        const occStatus = String(details.item.component.getFirstPropertyValue("status") ?? status).toUpperCase();
        out.push({
          uid: `${uid}::${toLocalDate(details.recurrenceId)}`,
          date,
          title: (details.item.summary || title).trim(),
          location: details.item.location ? String(details.item.location) : location,
          allDay: details.startDate.isDate,
          cancelled: occStatus === "CANCELLED",
        });
      }
      if (n >= MAX_OCCURRENCES_PER_EVENT) warnings.push(`"${title}" repeats very often; only the first ${MAX_OCCURRENCES_PER_EVENT} were read.`);
    } else {
      const date = toLocalDate(event.startDate);
      if (date < from || date > to) continue;
      out.push({ uid, date, title, location, allDay: event.startDate.isDate, cancelled: status === "CANCELLED" });
    }
  }
  out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.title.localeCompare(b.title)));
  return { calendarName, events: out, totalComponents: vevents.length, warnings };
}
