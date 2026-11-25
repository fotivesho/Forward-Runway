import { formatShort, type ISODate } from "../dates";
import { formatCents, type Cents } from "../money";
import { computeAllowance } from "./advisor";
import { buildForecast, primaryCashAccount } from "./forecast";
import type { EngineInput, ForecastItem } from "./types";

export interface PurchaseRequest {
  label: string;
  amountCents: Cents;
  date: ISODate;
  /** Cash account or credit card used to pay. Defaults to the primary cash account. */
  paymentAccountId?: string | null;
  /** Allow drawing from protected goals (e.g. the wedding fund). Default false. */
  allowProtected?: boolean;
}

export interface FundingSource {
  accountId: string;
  name: string;
  availableCents: Cents;
  protected: boolean;
  goalName?: string;
  useCents: Cents;
}

export interface RebuildOption {
  months: number;
  monthlyCents: Cents;
  dailyImpactCents: Cents;
  /** Rebuild completes by this date (monthly transfers on the 1st). */
  doneBy: ISODate;
  feasible: boolean;
}

export interface PurchasePlan {
  verdict: "fits" | "fits_with_savings" | "needs_protected_savings" | "not_covered";
  summary: string;
  baseline: { lowestCents: Cents; lowestDate: ISODate; dailyAllowanceCents: Cents };
  withPurchase: { lowestCents: Cents; lowestDate: ISODate; dailyAllowanceCents: Cents };
  shortfallCents: Cents;
  /** Savings to move into checking, and when (on or before the first day it's needed). */
  transferDate: ISODate | null;
  sources: FundingSource[];
  protectedAvailableCents: Cents;
  rebuild: RebuildOption[];
  cardNote?: string;
  steps: string[];
}

/** Item representing a hypothetical purchase, for forecasting. */
export function purchaseItem(input: EngineInput, req: PurchaseRequest): ForecastItem {
  const payFrom = req.paymentAccountId ?? primaryCashAccount(input.accounts)?.id ?? "";
  const acct = input.accounts.find((a) => a.id === payFrom);
  const isCash = !!acct && acct.isSpendable && acct.kind !== "credit_card" && acct.kind !== "loan";
  return {
    id: `scenario:purchase:${req.date}`,
    date: req.date,
    label: req.label || "Planned purchase",
    kind: acct?.kind === "credit_card" ? "card_purchase" : "expense",
    source: "scenario",
    sourceId: "purchase",
    postings: [{ accountId: payFrom, deltaCents: -req.amountCents }],
    cashEffectCents: isCash ? -req.amountCents : 0,
    isEstimate: true,
  };
}

/**
 * Can a big purchase be covered, and if not, how much "savings ammo" is
 * needed, from where, and how long to rebuild it?
 */
