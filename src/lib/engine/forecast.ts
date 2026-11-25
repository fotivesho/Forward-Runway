import { addDays, clampedDay, diffDays, formatShort, parts, type ISODate } from "../dates";
import { formatCents, type Cents } from "../money";
import { ruleOccurrences, rawOccurrences } from "./schedule";
import type {
  Account,
  CardProjection,
  EngineInput,
  Forecast,
  ForecastDay,
  ForecastIssue,
  ForecastItem,
  Posting,
} from "./types";

export const HORIZONS = [30, 60, 90] as const;

export function isLiability(a: Pick<Account, "kind">): boolean {
  return a.kind === "credit_card" || a.kind === "loan";
}

/** Cards and loans can never be spendable, whatever the stored flag says. */
export function isCash(a: Account): boolean {
  return !a.archived && a.isSpendable && !isLiability(a);
}

/** Engine "value" of an account: assets positive, liabilities negative. */
export function accountValue(a: Account): Cents {
  const b = a.balanceCents ?? 0;
  return isLiability(a) ? -b : b;
}

export function primaryCashAccount(accounts: Account[]): Account | undefined {
  const cash = accounts.filter(isCash);
  return cash.find((a) => a.kind === "checking") ?? cash[0];
}

interface BuildOptions {
  /** Extra items (scenarios, hypothetical purchases) merged before card projection. */
  extraItems?: ForecastItem[];
  /** Reserve planned monthly goal contributions that no transfer rule funds yet. Default true. */
  includeGoalReserves?: boolean;
}

/**
 * Build a deterministic day-by-day cash forecast.
 *
 * The horizon includes today: a 30-day forecast covers today and the next 29 days.
 */
