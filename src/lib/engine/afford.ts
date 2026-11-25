import { formatShort, type ISODate } from "../dates";
import { formatCents, friendlyRoundDown, type Cents } from "../money";
import { planDailySpending, type PlannedEvent } from "./advisor";
import { buildForecast } from "./forecast";
import { planPurchase, purchaseItem, type PurchasePlan } from "./purchase";
import type { EngineInput, ForecastItem } from "./types";

export type AffordVerdict = "yes" | "yes_with_plan" | "not_yet";

export interface AffordAction {
  kind: "go" | "move" | "tighten" | "wait" | "cheaper" | "none";
  title: string;
  detail: string;
}

export interface AffordCheck {
  verdict: AffordVerdict;
  headline: string;
  /** Today's safe-to-spend before and after following the suggested move. */
  safeToday: { before: Cents; after: Cents };
  lowest: { before: { cents: Cents; date: ISODate }; after: { cents: Cents; date: ISODate } };
  action: AffordAction;
  alternatives: AffordAction[];
  /**
   * When the money actually leaves your cash. Paid by card, that's the statement due date,
   * not the purchase date (the 90-day forecast already includes that payment).
   */
  cash: { date: ISODate; viaCard: string | null; statementCloses: ISODate | null; beyondHorizon: boolean };
  plan: PurchasePlan;
}

export interface AffordContext {
  input: EngineInput;
  events: PlannedEvent[];
  calendarIncomplete: boolean;
  nextPayday: ISODate | null;
}

export interface AffordRequest {
  amountCents: Cents;
  date: ISODate;
  paymentAccountId?: string | null;
  /**
   * Checking one of the user's own calendar plans: the amount its cap already sets aside in the
   * daily caps. Only spending above it is new money (so the plan is never counted twice).
   */
  reservedCents?: Cents | null;
}

/** A purchase is a plain "yes" while today's safe-to-spend keeps at least this share of its value. */
export const KEEP_SHARE = 0.8;

/**
 * "Can I afford it?" judged by what you'd feel: today's safe-to-spend (the same number the
 * Today screen shows), not merely "stays above the floor". Returns one verdict, one suggested
 * move, and computed alternatives.
 */