export function planPurchase(input: EngineInput, req: PurchaseRequest, horizonDays = 90): PurchasePlan {
  const base = buildForecast(input, horizonDays);
  const baseAllowance = computeAllowance(base);
  const item = purchaseItem(input, req);
  const withP = buildForecast(input, horizonDays, { extraItems: [item] });
  const withAllowance = computeAllowance(withP);
  const floor = input.settings.cashFloorCents;
  const shortfall = Math.max(0, floor - withP.lowest.cents);
  const baseShort = Math.max(0, floor - base.lowest.cents);
  const caused = Math.max(0, shortfall - baseShort); // only the part this purchase causes
  const need = shortfall; // to keep every day at/above the floor

  const steps: string[] = [];
  const payAcct = input.accounts.find((a) => a.id === (req.paymentAccountId ?? primaryCashAccount(input.accounts)?.id));
  let cardNote: string | undefined;
  if (payAcct?.kind === "credit_card") {
    const card = withP.cards.find((c) => c.accountId === payAcct.id);
    const stmt = card?.statements.find((s) => s.closingDate >= req.date);
    cardNote = stmt
      ? `On ${payAcct.name} it lands on the statement closing ${formatShort(stmt.closingDate)} and is paid in full from cash on ${formatShort(stmt.dueDate)} (projected statement ${formatCents(stmt.balanceCents)}).`
      : `On ${payAcct.name} it's paid on a statement after this forecast window — extend the horizon to see it.`;
    if (payAcct.aprBps) {
      const monthly = Math.round((req.amountCents * payAcct.aprBps) / 10_000 / 12);
      cardNote += ` If it isn't paid in full, interest is about ${formatCents(monthly)} a month at ${(payAcct.aprBps / 100).toFixed(2)}% APR.`;
    }
  }

  // Funding sources: unprotected savings first, protected goals only on request.
  const protectedAccounts = new Map<string, string>();
  for (const g of input.goals) if (g.accountId && (g.protected ?? g.kind === "wedding")) protectedAccounts.set(g.accountId, g.name);
  const savings = input.accounts.filter(
    (a) => !a.archived && a.kind === "savings" && !a.isSpendable && (base.openingByAccount[a.id] ?? 0) > 0,
  );
  const sources: FundingSource[] = savings
    .map((a) => ({
      accountId: a.id,
      name: a.name,
      // What's in it now, minus planned withdrawals within the horizon (never plan to overdraw savings).
      availableCents: Math.max(
        0,
        Math.min(
          base.openingByAccount[a.id] ?? 0,
          ...base.days.map((_, i) => runningValue(base, a.id, i)),
        ),
      ),
      protected: protectedAccounts.has(a.id),
      goalName: protectedAccounts.get(a.id),
      useCents: 0,
    }))
    .sort((a, b) => Number(a.protected) - Number(b.protected) || b.availableCents - a.availableCents);

  let remaining = need;
  for (const s of sources) {
    if (remaining <= 0) break;
    if (s.protected && !req.allowProtected) continue;
    s.useCents = Math.min(s.availableCents, remaining);
    remaining -= s.useCents;
  }
  const protectedAvailable = sources.filter((s) => s.protected).reduce((t, s) => t + s.availableCents, 0);
  const unprotectedAvailable = sources.filter((s) => !s.protected).reduce((t, s) => t + s.availableCents, 0);
  const moved = sources.reduce((t, s) => t + s.useCents, 0);

  const firstShort = withP.days.find((d) => d.closingCents < floor)?.date ?? null;
  const transferDate = need > 0 ? (firstShort && firstShort < req.date ? firstShort : req.date) : null;

  // Rebuild options: refill what was moved over 3, 6 or 12 months.
  const sustainable = withAllowance.sustainableDailyCents;
  const rebuild: RebuildOption[] =
    moved > 0
      ? [3, 6, 12].map((months) => {
          const monthly = Math.ceil(moved / months);
          const daily = Math.ceil(monthly / 30.4);
          return {
            months,
            monthlyCents: monthly,
            dailyImpactCents: daily,
            doneBy: addMonthsFirst(req.date, months),
            feasible: daily <= Math.max(baseAllowance.sustainableDailyCents, sustainable),
          };
        })
      : [];

  let verdict: PurchasePlan["verdict"];
  let summary: string;
  if (need === 0) {
    verdict = "fits";
    summary = `Covered by cash flow. Your daily allowance goes from ${formatCents(baseAllowance.current.dailyRateCents)} to ${formatCents(withAllowance.current.dailyRateCents)} this pay period.`;
    steps.push(`Buy on ${formatShort(req.date)}${payAcct ? ` with ${payAcct.name}` : ""}.`);
  } else if (remaining <= 0 && !sources.some((s) => s.protected && s.useCents > 0)) {
    verdict = "fits_with_savings";
    summary = `Cash would dip ${formatCents(need)} below your floor${caused < need ? ` (${formatCents(need - caused)} of that gap exists even without this purchase)` : ""}. Move ${formatCents(moved)} from savings to cover it.`;
  } else if (remaining <= 0) {
    verdict = "needs_protected_savings";
    summary = `Covering it needs ${formatCents(need)}, including money from protected savings.`;
  } else {
    verdict = "not_covered";
    summary =
      unprotectedAvailable + (req.allowProtected ? 0 : protectedAvailable) >= need && !req.allowProtected
        ? `Unprotected savings cover ${formatCents(moved)} of the ${formatCents(need)} needed. The rest would have to come from protected savings (${[...protectedAccounts.values()].join(", ")}).`
        : `Even with savings, ${formatCents(remaining)} of the ${formatCents(need)} needed isn't covered. Consider a smaller purchase, a later date, or paying over time.`;
  }
  if (need > 0) {
    for (const s of sources.filter((x) => x.useCents > 0)) {
      steps.push(`Move ${formatCents(s.useCents)} from ${s.name} to checking by ${formatShort(transferDate!)}.`);
    }
    steps.push(`Buy on ${formatShort(req.date)}${payAcct ? ` with ${payAcct.name}` : ""}.`);
    const pick = rebuild.find((r) => r.feasible);
    if (pick) {
      steps.push(
        `Rebuild with ${formatCents(pick.monthlyCents)}/month for ${pick.months} months (about ${formatCents(pick.dailyImpactCents)} less per day of flexible spending), done by ${formatShort(pick.doneBy)}.`,
      );
    } else if (rebuild.length) {
      steps.push("Even a 12-month rebuild is larger than your current daily allowance; consider spreading the purchase out.");
    }
  }
  if (cardNote) steps.push(cardNote);

  return {
    verdict,
    summary,
    baseline: {
      lowestCents: base.lowest.cents,
      lowestDate: base.lowest.date,
      dailyAllowanceCents: baseAllowance.current.dailyRateCents,
    },
    withPurchase: {
      lowestCents: withP.lowest.cents,
      lowestDate: withP.lowest.date,
      dailyAllowanceCents: withAllowance.current.dailyRateCents,
    },
    shortfallCents: need,
    transferDate,
    sources,
    protectedAvailableCents: protectedAvailable,
    rebuild,
    cardNote,
    steps,
  };
}

function runningValue(f: ReturnType<typeof buildForecast>, accountId: string, dayIndex: number): Cents {
  let v = f.openingByAccount[accountId] ?? 0;
  for (let i = 0; i <= dayIndex; i++) {
    const day = f.days[i]!;
    for (const it of [...day.items, ...day.nonCashItems]) {
      for (const p of it.postings) if (p.accountId === accountId) v += p.deltaCents;
    }
  }
  return v;
}

function addMonthsFirst(date: ISODate, months: number): ISODate {
  // First of the month, `months` months after `date`.
  const [y, m] = date.split("-").map(Number) as [number, number];
  const total = y * 12 + (m - 1) + months;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}-01`;
}