export function buildForecast(input: EngineInput, horizonDays: number, options: BuildOptions = {}): Forecast {
  const start = input.today;
  const end = addDays(start, Math.max(1, horizonDays) - 1);
  const accounts = input.accounts.filter((a) => !a.archived);
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const cashIds = new Set(accounts.filter(isCash).map((a) => a.id));
  const primary = primaryCashAccount(accounts);
  const assumptions: string[] = [];

  /** Effective "as of" for each account: postings before it are already in the balance. */
  const asOf = new Map<string, ISODate>();
  for (const a of accounts) {
    const d = a.balanceAsOf && a.balanceAsOf <= start ? a.balanceAsOf : start;
    asOf.set(a.id, d);
  }
  const windowStart = [...asOf.values()].reduce((m, d) => (d < m ? d : m), start);

  const cashEffect = (postings: Posting[]) =>
    postings.reduce((s, p) => s + (cashIds.has(p.accountId) ? p.deltaCents : 0), 0);

  const items: ForecastItem[] = [];
  const push = (item: Omit<ForecastItem, "cashEffectCents">) => {
    // Drop postings against accounts that don't exist (archived / deleted).
    const postings = item.postings.filter((p) => byId.has(p.accountId) && p.deltaCents !== 0);
    if (postings.length === 0) return;
    items.push({ ...item, postings, cashEffectCents: cashEffect(postings) });
  };

  // --- Recurring rules -----------------------------------------------------
  for (const rule of input.rules) {
    for (const occ of ruleOccurrences(rule, input.overrides, windowStart, end)) {
      if (occ.posted) continue;
      const amt = occ.amountCents;
      let postings: Posting[];
      if (rule.toAccountId) {
        postings = [
          { accountId: rule.accountId, deltaCents: -amt },
          { accountId: rule.toAccountId, deltaCents: amt },
        ];
      } else if (rule.kind === "income") {
        postings = [{ accountId: rule.accountId, deltaCents: amt }];
      } else {
        postings = [{ accountId: rule.accountId, deltaCents: -amt }];
      }
      const acct = byId.get(rule.accountId);
      push({
        id: `rule:${rule.id}:${occ.originalDate}`,
        date: occ.date,
        label: rule.name,
        kind: !rule.toAccountId && acct?.kind === "credit_card" && rule.kind !== "income" ? "card_purchase" : rule.kind,
        source: "rule",
        sourceId: rule.id,
        category: rule.category ?? null,
        postings,
        isEstimate: !!rule.isEstimate,
        movedFrom: occ.movedFrom,
        note: occ.note ?? undefined,
      });
    }
  }

  // --- One-time transactions ------------------------------------------------
  for (const t of input.transactions) {
    if (t.cleared || t.date < windowStart || t.date > end) continue;
    const acct = byId.get(t.accountId);
    const delta = t.direction === "in" ? t.amountCents : -t.amountCents;
    push({
      id: `txn:${t.id}`,
      date: t.date,
      label: t.description,
      kind:
        acct?.kind === "credit_card"
          ? t.direction === "out"
            ? "card_purchase"
            : "refund"
          : t.direction === "in"
            ? "income"
            : "expense",
      source: "one_time",
      sourceId: t.id,
      category: t.category ?? null,
      postings: [{ accountId: t.accountId, deltaCents: delta }],
      isEstimate: !!t.isEstimate || t.status === "planned",
    });
  }

  // --- One-time transfers ---------------------------------------------------
  for (const tr of input.transfers) {
    if (tr.cleared || tr.date < windowStart || tr.date > end) continue;
    const to = byId.get(tr.toAccountId);
    push({
      id: `xfer:${tr.id}`,
      date: tr.date,
      label: tr.note || `Transfer to ${to?.name ?? "account"}`,
      kind: to?.kind === "credit_card" ? "card_payment" : to?.kind === "loan" ? "loan_payment" : "transfer",
      source: "transfer",
      sourceId: tr.id,
      postings: [
        { accountId: tr.fromAccountId, deltaCents: -tr.amountCents },
        { accountId: tr.toAccountId, deltaCents: tr.amountCents },
      ],
      isEstimate: tr.status === "planned",
    });
  }

  // --- Goal reserves (planned contributions with no transfer scheduled) -------
  if (options.includeGoalReserves !== false && primary) {
    for (const g of input.goals) {
      const contribution = g.monthlyContributionCents ?? 0;
      if (contribution <= 0 || !g.accountId || !byId.has(g.accountId)) continue;
      const funded = input.rules.some((r) => r.active !== false && r.toAccountId === g.accountId);
      if (funded) continue;
      const firsts = rawOccurrences({ frequency: "monthly", startDate: addDays(start, 1), dayOfMonth: 1 }, start, end);
      for (const d of firsts) {
        push({
          id: `goal:${g.id}:${d}`,
          date: d,
          label: `Set aside for ${g.name}`,
          kind: "goal_reserve",
          source: "goal_reserve",
          sourceId: g.id,
          category: "Savings",
          postings: [
            { accountId: primary.id, deltaCents: -contribution },
            { accountId: g.accountId, deltaCents: contribution },
          ],
          isEstimate: true,
        });
      }
      if (firsts.length) {
        assumptions.push(
          `${g.name}: reserving ${formatCents(contribution)} on the 1st of each month (planned contribution; no transfer is scheduled yet).`,
        );
      }
    }
  }

  for (const extra of options.extraItems ?? []) push(extra);

  // --- Opening values (balance + anything between "as of" and today) ---------
  const opening: Record<string, Cents> = {};
  for (const a of accounts) opening[a.id] = accountValue(a);
  let gapCount = 0;
  let gapCash = 0;
  for (const it of items) {
    if (it.date >= start) continue;
    let touchedCash = false;
    for (const p of it.postings) {
      const since = asOf.get(p.accountId);
      if (since && it.date >= since) {
        opening[p.accountId] = (opening[p.accountId] ?? 0) + p.deltaCents;
        if (cashIds.has(p.accountId)) {
          gapCash += p.deltaCents;
          touchedCash = true;
        }
      }
    }
    if (touchedCash) gapCount++;
  }

  // --- Credit cards: statements, projected statements, payments --------------
  const issues: ForecastIssue[] = [];
  const cards: CardProjection[] = [];
  for (const card of accounts.filter((a) => a.kind === "credit_card")) {
    const proj = projectCard(card, items, input, start, end, -(opening[card.id] ?? 0), primary, issues, assumptions);
    cards.push(proj.projection);
    for (const auto of proj.autoItems) push(auto);
  }

  // --- Day-by-day ledger ------------------------------------------------------
  const future = items.filter((i) => i.date >= start).sort(itemOrder);
  const byDate = new Map<ISODate, ForecastItem[]>();
  for (const it of future) {
    const list = byDate.get(it.date) ?? [];
    list.push(it);
    byDate.set(it.date, list);
  }

  const running: Record<string, Cents> = { ...opening };
  const startingCash = sumCash(running, cashIds);
  const floor = input.settings.cashFloorCents;
  const days: ForecastDay[] = [];
  let cash = startingCash;
  let totalIn = 0;
  let totalOut = 0;
  let lowest = { date: start, cents: Number.POSITIVE_INFINITY };
  let firstBelowFloor: ISODate | null = null;
  let firstNegative: ISODate | null = null;

  for (let d = start; d <= end; d = addDays(d, 1)) {
    const todays = byDate.get(d) ?? [];
    const openingCash = cash;
    let inflow = 0;
    let outflow = 0;
    const cashItems: ForecastItem[] = [];
    const nonCash: ForecastItem[] = [];
    for (const it of todays) {
      for (const p of it.postings) running[p.accountId] = (running[p.accountId] ?? 0) + p.deltaCents;
      if (it.cashEffectCents > 0) inflow += it.cashEffectCents;
      else if (it.cashEffectCents < 0) outflow += -it.cashEffectCents;
      (it.cashEffectCents !== 0 ? cashItems : nonCash).push(it);
    }
    cash = openingCash + inflow - outflow;
    totalIn += inflow;
    totalOut += outflow;
    if (cash < lowest.cents) lowest = { date: d, cents: cash };
    if (cash < floor && !firstBelowFloor) firstBelowFloor = d;
    if (cash < 0 && !firstNegative) firstNegative = d;
    days.push({
      date: d,
      openingCents: openingCash,
      inflowsCents: inflow,
      outflowsCents: outflow,
      closingCents: cash,
      items: cashItems,
      nonCashItems: nonCash,
      belowFloor: cash < floor,
      negative: cash < 0,
    });
  }

  // --- Freshness, completeness, assumptions -------------------------------------
  if (gapCount > 0) {
    assumptions.push(
      `${gapCount} scheduled item${gapCount === 1 ? "" : "s"} dated between your last balance update and today ${
        gapCount === 1 ? "is" : "are"
      } assumed to have happened as planned (net ${formatCents(gapCash, { sign: true })}). Update balances or mark items as already posted to remove this assumption.`,
    );
    issues.push({
      code: "balance_gap",
      severity: "info",
      makesIncomplete: false,
      message: `${gapCount} item${gapCount === 1 ? "" : "s"} since your last balance update are assumed to have posted.`,
    });
  }
  issues.push(...completenessIssues(input, start, end, items, cashIds));
  const estimateCount = future.filter((i) => i.isEstimate && i.cashEffectCents !== 0).length;
  if (estimateCount > 0) {
    issues.push({
      code: "estimates_present",
      severity: "info",
      makesIncomplete: false,
      message: `${estimateCount} cash item${estimateCount === 1 ? " is an estimate" : "s are estimates"}, not confirmed amounts.`,
    });
  }
  assumptions.push(
    "Balances are treated as the opening balance at the start of their \"as of\" date.",
    `Cash = ${accounts.filter(isCash).map((a) => a.name).join(", ") || "no accounts yet"}. Savings, cards and loans are tracked separately and never counted as spendable cash.`,
    "Card purchases only reduce cash when the card is paid; payments are scheduled on statement due dates.",
  );

  const closing: Record<string, Cents> = { ...running };
  return {
    startDate: start,
    endDate: end,
    horizonDays: days.length,
    cashAccountIds: [...cashIds],
    startingCashCents: startingCash,
    endingCashCents: cash,
    totalInflowsCents: totalIn,
    totalOutflowsCents: totalOut,
    lowest: Number.isFinite(lowest.cents) ? lowest : { date: start, cents: startingCash },
    firstBelowFloor,
    firstNegative,
    floorCents: floor,
    days,
    openingByAccount: opening,
    closingByAccount: closing,
    cards,
    assumptions,
    issues: sortIssues(issues),
    complete: !issues.some((i) => i.makesIncomplete),
  };
}

