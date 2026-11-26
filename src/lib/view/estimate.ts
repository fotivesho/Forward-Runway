/**
 * Smart estimates: what a plan will realistically cost, with a range, the reasons, and how sure we
 * are. Phase 1 uses only what the app already knows: your own history (by kind of plan and by
 * place), words in the plan's title ("with Sam", "for 4", "at Lucia's"), the number of people, and
 * tax and tip where they apply. Built so a smarter reader (AI, later and opt-in) can fill the same
 * `PlanFacts` from a sentence, and everything downstream stays the same.
 */
import type { Cents } from "../money";
import type { ExploreData, Txn } from "./explore";

export interface PlanFacts {
  /** "Dining", "Travel", … (see KINDS). */
  category: string;
  people: number;
  /** A place or venue, if we know one ("Lucia's"). */
  place?: string | null;
  /** Nights away, for trips. */
  nights?: number | null;
}

export type Confidence = "high" | "medium" | "starter";

export interface Estimate {
  cents: Cents;
  low: Cents;
  high: Cents;
  perPersonCents: Cents;
  people: number;
  confidence: Confidence;
  /** One short line each, in plain words, for "How we estimated". */
  reasons: string[];
  /** How many past purchases it's based on (0 = typical amounts). */
  basedOn: number;
  /** Suggestions to tap: usual, nicer, treat (already for this many people). */
  options: Array<{ label: string; cents: Cents }>;
}

/** Typical per-person amounts (dollars) when there's no history: small / usual / treat. */
const TYPICAL: Record<string, [number, number, number]> = {
  Dining: [25, 40, 75],
  Entertainment: [35, 80, 150],
  Celebrations: [40, 80, 160],
  Travel: [180, 300, 550],
  Gifts: [30, 55, 120],
  Shopping: [40, 80, 180],
  "Personal care": [30, 55, 110],
  Home: [40, 120, 300],
  Health: [30, 75, 180],
  Car: [80, 250, 600],
  Coffee: [5, 7, 12],
  Other: [25, 60, 150],
};
/** Per person, the cost scales with people; for these it doesn't (it's one purchase). */
const SHARED = new Set(["Home", "Car", "Health", "Shopping", "Personal care"]);
/** Tax and tip on top of the menu price (history already includes them). */
const TAX_TIP: Record<string, number> = { Dining: 0.28 };

const round5 = (c: Cents) => Math.max(500, Math.round(c / 500) * 500);
const pct = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.round((s.length - 1) * p)))] ?? 0;
};
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

/** Words in a title that tell us what kind of plan it is. */
const KIND_WORDS: Array<[RegExp, string]> = [
  [/\b(dinner|lunch|brunch|breakfast|restaurant|drinks|bar|tapas|sushi|pizza|bbq|steak|cafe)\b/, "Dining"],
  [/\b(coffee)\b/, "Coffee"],
  [/\b(flight|flights|trip|weekend away|getaway|hotel|airbnb|vacation|travel)\b/, "Travel"],
  [/\b(concert|show|tickets?|game|movie|theat(er|re)|festival|museum|comedy)\b/, "Entertainment"],
  [/\b(birthday|wedding|shower|party|anniversary|graduation|bachelor(ette)?)\b/, "Celebrations"],
  [/\b(gift|present)\b/, "Gifts"],
  [/\b(haircut|nails|spa|massage|salon)\b/, "Personal care"],
  [/\b(dentist|doctor|physio|therapy|pharmacy)\b/, "Health"],
  [/\b(oil change|tires?|car|mechanic|service)\b/, "Car"],
];

/** "Dinner with Sam and Priya at Lucia's" → { category: Dining, people: 3, place: "lucia s" }. */
export function readTitle(title: string, fallbackCategory?: string | null): PlanFacts {
  const t = ` ${norm(title)} `;
  const category = fallbackCategory || KIND_WORDS.find(([re]) => re.test(t))?.[1] || "Other";
  let people = 1;
  const forN = t.match(/\b(?:for|party of|x)\s?(\d{1,2})\b/);
  const withPart = t.match(/\bwith ([a-z ]+?)(?: at | on | in | for |$)/);
  if (forN) people = Math.min(20, Math.max(1, Number(forN[1])));
  else if (withPart) {
    const names = withPart[1]!.split(/\band\b|,/).map((x) => x.trim()).filter(Boolean);
    const group = /\b(friends|family|team|everyone|crew|guys|girls)\b/.test(withPart[1]!);
    people = group ? 4 : 1 + Math.max(1, names.length);
  }
  const place = t.match(/\bat ([a-z0-9 ]{2,30}?)(?: on | with | for |$)/)?.[1]?.trim() ?? null;
  const nights = Number(t.match(/\b(\d)\s?nights?\b/)?.[1] ?? 0) || (/\bweekend\b/.test(t) && category === "Travel" ? 2 : null);
  return { category, people, place, nights };
}

