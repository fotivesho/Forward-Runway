/**
 * Date-only local calendar arithmetic.
 *
 * Every date in Runway Tomorrow is a plain calendar day written "YYYY-MM-DD".
 * There are no times and no time zones inside the engine: a bill due on the
 * 31st is due on the 31st wherever the user is. Internally we convert to a
 * day number (days since 1970-01-01, computed with UTC math so DST never
 * shifts a day) and back.
 */

export type ISODate = string; // "YYYY-MM-DD"

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isISODate(value: unknown): value is ISODate {
  if (typeof value !== "string") return false;
  const m = ISO_RE.exec(value);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  return mo >= 1 && mo <= 12 && d >= 1 && d <= daysInMonth(y, mo);
}

export function parts(date: ISODate): { y: number; m: number; d: number } {
  const match = ISO_RE.exec(date);
  if (!match) throw new Error(`Invalid date: ${date}`);
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
}

export function make(y: number, m: number, d: number): ISODate {
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

/** m is 1-12 */
export function daysInMonth(y: number, m: number): number {
  return [31, isLeapYear(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]!;
}

const MS_PER_DAY = 86_400_000;

export function toDayNumber(date: ISODate): number {
  const { y, m, d } = parts(date);
  return Math.round(Date.UTC(y, m - 1, d) / MS_PER_DAY);
}

export function fromDayNumber(n: number): ISODate {
  const dt = new Date(n * MS_PER_DAY);
  return make(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

export function addDays(date: ISODate, days: number): ISODate {
  return fromDayNumber(toDayNumber(date) + days);
}

/** b - a in whole days */
export function diffDays(a: ISODate, b: ISODate): number {
  return toDayNumber(b) - toDayNumber(a);
}

export function compare(a: ISODate, b: ISODate): number {
  return a < b ? -1 : a > b ? 1 : 0; // ISO strings sort lexically
}

export function minDate(a: ISODate, b: ISODate): ISODate {
  return a <= b ? a : b;
}

export function maxDate(a: ISODate, b: ISODate): ISODate {
  return a >= b ? a : b;
}

/** 0 = Sunday ... 6 = Saturday */
export function dayOfWeek(date: ISODate): number {
  // 1970-01-01 was a Thursday (4)
  return (((toDayNumber(date) + 4) % 7) + 7) % 7;
}

/**
 * Day `day` of the given month, clamped to the month's last day.
 * day = -1 (or anything >= 31 in a short month) means "last day of month".
 */
export function clampedDay(y: number, m: number, day: number): ISODate {
  const last = daysInMonth(y, m);
  const d = day <= 0 ? last : Math.min(day, last);
  return make(y, m, d);
}

/** Add calendar months; the day is clamped to the target month's end (Jan 31 + 1 month = Feb 28/29). */
export function addMonths(date: ISODate, months: number): ISODate {
  const { y, m, d } = parts(date);
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return clampedDay(ny, nm, d);
}

export function startOfMonth(date: ISODate): ISODate {
  const { y, m } = parts(date);
  return make(y, m, 1);
}

export function endOfMonth(date: ISODate): ISODate {
  const { y, m } = parts(date);
  return make(y, m, daysInMonth(y, m));
}

export function eachDay(from: ISODate, to: ISODate): ISODate[] {
  const out: ISODate[] = [];
  const end = toDayNumber(to);
  for (let n = toDayNumber(from); n <= end; n++) out.push(fromDayNumber(n));
  return out;
}

export function isWeekend(date: ISODate): boolean {
  const dow = dayOfWeek(date);
  return dow === 0 || dow === 6;
}

export type WeekendAdjust = "none" | "before" | "after";

/** Move a date that lands on Sat/Sun to the previous Friday ("before") or next Monday ("after"). */
export function adjustForWeekend(date: ISODate, mode: WeekendAdjust): ISODate {
  if (mode === "none") return date;
  const dow = dayOfWeek(date);
  if (dow === 6) return addDays(date, mode === "before" ? -1 : 2);
  if (dow === 0) return addDays(date, mode === "before" ? -2 : 1);
  return date;
}

/** Today's calendar date in an IANA time zone (falls back to UTC on bad input). */
export function todayInZone(timeZone: string, now: Date = new Date()): ISODate {
  try {
    const fmt = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
    return fmt.format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function formatShort(date: ISODate): string {
  const { m, d } = parts(date);
  return `${MONTHS[m - 1]} ${d}`;
}

export function formatLong(date: ISODate): string {
  const { y, m, d } = parts(date);
  return `${DOW[dayOfWeek(date)]}, ${MONTHS[m - 1]} ${d}, ${y}`;
}

export function formatWeekday(date: ISODate): string {
  return DOW[dayOfWeek(date)]!;
}