function sumCash(values: Record<string, Cents>, cashIds: Set<string>): Cents {
  let s = 0;
  for (const id of cashIds) s += values[id] ?? 0;
  return s;
}

const KIND_ORDER: Record<string, number> = { income: 0, refund: 1 };
function itemOrder(a: ForecastItem, b: ForecastItem): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  // Inflows first within a day, then larger outflows first; tie-break on id for determinism.
  const ka = KIND_ORDER[a.kind] ?? 2;
  const kb = KIND_ORDER[b.kind] ?? 2;
  if (ka !== kb) return ka - kb;
  if (a.cashEffectCents !== b.cashEffectCents) return b.cashEffectCents - a.cashEffectCents;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

const SEVERITY_RANK = { critical: 0, warning: 1, info: 2 } as const;
export function sortIssues(issues: ForecastIssue[]): ForecastIssue[] {
  return [...issues].sort(
    (a, b) =>
      SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
      Number(b.makesIncomplete) - Number(a.makesIncomplete),
  );
}

/** The single most important question to ask the user next, if any. */
export function topQuestion(issues: ForecastIssue[]): ForecastIssue | null {
  return sortIssues(issues).find((i) => i.question) ?? null;
}

// ---------------------------------------------------------------------------
// Credit cards
// ---------------------------------------------------------------------------

