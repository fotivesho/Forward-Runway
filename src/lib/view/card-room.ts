/**
 * How big a card bill you can pay without touching savings: your cash, the paychecks before the
 * bill is due, minus every bill, card payment and plan before then, the everyday spending you'd
 * normally do, what you'll still need afterwards until the next payday, and your cushion.
 * Pure and deterministic; every line adds up to the answer.
 */
import type { ISODate } from "../dates";
import type { Cents } from "../money";
import { buildForecast } from "../engine";
import { toEngineInput, type Snapshot } from "../data/snapshot";
import { predict, spendModel } from "./patterns";

export interface CardRoom {
  due: ISODate;
  /** The bill as it stands (or as expected, if the statement hasn't closed). */
  billCents: Cents;
  projected: boolean;
  lines: Array<{ label: string; cents: Cents; note?: string }>;
  /** The biggest bill you could pay that day from cash alone. */
  roomCents: Cents;
}

export function cardRoom(s: Snapshot, today: ISODate, accountId: string): CardRoom[] {
  const f = buildForecast(toEngineInput(s, today), 90);
  const card = f.cards.find((c) => c.accountId === accountId);
  if (!card) return [];
  const m = spendModel(s, today);
  const usual = m ? predict(m, today, f.endDate).byDay : {};
  // Your balance each night with everyday spending in it (the same line Forecast draws).
  let everyday = 0;
  const real = f.days.map((d) => d.closingCents - (everyday += usual[d.date] ?? 0));
  const out: CardRoom[] = [];
  for (const st of card.statements.filter((x) => x.dueDate >= today && x.dueDate <= f.endDate && x.autoPaymentCents > 0).slice(0, 2)) {
    const di = f.days.findIndex((d) => d.date === st.dueDate);
    if (di < 0) continue;
    const isBill = (it: { kind: string; postings: Array<{ accountId: string }>; date: ISODate }) => it.kind === "card_payment" && it.date === st.dueDate && it.postings.some((p) => p.accountId === accountId);
    const bill = -f.days[di]!.items.filter(isBill).reduce((t, it) => t + it.cashEffectCents, 0);
    // Up to and including the due date, everything except this bill.
    let paydays = 0;
    let bills = 0;
    let usualSpend = 0;
    for (let i = 0; i <= di; i++) {
      const d = f.days[i]!;
      for (const it of d.items) {
        if (isBill(it)) continue;
        if (it.cashEffectCents > 0) paydays += it.cashEffectCents;
        else bills += -it.cashEffectCents;
      }
      usualSpend += usual[d.date] ?? 0;
    }
    const beforeBill = f.startingCashCents + paydays - bills - usualSpend;
    // Afterwards: the lowest your balance gets until the next payday (or 30 days), with this bill paid.
    const nextPay = f.days.findIndex((d, i) => i > di && d.items.some((it) => it.kind === "income" && it.cashEffectCents > 0));
    const until = nextPay < 0 ? Math.min(f.days.length - 1, di + 30) : nextPay - 1;
    const lowAfter = Math.min(...real.slice(di, Math.max(di, until) + 1));
    const stillNeeded = Math.max(0, beforeBill - bill - lowAfter);
    const lines = [
      { label: "Cash now", cents: f.startingCashCents },
      { label: `Paychecks by ${st.dueDate.slice(5).replace("-", "/")}`, cents: paydays },
      { label: "Bills, card payments & plans before then", cents: -bills },
      { label: "Everyday spending until then", cents: -Math.round(usualSpend), note: "usual" },
      { label: nextPay < 0 ? "Still needed in the 30 days after" : "Still needed until the next payday", cents: -Math.round(stillNeeded) },
      { label: "Your cushion", cents: -f.floorCents },
    ];
    out.push({
      due: st.dueDate,
      billCents: bill,
      projected: st.isProjected,
      lines,
      // The answer is exactly the sum of the lines shown.
      roomCents: lines.reduce((t, l) => t + l.cents, 0),
    });
  }
  return out;
}
