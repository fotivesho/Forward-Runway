import type { ISODate } from "../dates";
import type { Cents } from "../money";
import { avgDailyCardSpend, spendingBaseline } from "./spending";
import type { EngineInput, Forecast } from "./types";

/** How everyday purchases are paid: each card's share (the rest is debit, leaving cash that day). */
export function everydayPaySplit(input: EngineInput): Array<{ accountId: string; share: number }> {
  const pref = input.everydayPay ?? "auto";
  const cards = input.accounts.filter((a) => a.kind === "credit_card" && !a.archived);
  if (pref === "debit") return [];
  const chosen = cards.find((c) => c.id === pref);
  if (chosen) return [{ accountId: chosen.id, share: 1 }];
  // Auto: from your history, how much of your everyday spending goes on each card.
  const total = spendingBaseline(input).avgDailyCents;
  if (total <= 0) return [];
  const split = cards.map((c) => ({ accountId: c.id, share: Math.min(1, avgDailyCardSpend(input, c.id) / total) })).filter((x) => x.share > 0.02);
  const sum = split.reduce((t, x) => t + x.share, 0);
  return sum > 1 ? split.map((x) => ({ ...x, share: x.share / sum })) : split;
}

/**
 * When everyday spending, and your calendar plans, actually leave your cash. Debit purchases leave the same day; card purchases
 * leave on the due date of the statement they land on (beyond the forecast, they don't leave within it).
 * Returns the running total taken out of cash by each forecast day, and how much lands on each statement.
 */
export function everydayCash(input: EngineInput, f: Forecast, perDay: (d: ISODate) => Cents): { cumulative: Cents[]; plansCumulative: Cents[]; onStatement: Map<string, Cents>; plansOnStatement: Map<string, Cents> } {
  const split = everydayPaySplit(input);
  const cardShare = split.reduce((t, x) => t + x.share, 0);
  const index = new Map(f.days.map((d, i) => [d.date, i]));
  const out = new Array<number>(f.days.length).fill(0);
  const onStatement = new Map<string, Cents>();
  for (const [i, d] of f.days.entries()) {
    const amt = perDay(d.date);
    if (!amt) continue;
    out[i]! += amt * (1 - cardShare);
    for (const x of split) {
      const st = f.cards.find((c) => c.accountId === x.accountId)?.statements.find((s) => s.closingDate >= d.date);
      if (!st) continue;
      const part = amt * x.share;
      const key = `${x.accountId}|${st.dueDate}`;
      onStatement.set(key, (onStatement.get(key) ?? 0) + part);
      const j = index.get(st.dueDate);
      if (j != null) out[j]! += part;
    }
  }
  // Plans: on their date if paid from cash; on the card's due date if they go on a card
  // (their own card, or the way you usually pay).
  const plansOut = new Array<number>(f.days.length).fill(0);
  const plansOnStatement = new Map<string, Cents>();
  const toCard = (accountId: string, date: ISODate, cents: number, into: number[]) => {
    const st = f.cards.find((c) => c.accountId === accountId)?.statements.find((x) => x.closingDate >= date);
    if (!st) return;
    const key = `${accountId}|${st.dueDate}`;
    plansOnStatement.set(key, (plansOnStatement.get(key) ?? 0) + cents);
    const j = index.get(st.dueDate);
    if (j != null) into[j]! += cents;
  };
  for (const p of input.plans ?? []) {
    const i = index.get(p.date);
    if (i == null) continue;
    const own = p.paymentAccountId ? input.accounts.find((a) => a.id === p.paymentAccountId) : undefined;
    if (own?.kind === "credit_card") toCard(own.id, p.date, p.cents, plansOut);
    else if (own) plansOut[i]! += p.cents;
    else {
      plansOut[i]! += p.cents * (1 - cardShare);
      for (const x of split) toCard(x.accountId, p.date, p.cents * x.share, plansOut);
    }
  }
  let run = 0;
  let runPlans = 0;
  return {
    cumulative: out.map((v, k) => Math.round((run += v + plansOut[k]!))),
    plansCumulative: plansOut.map((v) => Math.round((runPlans += v))),
    onStatement,
    plansOnStatement,
  };
}