/** First date strictly after `after` whose day-of-month is `day` (clamped to month end). */
export function nextDayOfMonthAfter(after: ISODate, day: number): ISODate {
  const { y, m } = parts(after);
  const same = clampedDay(y, m, day);
  if (same > after) return same;
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return clampedDay(ny, nm, day);
}

interface CardStmt {
  closingDate: ISODate;
  dueDate: ISODate;
  balanceCents: Cents;
  paidCents: Cents; // known paid before forecast
  allocatedCents: Cents; // explicit scheduled payments in window
  isProjected: boolean;
  statementId?: string;
  minimumDueCents?: Cents | null;
}

function projectCard(
  card: Account,
  items: ForecastItem[],
  input: EngineInput,
  start: ISODate,
  end: ISODate,
  owedAtStart: Cents,
  primary: Account | undefined,
  issues: ForecastIssue[],
  assumptions: string[],
): { projection: CardProjection; autoItems: Omit<ForecastItem, "cashEffectCents">[] } {
  const payFrom = (card.paymentAccountId && input.accounts.find((a) => a.id === card.paymentAccountId && !a.archived)) || primary;
  const payInFull = card.payInFull !== false;
  const known = input.statements
    .filter((s) => s.accountId === card.id)
    .sort((a, b) => (a.closingDate < b.closingDate ? -1 : 1));
  const lastKnown = known[known.length - 1];

  let closeDay = card.statementCloseDay ?? null;
  let dueDay = card.paymentDueDay ?? null;
  if (closeDay == null && lastKnown) closeDay = parts(lastKnown.closingDate).d;
  if (dueDay == null && lastKnown) dueDay = parts(lastKnown.dueDate).d;

  // Charges (purchases minus refunds) and explicit payments on this card, from today on.
  const charges: Array<{ date: ISODate; cents: Cents }> = [];
  const payments: Array<{ date: ISODate; cents: Cents; left: Cents }> = [];
  for (const it of items) {
    if (it.date < start) continue;
    for (const p of it.postings) {
      if (p.accountId !== card.id) continue;
      const isPayment = p.deltaCents > 0 && (it.source === "rule" || it.source === "transfer");
      if (isPayment) payments.push({ date: it.date, cents: p.deltaCents, left: p.deltaCents });
      else charges.push({ date: it.date, cents: -p.deltaCents });
    }
  }
  payments.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const projectedChargesCents = charges.filter((c) => c.date <= end).reduce((s, c) => s + c.cents, 0);

  const stmts: CardStmt[] = known
    .filter((s) => s.status !== "paid" && s.statementBalanceCents - s.paidCents > 0)
    .map((s) => ({
      closingDate: s.closingDate,
      dueDate: s.dueDate,
      balanceCents: s.statementBalanceCents,
      paidCents: s.paidCents,
      allocatedCents: 0,
      isProjected: false,
      statementId: s.id,
      minimumDueCents: s.minimumDueCents,
    }));
  const knownRemaining = stmts.reduce((s, x) => s + (x.balanceCents - x.paidCents), 0);
  let unbilled = owedAtStart - knownRemaining;

  const allocate = (pay: { date: ISODate; left: Cents }) => {
    for (const s of stmts) {
      if (pay.left <= 0) return;
      if (!(pay.date > s.closingDate && pay.date <= s.dueDate)) continue;
      const remaining = s.balanceCents - s.paidCents - s.allocatedCents;
      if (remaining <= 0) continue;
      const take = Math.min(remaining, pay.left);
      s.allocatedCents += take;
      pay.left -= take;
    }
  };

  let payIdx = 0;
  const processPaymentsThrough = (date: ISODate) => {
    while (payIdx < payments.length && payments[payIdx]!.date <= date) {
      const pay = payments[payIdx]!;
      allocate(pay);
      if (pay.left > 0) {
        unbilled -= pay.left; // pays down the balance that will be on the next statement
        pay.left = 0;
      }
      payIdx++;
    }
  };

  if (closeDay != null) {
    const dueFor = (close: ISODate) => (dueDay != null ? nextDayOfMonthAfter(close, dueDay) : addDays(close, 25));
    let boundary: ISODate = lastKnown && lastKnown.closingDate >= addDays(start, -1) ? lastKnown.closingDate : addDays(start, -1);
    // Project statements whose due date can fall inside the horizon.
    for (let close = nextDayOfMonthAfter(boundary, closeDay); close <= end; close = nextDayOfMonthAfter(close, closeDay)) {
      processPaymentsThrough(close);
      const cycleCharges = charges.filter((c) => c.date > boundary && c.date <= close).reduce((s, c) => s + c.cents, 0);
      const balance = unbilled + cycleCharges;
      unbilled = balance < 0 ? balance : 0; // a credit carries forward
      stmts.push({
        closingDate: close,
        dueDate: dueFor(close),
        balanceCents: Math.max(0, balance),
        paidCents: 0,
        allocatedCents: 0,
        isProjected: true,
      });
      boundary = close;
    }
    if (dueDay == null && owedAtStart > 0) {
      assumptions.push(`${card.name}: due date unknown, assumed 25 days after each statement closes.`);
    }
  } else if (owedAtStart > 0 && !lastKnown) {
    // No dates at all: assume the whole balance is due in 25 days (estimate) and ask.
    const due = addDays(start, 24);
    stmts.push({
      closingDate: addDays(start, -1),
      dueDate: due,
      balanceCents: owedAtStart,
      paidCents: 0,
      allocatedCents: 0,
      isProjected: true,
    });
    unbilled = 0;
    assumptions.push(
      `${card.name}: statement dates unknown, so the full ${formatCents(owedAtStart)} balance is assumed due ${formatShort(due)}.`,
    );
  }
  processPaymentsThrough(end);

  const autoItems: Omit<ForecastItem, "cashEffectCents">[] = [];
  const projection: CardProjection = {
    accountId: card.id,
    name: card.name,
    currentOwedCents: owedAtStart,
    creditLimitCents: card.creditLimitCents ?? null,
    statements: [],
    projectedChargesCents,
  };

  for (const s of stmts) {
    const remaining = s.balanceCents - s.paidCents - s.allocatedCents;
    let auto = 0;
    const overdue = s.dueDate < start;
    const payDate = overdue ? start : s.dueDate;
    if (remaining > 0 && payFrom && input.settings.autoPayStatements && payDate <= end) {
      if (payInFull) {
        auto = remaining;
      } else {
        const min = s.minimumDueCents ?? Math.max(2_500, Math.round(s.balanceCents * 0.02));
        auto = Math.max(0, Math.min(remaining, min - s.paidCents - s.allocatedCents));
      }
      if (auto > 0) {
        autoItems.push({
          id: `card:${card.id}:${s.closingDate}`,
          date: payDate,
          label: `${card.name} ${payInFull ? "statement payment (in full)" : "minimum payment"}${overdue ? " — overdue" : ""}`,
          kind: "card_payment",
          source: s.isProjected ? "card_projected" : "card_statement",
          sourceId: s.statementId ?? card.id,
          category: "Card payment",
          postings: [
            { accountId: payFrom.id, deltaCents: -auto },
            { accountId: card.id, deltaCents: auto },
          ],
          isEstimate: s.isProjected,
          note: s.isProjected
            ? `Projected statement closing ${formatShort(s.closingDate)}`
            : `Statement closed ${formatShort(s.closingDate)}`,
        });
      }
    }
    if (overdue && remaining > 0) {
      issues.push({
        code: "card_no_statement",
        severity: "warning",
        makesIncomplete: true,
        accountId: card.id,
        message: `${card.name} statement was due ${formatShort(s.dueDate)} and isn't marked paid.`,
        question: `Did you pay the ${card.name} statement that was due ${formatShort(s.dueDate)}?`,
      });
    }
    projection.statements.push({
      closingDate: s.closingDate,
      dueDate: s.dueDate,
      balanceCents: s.balanceCents,
      paidOrScheduledCents: s.paidCents + s.allocatedCents,
      autoPaymentCents: auto,
      isProjected: s.isProjected,
      status: s.isProjected ? "projected" : s.paidCents > 0 ? "partial" : "unpaid",
      statementId: s.statementId,
    });
  }
  if (!payInFull && stmts.length) {
    assumptions.push(`${card.name}: set to pay less than the full statement, so interest will accrue.`);
  }
  return { projection, autoItems };
}

