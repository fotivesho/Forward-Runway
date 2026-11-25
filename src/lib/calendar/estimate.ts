import type { Cents } from "../money";

/** Lowercase, strip punctuation, digits and filler so "Dinner w/ Sam 7pm!" ≈ "dinner with sam". */
export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/\bw\//g, "with ")
    .replace(/&/g, " and ")
    .replace(/\d{1,2}(:\d{2})?\s*(am|pm)\b/g, " ")
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP.has(w))
    .join(" ")
    .trim();
}

const STOP = new Set(["the", "a", "an", "at", "on", "in", "with", "and", "of", "for", "to", "my", "our", "re", "fwd", "tbd", "tentative"]);

export function tokens(title: string): Set<string> {
  return new Set(normalizeTitle(title).split(" ").filter(Boolean));
}

export function similarity(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / (ta.size + tb.size - inter);
}

export type EstimateSource = "your_correction" | "similar_correction" | "your_history" | "typical" | "not_spending" | "unknown";

export interface CostEstimate {
  cents: Cents;
  source: EstimateSource;
  category: string | null;
  /** Human-readable explanation of where the number came from. */
  basis: string;
  /** True when we have no basis and should ask the user. */
  needsInput: boolean;
}

export interface Correction {
  /** Normalized title the correction applies to. */
  matchKey: string;
  estimateCents?: Cents | null;
  capCents?: Cents | null;
  notSpending?: boolean;
  category?: string | null;
}

interface Rule {
  re: RegExp;
  category: string;
  cents: Cents;
}

/** Typical-cost table: deliberately conservative US defaults, always labelled as estimates. */
const TYPICAL: Rule[] = [
  { re: /\b(standup|stand up|sync|meeting|call|interview|review|deadline|focus|1 1|one on one|webinar|ooo|out of office|reminder|work|office hours|zoom|teams)\b/, category: "Not spending", cents: 0 },
  { re: /\b(bachelor|bachelorette)\b/, category: "Celebrations", cents: 30_000 },
  { re: /\bwedding\b/, category: "Celebrations", cents: 20_000 },
  { re: /\b(flight|vacation|trip|hotel|airbnb|getaway)\b/, category: "Travel", cents: 35_000 },
  { re: /\b(concert|tickets|festival|game|match|show|theater|theatre|comedy)\b/, category: "Entertainment", cents: 8_000 },
  { re: /\b(shower)\b/, category: "Gifts", cents: 6_000 },
  { re: /\b(birthday|bday|party|anniversary)\b/, category: "Gifts", cents: 5_000 },
  { re: /\b(dinner|restaurant|date night|tasting)\b/, category: "Dining", cents: 6_000 },
  { re: /\b(brunch)\b/, category: "Dining", cents: 4_000 },
  { re: /\b(drinks|bar|happy hour|pub|wine)\b/, category: "Dining", cents: 4_000 },
  { re: /\b(lunch)\b/, category: "Dining", cents: 2_000 },
  { re: /\b(coffee|cafe)\b/, category: "Dining", cents: 800 },
  { re: /\b(movie|movies|cinema)\b/, category: "Entertainment", cents: 2_500 },
  { re: /\b(haircut|barber|salon)\b/, category: "Personal care", cents: 4_500 },
  { re: /\b(nails|manicure|spa|massage|facial)\b/, category: "Personal care", cents: 7_000 },
  { re: /\b(dentist|doctor|dr|appointment|checkup|clinic|therapy)\b/, category: "Health", cents: 4_000 },
  { re: /\b(gym|yoga|pilates|class|spin)\b/, category: "Fitness", cents: 2_500 },
  { re: /\b(groceries|grocery|costco|target|walmart|shopping|mall)\b/, category: "Shopping", cents: 8_000 },
  { re: /\b(oil change|car wash|tires|mechanic|car service)\b/, category: "Car", cents: 8_000 },
  { re: /\b(vet|grooming)\b/, category: "Pets", cents: 9_000 },
];

/**
 * Estimate what a calendar event will cost, preferring (in order) the user's
 * own correction for this title, a correction for a very similar title, the
 * user's average for the matching category, and a typical-cost default.
 * Unknown events get $0 with needsInput=true: we ask, we don't invent.
 */
export function estimateEventCost(
  title: string,
  corrections: Correction[],
  categoryAverages: Record<string, Cents> = {},
): CostEstimate {
  const key = normalizeTitle(title);
  const exact = corrections.find((c) => c.matchKey === key);
  if (exact) return fromCorrection(exact, "your_correction", "Your earlier correction for this event");
  let best: { c: Correction; s: number } | null = null;
  for (const c of corrections) {
    const s = similarity(c.matchKey, key);
    if (s >= 0.6 && (!best || s > best.s)) best = { c, s };
  }
  if (best) return fromCorrection(best.c, "similar_correction", `Based on your correction for "${best.c.matchKey}"`);

  const rule = TYPICAL.find((r) => r.re.test(key));
  if (rule) {
    if (rule.cents === 0) {
      return { cents: 0, source: "not_spending", category: null, basis: "Looks like a work or non-spending event", needsInput: false };
    }
    const avg = categoryAverages[rule.category];
    if (avg && avg > 0) {
      return { cents: avg, source: "your_history", category: rule.category, basis: `Your average ${rule.category.toLowerCase()} spend`, needsInput: false };
    }
    return { cents: rule.cents, source: "typical", category: rule.category, basis: `Typical ${rule.category.toLowerCase()} cost (estimate)`, needsInput: false };
  }
  return { cents: 0, source: "unknown", category: null, basis: "No basis for an estimate yet", needsInput: true };
}

function fromCorrection(c: Correction, source: EstimateSource, basis: string): CostEstimate {
  if (c.notSpending) return { cents: 0, source: "not_spending", category: null, basis: "You marked this as not a spending event", needsInput: false };
  return { cents: c.estimateCents ?? 0, source, category: c.category ?? null, basis, needsInput: c.estimateCents == null };
}
