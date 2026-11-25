import type { Cents } from "../money";

export interface PayoffResult {
  months: number | null; // null = never pays off (payment <= interest)
  totalInterestCents: Cents;
}

/** Month-by-month amortization with monthly compounding (APR/12), integer cents. */
export function payoff(balanceCents: Cents, aprBps: number, monthlyPaymentCents: Cents, maxMonths = 600): PayoffResult {
  let bal = balanceCents;
  let interestTotal = 0;
  if (bal <= 0) return { months: 0, totalInterestCents: 0 };
  for (let m = 1; m <= maxMonths; m++) {
    const interest = Math.round((bal * aprBps) / 10_000 / 12);
    if (monthlyPaymentCents <= interest) return { months: null, totalInterestCents: interestTotal };
    interestTotal += interest;
    bal = bal + interest - monthlyPaymentCents;
    if (bal <= 0) return { months: m, totalInterestCents: interestTotal };
  }
  return { months: null, totalInterestCents: interestTotal };
}

/** Effect of adding `extraCents` per month to a debt payment. */
export function extraPaymentEffect(balanceCents: Cents, aprBps: number, paymentCents: Cents, extraCents: Cents) {
  const base = payoff(balanceCents, aprBps, paymentCents);
  const faster = payoff(balanceCents, aprBps, paymentCents + extraCents);
  return {
    base,
    faster,
    monthsSaved: base.months != null && faster.months != null ? base.months - faster.months : null,
    interestSavedCents: base.totalInterestCents - faster.totalInterestCents,
  };
}
