/**
 * FICTIONAL demo data for the public /demo page. Nothing here comes from a
 * real person or a connected account. Dates are generated relative to
 * "today" so the demo always looks current; amounts are deterministic.
 */
import { addDays, addMonths, parts, type ISODate } from "../dates";
import type { OneTimeTransaction } from "../engine/types";
import { DEFAULT_SETTINGS, type Snapshot } from "./snapshot";

const ID = {
  checking: "00000000-0000-4000-8000-000000000001",
  savings: "00000000-0000-4000-8000-000000000002",
  wedding: "00000000-0000-4000-8000-000000000003",
  visa: "00000000-0000-4000-8000-000000000004",
  carLoan: "00000000-0000-4000-8000-000000000005",
  calPersonal: "00000000-0000-4000-8000-0000000000c1",
  calShared: "00000000-0000-4000-8000-0000000000c2",
};

function lcg(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

export function demoSnapshot(today: ISODate, nowIso: string): Snapshot {
  const { d } = parts(today);
  const rand = lcg(42);
  const daysAgo = (n: number) => addDays(today, -n);
  const inDays = (n: number) => addDays(today, n);
  const hoursAgo = (h: number) => new Date(Date.parse(nowIso) - h * 3_600_000).toISOString();

  // Visa closes on the 20th, due on the 15th of the next month.
  const thisMonth20 = `${today.slice(0, 8)}20`;
  const lastCloseFixed = d > 20 ? thisMonth20 : addMonths(thisMonth20, -1);
  const lastDue = addMonths(`${lastCloseFixed.slice(0, 8)}15`, 1);
  const lastPaid = lastDue < today; // already past due date → the demo user paid it

  const categories: Array<[string, number, number]> = [
    ["Groceries", 4_500, 9_000],
    ["Dining", 1_800, 6_500],
    ["Coffee", 450, 900],
    ["Transport", 1_200, 3_500],
    ["Shopping", 2_000, 7_000],
  ];
  const transactions: OneTimeTransaction[] = [];
  for (let i = 40; i >= 1; i--) {
    const count = rand() < 0.35 ? 0 : rand() < 0.6 ? 1 : 2;
    for (let k = 0; k < count; k++) {
      const [cat, lo, hi] = categories[Math.floor(rand() * categories.length)]!;
      const amount = Math.round((lo + rand() * (hi - lo)) / 25) * 25;
      transactions.push({
        id: `00000000-0000-4000-9000-${String(i * 10 + k).padStart(12, "0")}`,
        date: daysAgo(i),
        amountCents: amount,
        direction: "out",
        accountId: rand() < 0.55 ? ID.visa : ID.checking,
        description: cat === "Coffee" ? "Coffee" : `${cat}`,
        category: cat,
        status: "posted",
        cleared: true, // already in the demo balances
        flexible: true,
      });
    }
  }
  transactions.push({
    id: "00000000-0000-4000-9000-999999999999",
    date: today,
    amountCents: 1_250,
    direction: "out",
    accountId: ID.checking,
    description: "Lunch",
    category: "Dining",
    status: "posted",
    flexible: true,
  });

  return {
    profile: { displayName: "Alex (demo)", timezone: "America/New_York", onboardedAt: nowIso, hideAmounts: false, theme: "system" },
    settings: { ...DEFAULT_SETTINGS, cashFloorCents: 50_000 },
    accounts: [
      { id: ID.checking, name: "Everyday Checking", kind: "checking", balanceCents: 284_000, balanceAsOf: today, balanceSource: "manual", balanceUpdatedAt: hoursAgo(3), isSpendable: true },
      { id: ID.savings, name: "Emergency Savings", kind: "savings", balanceCents: 420_000, balanceAsOf: daysAgo(2), balanceSource: "manual", balanceUpdatedAt: hoursAgo(50), isSpendable: false },
      { id: ID.wedding, name: "Wedding Fund", kind: "savings", balanceCents: 960_000, balanceAsOf: daysAgo(2), balanceSource: "manual", balanceUpdatedAt: hoursAgo(50), isSpendable: false },
      {
        id: ID.visa, name: "Visa Rewards", kind: "credit_card", balanceCents: 124_000, balanceAsOf: today, balanceSource: "statement",
        balanceUpdatedAt: hoursAgo(3), isSpendable: false, creditLimitCents: 800_000, statementCloseDay: 20, paymentDueDay: 15,
        paymentAccountId: ID.checking, payInFull: true, aprBps: 2499,
      },
      { id: ID.carLoan, name: "Car Loan", kind: "loan", balanceCents: 1_120_000, balanceAsOf: daysAgo(5), balanceSource: "statement", balanceUpdatedAt: hoursAgo(120), isSpendable: false, aprBps: 690, minimumPaymentCents: 32_000 },
    ],
    rules: [
      { id: "00000000-0000-4000-a000-000000000001", name: "Paycheck", kind: "income", amountCents: 215_000, accountId: ID.checking, category: "Salary", schedule: { frequency: "biweekly", startDate: inDays(4) } },
      { id: "00000000-0000-4000-a000-000000000002", name: "Rent", kind: "bill", amountCents: 165_000, accountId: ID.checking, category: "Housing", schedule: { frequency: "monthly", startDate: daysAgo(60), dayOfMonth: 1, weekendAdjust: "before" } },
      { id: "00000000-0000-4000-a000-000000000003", name: "Electric & gas", kind: "bill", amountCents: 14_000, accountId: ID.checking, category: "Utilities", isEstimate: true, schedule: { frequency: "monthly", startDate: daysAgo(60), dayOfMonth: 18 } },
      { id: "00000000-0000-4000-a000-000000000004", name: "Phone", kind: "bill", amountCents: 6_500, accountId: ID.visa, category: "Utilities", schedule: { frequency: "monthly", startDate: daysAgo(60), dayOfMonth: 8 } },
      { id: "00000000-0000-4000-a000-000000000005", name: "Streaming", kind: "subscription", amountCents: 1_799, accountId: ID.visa, category: "Subscriptions", schedule: { frequency: "monthly", startDate: daysAgo(60), dayOfMonth: 22 } },
      { id: "00000000-0000-4000-a000-000000000006", name: "Gym", kind: "subscription", amountCents: 4_000, accountId: ID.visa, category: "Fitness", schedule: { frequency: "monthly", startDate: daysAgo(60), dayOfMonth: 3 } },
      { id: "00000000-0000-4000-a000-000000000007", name: "Car loan payment", kind: "loan_payment", amountCents: 32_000, accountId: ID.checking, toAccountId: ID.carLoan, category: "Debt", schedule: { frequency: "monthly", startDate: daysAgo(60), dayOfMonth: 12 } },
      { id: "00000000-0000-4000-a000-000000000008", name: "Wedding savings", kind: "savings_transfer", amountCents: 40_000, accountId: ID.checking, toAccountId: ID.wedding, category: "Savings", schedule: { frequency: "semimonthly", startDate: daysAgo(60), dayOfMonth: 15, secondDayOfMonth: -1 } },
      { id: "00000000-0000-4000-a000-000000000009", name: "Groceries (planned)", kind: "expense", amountCents: 12_000, accountId: ID.visa, category: "Groceries", isEstimate: true, schedule: { frequency: "weekly", startDate: inDays(2) } },
    ],
    overrides: [],
    transactions,
    transfers: [],
    statements: [
      { id: "00000000-0000-4000-b000-000000000001", accountId: ID.visa, closingDate: lastCloseFixed, statementBalanceCents: 86_000, minimumDueCents: 3_500, dueDate: lastDue, paidCents: lastPaid ? 86_000 : 0, status: lastPaid ? "paid" : "unpaid" },
    ],
    goals: [
      { id: "00000000-0000-4000-c000-000000000001", name: "Wedding", kind: "wedding", accountId: ID.wedding, targetCents: 2_500_000, targetDate: addDays(today, 300), monthlyContributionCents: 80_000, protected: true },
      { id: "00000000-0000-4000-c000-000000000002", name: "Emergency fund", kind: "emergency", accountId: ID.savings, targetCents: 600_000, protected: false },
    ],
    calendarSources: [
      { id: ID.calPersonal, name: "Personal", kind: "ics_url", enabled: true, lastStatus: "ok", lastSyncedAt: hoursAgo(1), lastAttemptAt: hoursAgo(1), lastError: null, eventCount: 6, urlHint: "calendar.example.com" },
      { id: ID.calShared, name: "Shared with Jordan", kind: "ics_url", enabled: true, lastStatus: "ok", lastSyncedAt: hoursAgo(2), lastAttemptAt: hoursAgo(2), lastError: null, eventCount: 3, urlHint: "calendar.example.com" },
    ],
    calendarEvents: [
      demoEvent("e1", ID.calPersonal, inDays(1), "Dinner with Sam"),
      demoEvent("e2", ID.calPersonal, inDays(2), "Team sync"),
      demoEvent("e3", ID.calShared, inDays(5), "Bridal shower for Priya"),
      demoEvent("e4", ID.calPersonal, inDays(8), "Concert: The Midnight Owls"),
      demoEvent("e5", ID.calShared, inDays(8), "Concert - The Midnight Owls"),
      demoEvent("e6", ID.calShared, inDays(11), "Cake tasting"),
      demoEvent("e7", ID.calPersonal, inDays(13), "Weekend trip to the lake"),
      demoEvent("e8", ID.calPersonal, inDays(16), "Pottery workshop"),
      // Further-out plans, so "skip a plan" has something real to suggest for later purchases.
      demoEvent("e9", ID.calShared, inDays(48), "Birthday dinner for Maya"),
      demoEvent("e10", ID.calPersonal, inDays(51), "Weekend getaway to the coast"),
    ],
    corrections: [
      { id: "00000000-0000-4000-d000-000000000001", kind: "event_estimate", matchKey: "dinner sam", value: { estimateCents: 7_000 }, updatedAt: hoursAgo(240) },
      { id: "00000000-0000-4000-d000-000000000002", kind: "event_estimate", matchKey: "cake tasting", value: { estimateCents: 0, notSpending: true }, updatedAt: hoursAgo(300) },
    ],
    decisions: [],
    scenarios: [],
  };
}

function demoEvent(key: string, sourceId: string, date: ISODate, title: string) {
  return {
    id: `00000000-0000-4000-e000-0000000000${key.slice(1).padStart(2, "0")}`,
    sourceId,
    externalUid: key,
    date,
    title,
    location: null,
    cancelled: false,
    estimateCents: null,
    estimateSource: null,
    estimateConfirmed: false,
    category: null,
    capCents: null,
    decision: null,
    essential: false,
    paymentAccountId: null,
    duplicateOf: null,
    duplicateConfirmed: false,
    notDuplicateOf: [],
    missingFromFeed: false,
    userCorrected: false,
  };
}