export function checkAffordability(ctx: AffordContext, req: AffordRequest): AffordCheck {
  const { input } = ctx;
  const reserved = Math.max(0, req.reservedCents ?? 0);
  /** New money this purchase needs beyond what's already set aside for it. */
  const amt = Math.max(0, req.amountCents - reserved);
  const plan = planPurchase(input, { label: "Purchase", amountCents: Math.max(1, amt), date: req.date, paymentAccountId: req.paymentAccountId });
  const buy = (cents: Cents, date: ISODate) => purchaseItem(input, { label: "Purchase", amountCents: cents, date, paymentAccountId: req.paymentAccountId });
  const run = (extra: ForecastItem[]) => {
    const f = buildForecast(input, 90, { extraItems: extra });
    return { cap: planDailySpending(input, f, ctx.events, { calendarIncomplete: ctx.calendarIncomplete }).todayCap.capCents, lowest: f.lowest, belowFloor: f.lowest.cents < input.settings.cashFloorCents };
  };
  const base = run([]);

  // When does the cash actually leave? By card: on the statement due date.
  const payAcct = req.paymentAccountId ? input.accounts.find((a) => a.id === req.paymentAccountId) : undefined;
  const cashOut: AffordCheck["cash"] = { date: req.date, viaCard: null, statementCloses: null, beyondHorizon: false };
  if (payAcct?.kind === "credit_card") {
    const f = buildForecast(input, 90, { extraItems: [buy(Math.max(1, amt), req.date)] });
    const stmt = f.cards.find((c) => c.accountId === payAcct.id)?.statements.find((st) => st.closingDate >= req.date);
    cashOut.viaCard = payAcct.name;
    if (stmt) {
      cashOut.date = stmt.dueDate;
      cashOut.statementCloses = stmt.closingDate;
      cashOut.beyondHorizon = stmt.dueDate > f.endDate;
    } else cashOut.beyondHorizon = true;
  }
  if (reserved > 0 && amt === 0) {
    return {
      verdict: "yes",
      headline: "Yes, it's already planned.",
      safeToday: { before: base.cap, after: base.cap },
      lowest: { before: base.lowest, after: base.lowest },
      action: { kind: "go", title: "Go ahead", detail: `Its ${formatCents(reserved)} cap is already set aside in your daily caps, so nothing else changes.` },
      alternatives: [],
      cash: cashOut,
      plan,
    };
  }
  const target = Math.floor(base.cap * KEEP_SHARE);
  const ok = (r: ReturnType<typeof run>) => !r.belowFloor && r.cap >= target;
  const item = buy(amt, req.date);
  const plain = run([item]);

  // Savings that may be suggested: unprotected only (the wedding fund never is).
  const cash = input.accounts.find((a) => a.isSpendable && a.kind !== "credit_card" && a.kind !== "loan");
  const unprotected = plan.sources.filter((s) => !s.protected && s.availableCents > 0);
  const available = unprotected.reduce((t, s) => t + s.availableCents, 0);
  // Savings only need to arrive by the time the cash leaves (for a card: the statement due date).
  const moveDate = cashOut.viaCard && !cashOut.beyondHorizon ? cashOut.date : (plan.transferDate ?? req.date);
  const movesFor = (total: Cents) => {
    const out: Array<{ accountId: string; name: string; cents: Cents }> = [];
    let left = total;
    for (const s of unprotected) {
      if (left <= 0) break;
      const take = Math.min(s.availableCents, left);
      out.push({ accountId: s.accountId, name: s.name, cents: take });
      left -= take;
    }
    return out;
  };
  const transfers = (total: Cents): ForecastItem[] =>
    !cash
      ? []
      : movesFor(total).map((m) => ({
          id: `scenario:move:${m.accountId}`,
          date: moveDate,
          label: `Move from ${m.name}`,
          kind: "transfer" as const,
          source: "scenario" as const,
          sourceId: "move",
          postings: [
            { accountId: m.accountId, deltaCents: -m.cents },
            { accountId: cash.id, deltaCents: m.cents },
          ],
          cashEffectCents: m.cents,
          isEstimate: true,
        }));

  // Computed alternatives.
  const alternatives: AffordAction[] = [];
  const waitDate = ctx.nextPayday && ctx.nextPayday > req.date ? ctx.nextPayday : null;
  const waitOk = waitDate ? ok(run([buy(amt, waitDate)])) : false;
  const cheaperMax = (() => {
    let lo = 0;
    let hi = amt;
    for (let i = 0; i < 12 && hi - lo > 1_000; i++) {
      const mid = Math.floor((lo + hi) / 2);
      if (ok(run([buy(mid, req.date)]))) lo = mid;
      else hi = mid;
    }
    return friendlyRoundDown(lo);
  });

  let verdict: AffordVerdict;
  let headline: string;
  let action: AffordAction;
  let after = plain;

  if (ok(plain)) {
    verdict = "yes";
    headline = "Yes, it fits.";
    action = {
      kind: "go",
      title: "Go ahead",
      detail: reserved > 0
        ? `${formatCents(reserved)} is already set aside for it; the extra ${formatCents(amt)} ${plain.cap < base.cap ? `dips today's safe-to-spend to ${formatCents(plain.cap)}` : "fits easily"}.`
        : plain.cap < base.cap
          ? `Today's safe-to-spend dips from ${formatCents(base.cap)} to ${formatCents(plain.cap)}. Every bill still clears.`
          : "Every bill, card payment and savings transfer still clears.",
    };
  } else {
    // Smallest savings move that brings today's number back to at least KEEP_SHARE.
    let move: Cents | null = null;
    if (cash && available > 0) {
      const capAt = (total: Cents) => run([item, ...transfers(total)]);
      let hi = Math.min(available, amt + Math.max(0, plan.shortfallCents));
      if (ok(capAt(hi))) {
        let lo = 0;
        for (let i = 0; i < 12 && hi - lo > 1_000; i++) {
          const mid = Math.floor((lo + hi) / 2);
          if (ok(capAt(mid))) hi = mid;
          else lo = mid;
        }
        move = Math.min(available, Math.ceil(hi / 1_000) * 1_000);
      }
    }
    if (waitOk) alternatives.push({ kind: "wait", title: `Wait until payday, ${formatShort(waitDate!)}`, detail: "Then it fits without touching savings." });
    if (!plain.belowFloor && plain.cap > 0) {
      alternatives.push({
        kind: "tighten",
        title: `Buy it and tighten up`,
        detail: `No savings needed if you keep spending to ${formatCents(plain.cap)} a day until payday.`,
      });
    }
    const cheaper = cheaperMax();
    if (reserved + cheaper >= 500) {
      alternatives.push({
        kind: "cheaper",
        title: `Go cheaper: up to ${formatCents(reserved + cheaper)}`,
        detail: reserved > 0 ? `That's ${formatCents(reserved)} already set aside plus ${formatCents(cheaper)} more, a plain yes today.` : "That's a plain yes today.",
      });
    }

    if (move != null) {
      verdict = "yes_with_plan";
      headline = "Yes, with a plan.";
      after = run([item, ...transfers(move)]);
      const months = (plan.rebuild.find((r) => r.feasible) ?? plan.rebuild[plan.rebuild.length - 1])?.months ?? 6;
      action = {
        kind: "move",
        title: `Move ${movesFor(move).map((m) => `${formatCents(m.cents)} from ${m.name}`).join(" and ")} by ${formatShort(moveDate)}`,
        detail: `Your everyday spending stays close to normal. Rebuild it with ${formatCents(Math.ceil(move / months))}/month over ${months} months.`,
      };
    } else if (alternatives.length && alternatives[0]!.kind !== "cheaper") {
      verdict = "yes_with_plan";
      headline = "Yes, with a plan.";
      action = alternatives.shift()!;
      if (action.kind === "wait") after = run([buy(amt, waitDate!)]);
    } else {
      verdict = "not_yet";
      headline = "Not yet.";
      action = alternatives.shift() ?? {
        kind: "none",
        title: "Hold off for now",
        detail: plan.protectedAvailableCents > 0 ? "Only protected savings could cover it." : "It doesn't fit within this forecast, even with savings.",
      };
      if (action.kind === "cheaper") after = plain;
    }
  }

  return {
    verdict,
    headline,
    safeToday: { before: base.cap, after: after.cap },
    lowest: { before: base.lowest, after: after.lowest },
    action,
    alternatives,
    cash: cashOut,
    plan,
  };
}
