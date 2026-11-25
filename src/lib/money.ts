/**
 * Money is always an integer number of US cents. Never floats.
 */

export type Cents = number;

export function assertCents(value: number, label = "amount"): Cents {
  if (!Number.isSafeInteger(value)) throw new Error(`${label} must be a whole number of cents`);
  return value;
}

/**
 * Parse user input like "1,234.56", "$12", "-3.5", "(40.00)" into cents.
 * Returns null for anything that is not an unambiguous dollar amount
 * (more than two decimal places, letters, empty, etc.).
 */
export function parseDollars(input: string): Cents | null {
  let s = input.trim();
  if (!s) return null;
  let negative = false;
  if (s.startsWith("(") && s.endsWith(")")) {
    negative = true;
    s = s.slice(1, -1).trim();
  }
  if (s.startsWith("-")) {
    negative = !negative;
    s = s.slice(1).trim();
  }
  s = s.replace(/^\$/, "").replace(/,/g, "").trim();
  if (!/^\d+(\.\d{0,2})?$/.test(s) && !/^\.\d{1,2}$/.test(s)) return null;
  const [whole = "0", frac = ""] = s.split(".");
  const cents = Number(whole || "0") * 100 + Number((frac + "00").slice(0, 2));
  if (!Number.isSafeInteger(cents)) return null;
  return negative ? -cents : cents;
}

export function formatCents(cents: Cents, opts: { sign?: boolean; compact?: boolean } = {}): string {
  const negative = cents < 0;
  const abs = Math.abs(cents);
  let body: string;
  if (opts.compact && abs >= 100_000) {
    const dollars = abs / 100;
    body = dollars >= 1_000_000 ? `${(dollars / 1_000_000).toFixed(1)}M` : `${(dollars / 1000).toFixed(dollars >= 10_000 ? 0 : 1)}k`;
    body = `$${body}`;
  } else {
    const whole = Math.floor(abs / 100);
    const frac = String(abs % 100).padStart(2, "0");
    body = `$${whole.toLocaleString("en-US")}.${frac}`;
  }
  if (negative) return `−${body}`;
  if (opts.sign && cents > 0) return `+${body}`;
  return body;
}

/** Cents → "1234.56" for form inputs */
export function centsToInput(cents: Cents | null | undefined): string {
  if (cents == null) return "";
  const negative = cents < 0;
  const abs = Math.abs(cents);
  return `${negative ? "-" : ""}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

export function sum(values: Cents[]): Cents {
  let total = 0;
  for (const v of values) total += v;
  return total;
}

/**
 * Split `total` cents into parts proportional to `weights`, using the
 * largest-remainder method so the parts always add back to exactly `total`.
 */
export function allocate(total: Cents, weights: number[]): Cents[] {
  if (weights.length === 0) return [];
  const sumW = weights.reduce((a, b) => a + Math.max(0, b), 0);
  const safe = sumW > 0 ? weights.map((w) => Math.max(0, w)) : weights.map(() => 1);
  const denom = sumW > 0 ? sumW : weights.length;
  const sign = total < 0 ? -1 : 1;
  const abs = Math.abs(total);
  const raw = safe.map((w) => (abs * w) / denom);
  const floors = raw.map(Math.floor);
  let remainder = abs - floors.reduce((a, b) => a + b, 0);
  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (let k = 0; remainder > 0; k = (k + 1) % order.length) {
    floors[order[k]!.i]! += 1;
    remainder -= 1;
  }
  return floors.map((f) => f * sign);
}

/** Round up to a "friendly" cap: nearest $5 under $100, nearest $10 above. */
export function friendlyRoundUp(cents: Cents): Cents {
  if (cents <= 0) return 0;
  const step = cents < 10_000 ? 500 : 1_000;
  return Math.ceil(cents / step) * step;
}

export function friendlyRoundDown(cents: Cents): Cents {
  if (cents <= 0) return 0;
  const step = cents < 10_000 ? 500 : 1_000;
  return Math.floor(cents / step) * step;
}