/** The everyday spending history for one kind of plan (and one place, if we know it). */
function history(x: ExploreData | null, f: PlanFacts): { cat: Txn[]; place: Txn[] } {
  if (!x) return { cat: [], place: [] };
  const cat = x.txns.filter((t) => t.cat === f.category);
  const key = f.place ? norm(f.place).split(" ").filter((w) => w.length > 2) : [];
  const place = key.length ? x.txns.filter((t) => key.some((w) => norm(t.desc).includes(w))) : [];
  return { cat, place };
}

/**
 * `bias`: how your finished plans of this kind compared with their estimates (1.06 = they usually
 * ran 6% over). New estimates are adjusted by it.
 */
export function estimatePlan(f: PlanFacts, x: ExploreData | null, bias = 1): Estimate {
  const people = Math.max(1, Math.round(f.people || 1));
  const scales = !SHARED.has(f.category);
  const { cat, place } = history(x, f);
  const reasons: string[] = [];
  let per: Cents;
  let low: Cents;
  let high: Cents;
  let confidence: Confidence;
  let basedOn = 0;
  const typical = TYPICAL[f.category] ?? TYPICAL.Other!;

  if (place.length >= 2) {
    const a = place.map((t) => t.c);
    per = Math.round(a.reduce((s, c) => s + c, 0) / a.length);
    low = pct(a, 0.2);
    high = pct(a, 0.85);
    confidence = "high";
    basedOn = place.length;
    reasons.push(`You've been to ${titleCase(f.place!)} ${place.length}×, about $${Math.round(per / 100)} each time`);
  } else if (cat.length >= 3) {
    const a = cat.map((t) => t.c);
    per = Math.round(a.reduce((s, c) => s + c, 0) / a.length);
    low = pct(a, 0.25);
    high = pct(a, 0.8);
    confidence = cat.length >= 8 ? "high" : "medium";
    basedOn = cat.length;
    reasons.push(`Your last ${cat.length} ${f.category.toLowerCase()} purchases averaged $${Math.round(per / 100)}`);
  } else {
    per = typical[1] * 100;
    low = typical[0] * 100;
    high = typical[2] * 100;
    confidence = "starter";
    reasons.push(`No ${f.category.toLowerCase()} history yet, so this starts from typical amounts`);
    const tip = TAX_TIP[f.category];
    if (tip) {
      per = Math.round(per * (1 + tip));
      low = Math.round(low * (1 + tip));
      high = Math.round(high * (1 + tip));
      reasons.push("Tax and tip included");
    }
  }
  if (basedOn && TAX_TIP[f.category]) reasons.push("Tax and tip are already in your past totals");

  if (bias !== 1) {
    per = Math.round(per * bias);
    low = Math.round(low * bias);
    high = Math.round(high * bias);
    reasons.push(`Your ${f.category.toLowerCase()} plans usually end up ${Math.abs(Math.round((bias - 1) * 100))}% ${bias > 1 ? "over" : "under"} the estimate, so this is adjusted ${bias > 1 ? "up" : "down"}`);
  }
  const n = scales ? people : 1;
  if (scales && people > 1) reasons.push(`${people} people, so about $${Math.round(per / 100)} a person × ${people}`);
  if (f.category === "Travel" && f.nights) reasons.push(`${f.nights} night${f.nights === 1 ? "" : "s"} away`);
  const travelMult = f.category === "Travel" && f.nights ? Math.max(1, f.nights / 2) : 1;
  const cents = round5(per * n * travelMult);
  const lo = round5(low * n * travelMult);
  const hi = round5(Math.max(high, per * 1.2) * n * travelMult);
  return {
    cents,
    low: Math.min(lo, cents),
    high: Math.max(hi, cents),
    perPersonCents: per,
    people,
    confidence,
    reasons,
    basedOn,
    options: dedupe([
      { label: "Usual", cents },
      { label: "Nicer", cents: round5(Math.max(hi, cents * 1.4)) },
      { label: "Treat", cents: round5(Math.max(hi * 1.5, cents * 2)) },
    ]),
  };
}

export const CONFIDENCE_LABEL: Record<Confidence, string> = {
  high: "Based on your own spending",
  medium: "Based on a few past purchases",
  starter: "Starting from typical amounts",
};

function dedupe(xs: Array<{ label: string; cents: Cents }>) {
  return xs.filter((o, i) => i === 0 || o.cents > xs[i - 1]!.cents);
}
function titleCase(s: string) {
  return s.replace(/\b[a-z]/g, (c) => c.toUpperCase()).replace(/ S\b/, "'s");
}
