import { dayOfWeek, type ISODate } from "../dates";
import type { Cents } from "../money";
import { buildForecast } from "./forecast";
import { spendingBaseline } from "./spending";
import { everydayCash } from "./everyday-cash";
import type { EngineInput, Forecast } from "./types";

export interface CardRoomResult {
  due: ISODate;
  /** The bill as scheduled (actual statement, or the expected one if it hasn't closed). */
  billCents: Cents;
  projected: boolean;
  lines: Array<{ label: string; cents: Cents; note?: string }>;
  /** The biggest bill you can pay that day from cash and paychecks, without savings. Exactly the sum of `lines`. */
  maxCents: Cents;
}

/**
 * The one "max card bill" used everywhere (What if, Accounts, Forecast): your cash, plus paychecks
 * before the due date, minus every other bill, card payment and plan before then, the everyday
 * spending you usually do until then, what you'll still need afterwards until the next payday, and
 * your cushion. It never assumes the expected bill fits: if money is already short, max is lower.
 */
export function cardRoomFor(input: EngineInput, accountId: string, f: Forecast = buildForecast(input, 90)): CardRoomResult[] {
  const card = f.cards.find((c) => c.accountId === accountId);
  if (!card) return [];
  const base = spendingBaseline(input);
  const everydayOn = (d: ISODate) => (base.reliable ? base.byWeekday[dayOfWeek(d)]! : base.avgDailyCents);
  // When everyday spending leaves cash: debit the same day, card purchases on their statement's due date.
  const cash = everydayCash(input, f, everydayOn);
  const real = f.days.map((d, i) => d.closingCents - cash.cumulative[i]!);
  const out: CardRoomResult[] = [];
  for (const st of card.statements.filter((x) => x.dueDate >= input.today && x.dueDate <= f.endDate && x.autoPaymentCents > 0).slice(0, 2)) {
    const di = f.days.findIndex((d) => d.date === st.dueDate);
    if (di < 0) continue;
    const isBill = (it: { kind: string; postings: Array<{ accountId: string }>; date: ISODate }) => it.kind === "card_payment" && it.date === st.dueDate && it.postings.some((p) => p.accountId === accountId);
    // Everyday purchases you'll still make on this card before it closes land in this bill: count
    // them in the bill (like What if does), and not a second time as everyday spending.
    // Everyday purchases and plans you'll put on this card before it closes are in this bill: count
    // them there, and not a second time below.
    const onCard = Math.round(cash.onStatement.get(`${accountId}|${st.dueDate}`) ?? 0);
    const plansOnCard = Math.round(cash.plansOnStatement.get(`${accountId}|${st.dueDate}`) ?? 0);
    const bill = -f.days[di]!.items.filter(isBill).reduce((t, it) => t + it.cashEffectCents, 0) + onCard + plansOnCard;
    let paydays = 0;
    let bills = 0;
    let usual = 0;
    for (let i = 0; i <= di; i++) {
      const d = f.days[i]!;
      for (const it of d.items) {
        if (isBill(it)) continue;
        if (it.cashEffectCents > 0) paydays += it.cashEffectCents;
        else bills += -it.cashEffectCents;
      }
    }
    // Everyday spending that leaves cash by the due date, not counting what's inside this bill.
    const plansBy = Math.max(0, cash.plansCumulative[di]! - plansOnCard);
    usual = Math.max(0, cash.cumulative[di]! - cash.plansCumulative[di]! - onCard);
    const beforeBill = f.startingCashCents + paydays - bills - usual;
    const nextPay = f.days.findIndex((d, i) => i > di && d.items.some((it) => it.kind === "income" && it.cashEffectCents > 0));
    const until = nextPay < 0 ? Math.min(f.days.length - 1, di + 30) : nextPay - 1;
    const lowAfter = Math.min(...real.slice(di, Math.max(di, until) + 1));
    const stillNeeded = Math.max(0, beforeBill - bill - lowAfter);
    const lines = [
      { label: "Cash now", cents: f.startingCashCents },
      { label: `Paychecks by ${st.dueDate.slice(5).replace("-", "/")}`, cents: paydays },
      { label: "Bills & card payments before then", cents: -bills },
      { label: "Plans before then", cents: -plansBy },
      { label: "Everyday spending until then", cents: -Math.round(usual), note: onCard > 0 ? "usual, not counting what goes on this card" : "usual" },
      { label: nextPay < 0 ? "Still needed in the 30 days after" : "Still needed until the next payday", cents: -Math.round(stillNeeded) },
      { label: "Your cushion", cents: -f.floorCents },
    ];
    out.push({ due: st.dueDate, billCents: bill, projected: st.isProjected, lines, maxCents: lines.reduce((t, l) => t + l.cents, 0) });
  }
  return out;
}
