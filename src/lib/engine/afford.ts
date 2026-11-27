import { cardRoomFor } from "./card-room";
import { addMonths, diffDays, formatShort, maxDate, parts as dateParts, type ISODate } from "../dates";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const formatMonthYear = (d: ISODate) => `${MONTHS[dateParts(d).m - 1]} ${dateParts(d).y}`;
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
  kind: "go" | "move" | "lean" | "skip_plan" | "goal" | "cheaper" | "wait" | "none";
  title: string;
  /** The trade-off, in plain words. */
  detail: string;
  /** What doing it changes, so the app can do it for you in one tap. */
  apply?: {
    /** Savings to move into cash, by this date. */
    moves?: Array<{ fromAccountId: string; cents: Cents }>;
    date?: ISODate;
    /** Other plans to skip. */
    skipEventIds?: string[];
    /** What skipping them frees (their caps), so a preview adds exactly that back. */
    freesCents?: Cents;
    /** Spend at most this on it. */
    capCents?: Cents;
    /** Move it to this date. */
    newDate?: ISODate;
    /** Pay with this account (a card: cash leaves on its statement due date). */
    paymentAccountId?: string | null;
  };
}

export interface AffordCheck {
  verdict: AffordVerdict;
  headline: string;
  /** Free flexible money in the pay period when the cash leaves, before and after this purchase. */
  /** `borrowed`: a small amount taken from the next pay period(s) in a plain "yes". */
  room: { start: ISODate; end: ISODate; before: Cents; after: Cents; shortfall: Cents; borrowed: Cents };
  lowest: { before: { cents: Cents; date: ISODate }; after: { cents: Cents; date: ISODate } };
  /** Your cash floor, for showing how much cushion the lowest point keeps. */
  floorCents: Cents;
  /** When the money actually leaves your cash. */
  cash: { date: ISODate; viaCard: string | null; statementCloses: ISODate | null; beyondHorizon: boolean };
  /** Paying by card: the statement it lands on, usual vs. with this purchase (incl. typical card spending). */
  /**
   * Paying by card: the statement it lands on. `usualCents` = what's already headed for that statement
   * (card bills + `typicalCents` of usual everyday card spending before it closes). `capCents` = the
   * biggest statement you can pay in full on the due date without savings or squeezing everyday
   * spending (usual + that pay period's free money).
   */
  card: {
    name: string;
    due: ISODate;
    closes: ISODate;
    /** Already on the card for this statement: current balance plus card bills before it closes. */
    onCardCents: Cents;
    typicalCents: Cents;
    usualCents: Cents;
    withCents: Cents;
    capCents: Cents;
  } | null;
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
      card = {
        name: payAcct.name,
        due: stmtNow.dueDate,
        closes: stmtNow.closingDate,
        onCardCents: stmtNow.balanceCents,
        typicalCents: typical,
        usualCents: usual,
        withCents: usual + req.amountCents,
        capCents: usual,
      };
    } else cash.beyondHorizon = true;
  }

  const found = pots.findIndex((p) => cash.date >= p.start && cash.date <= p.end);
  const potIndex = cash.beyondHorizon || found < 0 ? pots.length - 1 : found;
  const pot = pots[potIndex]!;
  const withPurchase = buildForecast(input, 90, { extraItems: [item] });
  const floorShort = Math.max(0, floor - withPurchase.lowest.cents);
  // On a card, the max bill is the same calculation as on Accounts and Forecast: cash and paychecks
  // minus every other bill, plan and usual everyday spending until it's due, what's still needed
  // until the next payday, and your cushion. It never assumes the expected bill fits.
  if (card && !cash.beyondHorizon) {
    const r = cardRoomFor(input, payAcct!.id, base).find((x) => x.due === card!.due);
    card.capCents = (r ? r.maxCents : card.usualCents + pot.free) + reserved;
  }
  // How much would have to come from savings: on a card, whatever the bill goes over max; in cash,
  // whatever this pay period's free money doesn't cover.
  const shortfall = card && !cash.beyondHorizon ? Math.max(0, card.withCents - card.capCents) : Math.max(0, amt - pot.free);
  const room = { start: pot.start, end: pot.end, before: pot.free, after: Math.max(0, pot.free - amt), shortfall, borrowed: 0 };
  const lowest = { before: base.lowest, after: withPurchase.lowest };

  const result = (verdict: AffordVerdict, headline: string, action: AffordAction, alternatives: AffordAction[]): AffordCheck => ({
    verdict,
    headline,
    room,
    lowest,
    floorCents: floor,
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
      detail: `The ${formatCents(reserved)} for this is already set aside in your daily spending limits, so nothing else changes.`,
    }, []);
  }

  // Fits in this period's free money and keeps cash above the floor.
  if (shortfall === 0 && floorShort === 0) {
    const daysLeft = Math.max(1, diffDays(maxDate(pot.start, input.today), pot.end) + 1);
    const left = pot.free - amt;
    if (card && !cash.beyondHorizon) {
      return result("yes", "Yes, it fits.", {
        kind: "go",
        title: "Go ahead",
        detail: `Your card bill on ${formatShort(card.due)} can be up to about ${money(Math.round(card.capCents / 100) * 100)} and still be paid off in full from that paycheck, without touching savings.${card.typicalCents > 0 ? ` That already counts about ${money(Math.round(card.typicalCents / 100) * 100)} of your normal card spending (groceries, gas, lunch) before the statement closes ${formatShort(card.closes)}.` : ""}`,
      }, []);
    }
    return result("yes", "Yes, it fits.", {
      kind: "go",
      title: "Go ahead",
      detail: `After this you'll still have ${formatCents(left)} for everyday spending from ${range(pot.start, pot.end)}${daysLeft > 1 ? `, about ${formatCents(Math.floor(left / daysLeft))} a day` : ""}. Bills and savings stay covered.`,
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
      detail: `This is a little more than this pay period's spending money. The extra ${money(Math.ceil(shortfall / 100) * 100)} comes out of your next paycheck: about ${formatCents(Math.max(1, perDayCost))} a day less to spend until ${formatShort(next[next.length - 1]!.end)}. Bills and savings aren't touched.`,
    }, []);
  }

  // --- Options, each with its trade-off ----------------------------------------------------------
  const options: Array<AffordAction & { rank: number }> = [];
  const spanDays = Math.max(1, diffDays(pots[0]!.start, pots[pots.length - 1]!.end) + 1);
  /** Typical free flexible money per month, across the forecast. */
  const monthlyFree = (pots.reduce((t, p) => t + p.free, 0) / spanDays) * 30;
  const rebuildMonths = (cents: Cents) => [2, 3, 6, 12].find((m) => cents / m <= monthlyFree * 0.25) ?? 12;
  const round10 = (c: Cents) => Math.ceil(c / 1_000) * 1_000;

  // Unprotected savings only: the wedding fund (and any protected goal) is never suggested.
  const unprotected = plan.sources.filter((s) => !s.protected && s.availableCents > 0);
  const available = unprotected.reduce((t, s) => t + s.availableCents, 0);
  const savingsTitle = (cents: Cents) => {
    const parts: string[] = [];
    let left = cents;
    for (const s of unprotected) {
      if (left <= 0) break;
      const take = Math.min(left, s.availableCents);
      parts.push(`${money(take)} from ${s.name}`);
      left -= take;
    }
    return parts.join(" and ");
  };
  /** The savings moves behind a "Move $X from …" option. */
  const movesFor = (cents: Cents) => {
    const out: Array<{ fromAccountId: string; cents: Cents }> = [];
    let left = cents;
    for (const s of unprotected) {
      if (left <= 0) break;
      const take = Math.min(left, s.availableCents);
      out.push({ fromAccountId: s.accountId, cents: take });
      left -= take;
    }
    return out;
  };
  const rebuildText = (cents: Cents) => {
    const m = rebuildMonths(cents);
    return `rebuild it with ${money(Math.ceil(cents / m / 100) * 100)}/month for ${m} months`;
  };

  // 1. Use savings.
  const gap = Math.max(shortfall, floorShort);
  const needFromSavings = Math.min(available, round10(gap));
  const savingsCovers = gap > 0 && available >= gap;
  if (savingsCovers) {
    options.push({
      kind: "move",
      rank: 3,
      title: `Move ${savingsTitle(needFromSavings)} by ${formatShort(cash.date)}`,
      detail: `Move ${savingsTitle(needFromSavings)} into checking by ${formatShort(cash.date)}, so this is paid without squeezing your everyday spending. Afterwards, ${rebuildText(needFromSavings)} to refill your savings.`,
      apply: { moves: movesFor(needFromSavings), date: cash.date },
    });
  }

  // The flexible-money options can't fix a floor breach (that's cash, not spending money).
  if (floorShort === 0) {
    // 2. Run lean: borrow from the next pay periods' everyday money.
    if (next.length && nextDays > 0 && shortfall <= nextFree * 0.6) {
      options.push({
        kind: "lean",
        rank: shortfall <= nextFree * 0.25 ? 1 : 4,
        title: `Run lean until ${formatShort(next[next.length - 1]!.end)}`,
        detail: `Spend nothing extra until ${formatShort(pot.end)}. After that, keep everyday spending to about ${formatCents(leanPerDay)} a day instead of your usual ${formatCents(normalPerDay)} until ${formatShort(next[next.length - 1]!.end)}. That small trim pays for it, and savings stay untouched.`,
      });
    }

    // 3. Skip a plan that's already budgeted in that pay period (your calendar's planned spending).
    const cuttable = pot.plans.filter((x) => !x.e.essential).sort((a, b) => a.a.capCents - b.a.capCents);
    const single = cuttable.find((x) => x.a.capCents >= shortfall);
    const pair = !single && cuttable.length >= 2 ? cuttable.slice(-2) : null;
    if (single) {
      options.push({ kind: "skip_plan", rank: 2, title: `Skip ${single.e.title}`, detail: `Cancel or move ${single.e.title} (${formatShort(single.e.date)}). The ${money(single.a.capCents)} set aside for it pays for this instead. Nothing else changes.`, apply: { skipEventIds: [single.e.id], freesCents: single.a.capCents } });
    } else if (pair && pair[0]!.a.capCents + pair[1]!.a.capCents >= shortfall) {
      const freed = pair[0]!.a.capCents + pair[1]!.a.capCents;
      options.push({ kind: "skip_plan", rank: 5, title: `Skip ${pair[0]!.e.title} and ${pair[1]!.e.title}`, detail: `Cancel or move both. The ${money(freed)} set aside for them that pay period pays for this instead. Nothing else changes.`, apply: { skipEventIds: [pair[0]!.e.id, pair[1]!.e.id], freesCents: freed } });
    } else if (cuttable.length && savingsCovers) {
      // Not enough on its own: skip the biggest plan and cover the rest from savings (a smaller move).
      const biggest = cuttable[cuttable.length - 1]!;
      const rest = Math.min(available, round10(shortfall - biggest.a.capCents));
      options.push({
        kind: "skip_plan",
        rank: 3.5,
        title: `Skip ${biggest.e.title} and move ${money(rest)}`,
        detail: `Cancel or move ${biggest.e.title}: its ${money(biggest.a.capCents)} goes toward this. The other ${money(rest)} comes from savings. Afterwards, ${rebuildText(rest)} to refill them.`,
        apply: { skipEventIds: [biggest.e.id], freesCents: biggest.a.capCents, moves: movesFor(rest), date: cash.date },
      });
    }

    // 4. Wait for the next pay period (debit only; a card's cash already leaves later).
    const following = pots[potIndex + 1];
    if (!cash.viaCard && following && amt <= following.free) {
      options.push({ kind: "wait", rank: 6, title: `Wait until ${formatShort(following.start)}`, detail: `Buy it on or after ${formatShort(following.start)}, when your next paycheck lands. That pay period's spending money covers it, with nothing else changing.`, apply: { newDate: following.start } });
    }
  }

  // 5. Too big for savings: make it a goal you save for, at a pace your budget can carry.
  if (!savingsCovers && gap > 0 && monthlyFree > 0) {
    const monthly = Math.max(1_000, round10(Math.min(monthlyFree * 0.4, req.amountCents)));
    const months = Math.max(1, Math.ceil(amt / monthly));
    const ready = addMonths(input.today, months);
    options.push({
      kind: "goal",
      rank: 0,
      title: `Save up: ${money(monthly)}/month`,
      detail: `Instead of buying it now, set aside ${money(monthly)} a month and you'll have it by ${formatMonthYear(ready)}. That's about ${formatCents(Math.ceil(monthly / 30))} a day less to spend, and your savings stay untouched.`,
    });
  }

  // 6. Cut it down to what fits as is.
  // On a card: what fits under the max bill. In cash: this pay period's free money.
  const fitsAsIs = card && !cash.beyondHorizon ? card.capCents - card.usualCents : reserved + Math.min(pot.free, Math.max(0, base.lowest.cents - floor));
  const cheaper = friendlyRoundDown(Math.max(0, fitsAsIs));
  if (cheaper >= 500 && cheaper < req.amountCents) {
    options.push({ kind: "cheaper", rank: 7, title: `Cut it to ${money(cheaper)}`, detail: `Spend at most ${money(cheaper)} on it. ${card && !cash.beyondHorizon ? `That keeps your ${card.name} bill under its max, so it's paid from cash` : `That fits in your spending money for ${range(pot.start, pot.end)}`} without moving anything.`, apply: { capCents: cheaper } });
  }

  options.sort((a, b) => a.rank - b.rank);
  const strip = ({ rank: _r, ...a }: AffordAction & { rank: number }): AffordAction => a;
  const [first, ...rest] = options;
  // "With a plan" needs a way to buy it now; saving up or buying something cheaper means "not yet".
  if (options.some((o) => o.kind !== "cheaper" && o.kind !== "goal")) {
    const nowFirst = options.filter((o) => o.kind !== "goal");
    const later = options.filter((o) => o.kind === "goal");
    const [primary, ...others] = [...nowFirst, ...later];
    return result("yes_with_plan", "Yes, with a plan.", strip(primary!), others.map(strip));
  }
  return result(
    "not_yet",
    "Not yet.",
    first ? strip(first) : { kind: "none", title: "Hold off for now", detail: "It doesn't fit yet, even using the savings you're free to use. Protected goals are never touched." },
    rest.map(strip),
  );
}

/**
 * What the answer would look like after doing one option: the same check, re-run with that option
 * applied (savings moved in, other plans skipped, a lower cap, a later date, another way to pay).
 * Null when an option changes nothing the numbers can show (running lean is a daily habit).
 */
export function previewOption(ctx: AffordContext, req: AffordRequest, option: AffordAction): AffordCheck | null {
  const a = option.apply;
  if (!a) return null;
  const r: AffordRequest = { ...req };
  if (a.capCents != null) r.amountCents = Math.min(r.amountCents, a.capCents);
  if (a.newDate) r.date = a.newDate;
  if (a.paymentAccountId !== undefined) r.paymentAccountId = a.paymentAccountId;
  // Skipping a plan frees exactly its cap. (Re-running the whole plan would hand that money to
  // other plans' caps instead, which isn't what the option says.)
  const events = a.skipEventIds?.length && a.freesCents == null ? ctx.events.filter((e) => !a.skipEventIds!.includes(e.id)) : ctx.events;
  const c = checkAffordability({ ...ctx, events }, r);
  const moved = (a.moves ?? []).reduce((t, m) => t + m.cents, 0);
  const extra = moved + (a.skipEventIds?.length ? (a.freesCents ?? 0) : 0);
  if (!extra) return c;
  // The extra money lands exactly where it's needed: this pay period, or the card bill.
  const shortfall = Math.max(0, c.room.shortfall - extra);
  const room = { ...c.room, after: c.room.after + Math.max(0, extra - c.room.shortfall), shortfall };
  const card = c.card ? { ...c.card, capCents: c.card.capCents + extra } : null;
  const lowest = { ...c.lowest, after: { ...c.lowest.after, cents: c.lowest.after.cents + extra } };
  const fits = shortfall === 0 && (!card || card.withCents <= card.capCents) && lowest.after.cents >= c.floorCents;
  return { ...c, room, card, lowest, verdict: fits ? "yes" : c.verdict };
}
