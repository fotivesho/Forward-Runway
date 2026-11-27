/**
 * How your plans actually went: each finished plan matched to the real charge, planned vs actual,
 * and per kind of plan how close the estimates run. That error feeds back into new estimates, so
 * every finished plan makes the next one sharper. Pure and deterministic.
 */
import { addDays, diffDays, type ISODate } from "../dates";
import type { Cents } from "../money";
import { isNotSpending } from "../categories";
import type { Snapshot } from "../data/snapshot";
import { readTitle } from "./estimate";

export interface PlanResult {
  eventId: string;
  title: string;
  date: ISODate;
  category: string;
  plannedCents: Cents;
  /** The charge it was matched to, or null if none was found. */
  actual: { cents: Cents; description: string; date: ISODate; txnId: string } | null;
  /** You confirmed the match ("That's it"). */
  confirmed?: boolean;
  /** actual − planned (negative = under plan). */
  diffCents: Cents | null;
}

export interface Accuracy {
  category: string;
  plans: number;
  /** Average |actual − planned| / planned. */
  withinPct: number;
  /** Median actual / planned: 1.06 = plans usually run 6% over. */
  bias: number;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
const STOP = new Set(["with", "and", "the", "for", "dinner", "lunch", "night", "trip", "plan", "party"]);

export function planResults(s: Snapshot, today: ISODate, days = 60): PlanResult[] {
  const from = addDays(today, -days);
  const used = new Set<string>();
  const out: PlanResult[] = [];
  const events = s.calendarEvents
    .filter((e) => !e.cancelled && !e.duplicateOf && e.decision !== "skip" && e.date >= from && e.date < today)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  // Your answers to "How did it go?": a confirmed match, or a charge that wasn't it.
  const checks = new Map<string, { ok?: boolean; txnId?: string }>();
  for (const c of s.corrections) if (c.kind === "preference" && c.matchKey.startsWith("plan_check:")) checks.set(c.matchKey.slice(11), c.value as { ok?: boolean; txnId?: string });
  for (const e of events) {
    const planned = e.capCents ?? e.estimateCents;
    const check = checks.get(e.id);
    if (check?.ok === false && !check.txnId) continue; // "Didn't spend": nothing to learn from.
    if (!planned || planned <= 0 || e.estimateSource === "not_spending") continue;
    const category = e.category ?? readTitle(e.title).category;
    const words = norm(`${e.title} ${e.location ?? ""}`).split(" ").filter((w) => w.length > 3 && !STOP.has(w));
    let best: { id: string; score: number; cents: Cents; description: string; date: ISODate } | null = null;
    for (const t of s.transactions) {
      if (check?.ok === false && check.txnId === t.id) continue;
      if (check?.ok === true && check.txnId && check.txnId !== t.id) continue;
      if (used.has(t.id) || t.status !== "posted" || t.direction !== "out" || isNotSpending(t.category)) continue;
      const gap = diffDays(e.date, t.date);
      if (gap < -1 || gap > 2) continue;
      const ratio = t.amountCents / planned;
      if (ratio < 0.4 || ratio > 2.5) continue;
      const nameHit = words.some((w) => norm(t.description).includes(w));
      const catHit = (t.category ?? "") === category;
      if (!nameHit && !catHit) continue;
      const score = (nameHit ? 3 : 0) + (catHit ? 2 : 0) + (gap === 0 ? 1 : 0) - Math.abs(Math.log(ratio));
      if (!best || score > best.score) best = { id: t.id, score, cents: t.amountCents, description: t.description, date: t.date };
    }
    if (best) used.add(best.id);
    out.push({
      eventId: e.id,
      title: e.title,
      date: e.date,
      category,
      plannedCents: planned,
      actual: best && { cents: best.cents, description: best.description, date: best.date, txnId: best.id },
      confirmed: check?.ok === true,
      diffCents: best ? best.cents - planned : null,
    });
  }
  return out.reverse();
}

export function accuracy(results: PlanResult[]): Accuracy[] {
  const by = new Map<string, PlanResult[]>();
  for (const r of results) if (r.actual) by.set(r.category, [...(by.get(r.category) ?? []), r]);
  return [...by.entries()]
    .map(([category, rs]) => {
      const ratios = rs.map((r) => r.actual!.cents / r.plannedCents).sort((a, b) => a - b);
      return {
        category,
        plans: rs.length,
        withinPct: rs.reduce((a, r) => a + Math.abs(r.diffCents!) / r.plannedCents, 0) / rs.length,
        bias: ratios[Math.floor(ratios.length / 2)]!,
      };
    })
    .sort((a, b) => b.plans - a.plans);
}

/** How much to adjust new estimates per kind of plan (only once there are 2+ finished plans). */
export function biasByCategory(s: Snapshot, today: ISODate): Record<string, number> {
  const out: Record<string, number> = {};
  for (const a of accuracy(planResults(s, today))) if (a.plans >= 2 && Math.abs(a.bias - 1) >= 0.03) out[a.category] = Math.min(1.5, Math.max(0.67, a.bias));
  return out;
}
