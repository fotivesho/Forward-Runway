import { addDays, diffDays, type ISODate } from "@/lib/dates";
import { ruleOccurrences, type OccurrenceOverride, type OneTimeTransaction, type RecurringRule } from "@/lib/engine";
import { cleanName } from "@/lib/view/recurring";

const sameName = (a: string, b: string) => {
  const ka = cleanName(a);
  const kb = cleanName(b);
  return ka && kb ? ka === kb || ka.startsWith(kb) || kb.startsWith(ka) : a.trim().toLowerCase() === b.trim().toLowerCase();
};

/** Does this charge look like that repeating item? Same name (any amount within half to double), or same category at nearly the same amount. */
export function looksLike(rule: RecurringRule, t: OneTimeTransaction): boolean {
  if (t.accountId !== rule.accountId) return false;
  if (t.direction !== (rule.kind === "income" ? "in" : "out")) return false;
  const ratio = t.amountCents / Math.max(1, rule.amountCents);
  if (sameName(t.description, rule.name)) return ratio >= 0.5 && ratio <= 2;
  // Paychecks rarely arrive under the name you gave them ("ACME PAYROLL" for "Paycheck"): the same amount into the same account is enough.
  if (rule.kind === "income") return Math.abs(ratio - 1) <= 0.03;
  return !!rule.category && t.category === rule.category && Math.abs(ratio - 1) <= 0.15;
}

/**
 * When the real charge for a repeating item shows up (from your bank, or logged by hand), that
 * date counts as done, even if the amount differs a little, so it isn't counted twice: once in
 * the balance and again as still coming. Returns "posted" marks for those dates, at the real amount.
 */
export function autoPosted(rules: RecurringRule[], transactions: OneTimeTransaction[], overrides: OccurrenceOverride[], today: ISODate): OccurrenceOverride[] {
  const used = new Set<string>();
  const out: OccurrenceOverride[] = [];
  for (const rule of rules) {
    if (rule.active === false || rule.toAccountId) continue;
    const candidates = transactions.filter((t) => t.date <= addDays(today, 1) && t.date >= addDays(today, -60) && looksLike(rule, t));
    if (candidates.length === 0) continue;
    for (const o of ruleOccurrences(rule, overrides, addDays(today, -45), addDays(today, 10))) {
      if (o.posted || o.overridden) continue;
      const hit = candidates
        .filter((t) => !used.has(t.id) && diffDays(o.date, t.date) >= -6 && diffDays(o.date, t.date) <= 3)
        .sort((a, b) => Math.abs(diffDays(o.date, a.date)) - Math.abs(diffDays(o.date, b.date)))[0];
      if (!hit) continue;
      used.add(hit.id);
      out.push({ id: `auto:${rule.id}:${o.originalDate}`, ruleId: rule.id, originalDate: o.originalDate, action: "posted", amountCents: hit.amountCents, note: `Matched “${hit.description}” on ${hit.date}` });
    }
  }
  return out;
}
