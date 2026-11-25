import { diffDays, formatShort, maxDate, type ISODate } from "../dates";
import { formatCents, friendlyRoundDown, type Cents } from "../money";
import { planDailySpending, type PlannedEvent } from "./advisor";
import { buildForecast } from "./forecast";
import { planPurchase, purchaseItem, type PurchasePlan } from "./purchase";
import { avgDailyCardSpend } from "./spending";
import type { EngineInput } from "./types";

/**
 * "Can I afford it?"
 *
 * People think in a pot of flexible money per pay period, with plans already taking slices of
 * it. So the question is: does this fit in the FREE flexible money of the pay period when the cash
 * actually leaves (the purchase date for debit, the statement due date for a card)? "Free" means
 * after bills, savings transfers, card payments and the plans already budgeted. The 90-day forecast
 * is also checked so cash never drops below the floor.
 *
 * If it doesn't fit, every option comes with its trade-off: use savings (and the rebuild), run
 * lean for a while, skip a plan, cut it down, or wait.
 */

export type AffordVerdict = "yes" | "yes_with_plan" | "not_yet";

export interface AffordAction {
  kind: "go" | "move" | "lean" | "skip_plan" | "cheaper" | "wait" | "none";
  title: string;
  /** The trade-off, in plain words. */
  detail: string;
}

export interface AffordCheck {
  verdict: AffordVerdict;
  headline: string;
  /** Free flexible money in the pay period when the cash leaves, before and after this purchase. */
  /** `borrowed`: a small amount taken from the next pay period(s) in a plain "yes". */
  room: { start: ISODate; end: ISODate; before: Cents; after: Cents; shortfall: Cents; borrowed: Cents };
  lowest: { before: { cents: Cents; date: ISODate }; after: { cents: Cents; date: ISODate } };
  /** When the money actually leaves your cash. */
  cash: { date: ISODate; viaCard: string | null; statementCloses: ISODate | null; beyondHorizon: boolean };
  /** Paying by card: the statement it lands on, usual vs. with this purchase (incl. typical card spending). */
  card: { name: string; due: ISODate; closes: ISODate; usualCents: Cents; withCents: Cents; typicalCents: Cents } | null;
  action: AffordAction;
  alternatives: AffordAction[];
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
  /** Checking one of your own calendar plans: the amount its cap already sets aside (never counted twice). */
  reservedCents?: Cents | null;
}

/** "$790" when the amount is whole dollars, "$66.52" otherwise. */
const money = (c: Cents) => (c % 100 === 0 ? "$" + (c / 100).toLocaleString("en-US") : formatCents(c));
const range = (a: ISODate, b: ISODate) => (a === b ? formatShort(a) : `${formatShort(a)}–${formatShort(b)}`);