// ---------------------------------------------------------------------------
// Completeness
// ---------------------------------------------------------------------------

function completenessIssues(
  input: EngineInput,
  start: ISODate,
  end: ISODate,
  items: ForecastItem[],
  cashIds: Set<string>,
): ForecastIssue[] {
  const out: ForecastIssue[] = [];
  const accounts = input.accounts.filter((a) => !a.archived);
  const stale = input.settings.staleAfterDays;

  if (cashIds.size === 0) {
    out.push({
      code: "no_cash_account",
      severity: "critical",
      makesIncomplete: true,
      message: "No spendable cash account yet.",
      question: "Which account do your bills come out of, and what's in it right now?",
    });
  }
  for (const a of accounts) {
    if (!cashIds.has(a.id) && a.kind !== "credit_card") continue;
    if (a.balanceCents == null) {
      out.push({
        code: "missing_balance",
        severity: "critical",
        makesIncomplete: true,
        accountId: a.id,
        message: `${a.name} has no balance.`,
        question:
          a.kind === "credit_card" ? `How much do you currently owe on ${a.name}?` : `What is the current balance of ${a.name}?`,
      });
      continue;
    }
    const age = a.balanceAsOf ? diffDays(a.balanceAsOf, start) : Infinity;
    const limit = a.kind === "credit_card" ? Math.max(stale, 7) : stale;
    if (age > limit) {
      out.push({
        code: a.kind === "credit_card" ? "card_stale_balance" : "stale_balance",
        severity: "warning",
        makesIncomplete: true,
        accountId: a.id,
        message: `${a.name} balance is ${Number.isFinite(age) ? `${age} days old` : "undated"}.`,
        question: a.kind === "credit_card" ? `What's the current balance owed on ${a.name}?` : `What's in ${a.name} today?`,
      });
    }
  }

  const incomeAhead = items.some(
    (i) => i.date >= start && i.date <= addDays(start, 45) && i.kind === "income" && i.cashEffectCents > 0,
  );
  const hasIncomeRule = input.rules.some((r) => r.active !== false && r.kind === "income");
  if (!incomeAhead) {
    out.push({
      code: "no_income",
      severity: hasIncomeRule ? "warning" : "critical",
      makesIncomplete: true,
      message: hasIncomeRule ? "No income lands in your cash accounts in the next 45 days." : "No income has been added.",
      question: "When is your next payday, and about how much will it be?",
    });
  }

  for (const c of accounts.filter((a) => a.kind === "credit_card")) {
    const owed = c.balanceCents ?? 0;
    const cardStatements = input.statements.filter((s) => s.accountId === c.id);
    const hasDates = (c.statementCloseDay != null && c.paymentDueDay != null) || cardStatements.length > 0;
    if (!hasDates && (owed > 0 || items.some((i) => i.postings.some((p) => p.accountId === c.id)))) {
      out.push({
        code: "card_missing_dates",
        severity: "critical",
        makesIncomplete: true,
        accountId: c.id,
        message: `${c.name} is missing its statement closing day and due day.`,
        question: `On what day of the month does ${c.name} close its statement, and when is the payment due?`,
      });
    } else if (owed > 0) {
      const latest = cardStatements.reduce<string | null>((m, s) => (!m || s.closingDate > m ? s.closingDate : m), null);
      if (!latest || diffDays(latest, start) > 40) {
        out.push({
          code: "card_no_statement",
          severity: "warning",
          makesIncomplete: false,
          accountId: c.id,
          message: `No recent ${c.name} statement; the next payment is estimated from the current balance.`,
          question: `What was the balance on your latest ${c.name} statement, and when is it due?`,
        });
      }
    }
  }

  for (const g of input.goals) {
    if (!g.accountId) {
      out.push({
        code: "goal_no_account",
        severity: "info",
        makesIncomplete: false,
        goalId: g.id,
        message: `${g.name} isn't linked to a savings account, so progress can't be tracked.`,
        question: `Which account holds the money for ${g.name}?`,
      });
    }
  }
  void end;
  return out;
}