export function checkAffordability(ctx: AffordContext, req: AffordRequest): AffordCheck {
  const { input } = ctx;
  const reserved = Math.max(0, req.reservedCents ?? 0);
  /** New money beyond what's already set aside for this plan. */
  const amt = Math.max(0, req.amountCents - reserved);
  const plan = planPurchase(input, { label: "Purchase", amountCents: Math.max(1, amt), date: req.date, paymentAccountId: req.paymentAccountId });
  const item = purchaseItem(input, { label: "Purchase", amountCents: amt, date: req.date, paymentAccountId: req.paymentAccountId });
  const floor = input.settings.cashFloorCents;

  // --- The pots: free flexible money per pay period (after plans already budgeted) ------------
  const base = buildForecast(input, 90);
  const dp = planDailySpending(input, base, ctx.events, { calendarIncomplete: ctx.calendarIncomplete });
  const periods = dp.allowance.periods;
  const pct = ctx.calendarIncomplete ? Math.min(50, Math.max(0, input.settings.unseenPlansBufferPct)) : 0;
  const eventsById = new Map(ctx.events.map((e) => [e.id, e]));
  const planned = dp.advice
    .map((a) => ({ a, e: eventsById.get(a.eventId)! }))
    .filter((x) => x.e && x.a.capCents > 0);
  const pots = periods.map((p, i) => {
    const pool = i === 0 ? dp.poolCents : p.budgetCents - Math.round((p.budgetCents * pct) / 100);
    const plans = planned.filter((x) => x.e.date >= p.start && x.e.date <= p.end);
    const reservedForPlans = plans.reduce((t, x) => t + x.a.capCents, 0);
    return { ...p, start: i === 0 ? maxDate(p.start, input.today) : p.start, free: Math.max(0, pool - reservedForPlans), plans };
  });

  // --- When does the cash leave? ------------------------------------------------------------
  const payAcct = req.paymentAccountId ? input.accounts.find((a) => a.id === req.paymentAccountId) : undefined;
  const cash: AffordCheck["cash"] = { date: req.date, viaCard: null, statementCloses: null, beyondHorizon: false };
  let card: AffordCheck["card"] = null;
  if (payAcct?.kind === "credit_card") {
    cash.viaCard = payAcct.name;
    const stmtNow = base.cards.find((c) => c.accountId === payAcct.id)?.statements.find((s) => s.closingDate >= req.date);
    if (stmtNow) {
      cash.date = stmtNow.dueDate;
      cash.statementCloses = stmtNow.closingDate;
      cash.beyondHorizon = stmtNow.dueDate > base.endDate;
      // Typical everyday card spending still to come before this statement closes.
      const daysLeftInCycle = Math.max(0, diffDays(input.today, stmtNow.closingDate));
      const typical = avgDailyCardSpend(input, payAcct.id) * daysLeftInCycle;
      const usual = stmtNow.balanceCents + typical;
      card = { name: payAcct.name, due: stmtNow.dueDate, closes: stmtNow.closingDate, usualCents: usual, withCents: usual + req.amountCents, typicalCents: typical };
    } else cash.beyondHorizon = true;
  }

  const found = pots.findIndex((p) => cash.date >= p.start && cash.date <= p.end);
  const potIndex = cash.beyondHorizon || found < 0 ? pots.length - 1 : found;
  const pot = pots[potIndex]!;
  const withPurchase = buildForecast(input, 90, { extraItems: [item] });
  const floorShort = Math.max(0, floor - withPurchase.lowest.cents);
  const shortfall = Math.max(0, amt - pot.free);
  const room = { start: pot.start, end: pot.end, before: pot.free, after: Math.max(0, pot.free - amt), shortfall, borrowed: 0 };
  const lowest = { before: base.lowest, after: withPurchase.lowest };

  const result = (verdict: AffordVerdict, headline: string, action: AffordAction, alternatives: AffordAction[]): AffordCheck => ({
    verdict,
    headline,
    room,
    lowest,
    cash,
    card,
    action,
    alternatives,
    plan,
  });

  // Already budgeted in full.
  if (reserved > 0 && amt === 0) {
    return result("yes", "Yes, it's already planned.", {
      kind: "go",
      title: "Go ahead",
      detail: `Its ${formatCents(reserved)} is already set aside, so nothing else changes.`,
    }, []);
  }

  // Fits in this period's free money and keeps cash above the floor.
  if (shortfall === 0 && floorShort === 0) {
    const daysLeft = Math.max(1, diffDays(maxDate(pot.start, input.today), pot.end) + 1);
    const left = pot.free - amt;
    return result("yes", "Yes, it fits.", {
      kind: "go",
      title: "Go ahead",
      detail: `Leaves ${formatCents(left)} for everyday spending ${range(pot.start, pot.end)}${daysLeft > 1 ? `, about ${formatCents(Math.floor(left / daysLeft))} a day` : ""}.`,
    }, []);
  }

  // A small shortfall that costs only a little everyday money over the next few weeks is a plain yes.
  const next = pots.slice(potIndex + 1, potIndex + 3);
  const nextFree = next.reduce((t, p) => t + p.free, 0);
  const nextDays = next.reduce((t, p) => t + p.days, 0);
  const normalPerDay = nextDays > 0 ? Math.floor(nextFree / nextDays) : 0;
  const leanPerDay = nextDays > 0 ? Math.floor((nextFree - shortfall) / nextDays) : 0;
  const perDayCost = normalPerDay - leanPerDay;
  if (floorShort === 0 && next.length && shortfall <= nextFree * 0.6 && perDayCost <= Math.max(200, normalPerDay * 0.1)) {
    room.borrowed = shortfall;
    room.shortfall = 0;
    return result("yes", "Yes, it fits.", {
      kind: "go",
      title: "Go ahead",
      detail: `Borrows ${money(Math.ceil(shortfall / 100) * 100)} from next pay period: about ${formatCents(Math.max(1, perDayCost))} a day less until ${formatShort(next[next.length - 1]!.end)}.`,
    }, []);
  }

  // --- Options, each with its trade-off ----------------------------------------------------------
  const options: Array<AffordAction & { rank: number }> = [];

  // 1. Use savings (unprotected only; the wedding fund is never suggested).
  const unprotected = plan.sources.filter((s) => !s.protected && s.availableCents > 0);
  const available = unprotected.reduce((t, s) => t + s.availableCents, 0);
  const needFromSavings = Math.min(available, Math.ceil(Math.max(shortfall, floorShort) / 1_000) * 1_000);
  if (needFromSavings > 0 && available >= Math.max(shortfall, floorShort)) {
    const parts: string[] = [];
    let left = needFromSavings;
    for (const s of unprotected) {
      if (left <= 0) break;
      const take = Math.min(left, s.availableCents);
      parts.push(`${money(take)} from ${s.name}`);
      left -= take;
    }
    const spanDays = Math.max(1, diffDays(pots[0]!.start, pots[pots.length - 1]!.end) + 1);
    const monthlyFree = (pots.reduce((t, p) => t + p.free, 0) / spanDays) * 30;
    const months = [2, 3, 6, 12].find((m) => needFromSavings / m <= monthlyFree * 0.25) ?? 12;
    options.push({
      kind: "move",
      rank: 3,
      title: `Move ${parts.join(" and ")} by ${formatShort(cash.date)}`,
      detail: `Rebuild it with ${money(Math.ceil(needFromSavings / months / 100) * 100)}/month for ${months} months.`,
    });
  }

  // The flexible-money options can't fix a floor breach (that's cash, not spending money).
  if (floorShort === 0) {
    // 2. Run lean: borrow from the next pay periods' everyday money.
    if (next.length && nextDays > 0 && shortfall <= nextFree * 0.6) {
      const normal = normalPerDay;
      const lean = leanPerDay;
      options.push({
        kind: "lean",
        rank: shortfall <= nextFree * 0.25 ? 1 : 4,
        title: `Run lean until ${formatShort(next[next.length - 1]!.end)}`,
        detail: `Nothing extra until ${formatShort(pot.end)}, then about ${formatCents(lean)} a day instead of ${formatCents(normal)}.`,
      });
    }

    // 3. Skip a plan that's already budgeted in the same period.
    const cuttable = pot.plans.filter((x) => !x.e.essential).sort((a, b) => a.a.capCents - b.a.capCents);
    const single = cuttable.find((x) => x.a.capCents >= shortfall);
    const pair = !single && cuttable.length >= 2 ? cuttable.slice(-2) : null;
    if (single) {
      options.push({ kind: "skip_plan", rank: 2, title: `Skip ${single.e.title}`, detail: `Frees its ${formatCents(single.a.capCents)} on ${formatShort(single.e.date)}.` });
    } else if (pair && pair[0]!.a.capCents + pair[1]!.a.capCents >= shortfall) {
      options.push({
        kind: "skip_plan",
        rank: 5,
        title: `Skip ${pair[0]!.e.title} and ${pair[1]!.e.title}`,
        detail: `Frees ${formatCents(pair[0]!.a.capCents + pair[1]!.a.capCents)} that pay period.`,
      });
    }

    // 4. Wait for the next pay period (debit only; a card's cash already leaves later).
    const following = pots[potIndex + 1];
    if (!cash.viaCard && following && amt <= following.free) {
      options.push({ kind: "wait", rank: 6, title: `Wait until ${formatShort(following.start)}`, detail: "It fits in that pay period's money." });
    }
  }

  // 5. Cut it down to what fits as is.
  const cheaper = friendlyRoundDown(reserved + Math.min(pot.free, Math.max(0, base.lowest.cents - floor)));
  if (cheaper >= 500 && cheaper < req.amountCents) {
    options.push({ kind: "cheaper", rank: 7, title: `Cut it to ${money(cheaper)}`, detail: `That fits ${range(pot.start, pot.end)} with nothing else changing.` });
  }

  options.sort((a, b) => a.rank - b.rank);
  const strip = ({ rank: _r, ...a }: AffordAction & { rank: number }): AffordAction => a;
  const [first, ...rest] = options;
  if (options.some((o) => o.kind !== "cheaper")) {
    return result("yes_with_plan", "Yes, with a plan.", strip(first!), rest.map(strip));
  }
  return result(
    "not_yet",
    "Not yet.",
    first ? strip(first) : { kind: "none", title: "Hold off for now", detail: "It doesn't fit, even with your unprotected savings." },
    rest.map(strip),
  );
}
