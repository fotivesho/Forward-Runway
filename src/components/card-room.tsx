"use client";

import { useState } from "react";
import { formatShort } from "@/lib/dates";
import type { CardRoom } from "@/lib/view/card-room";
import { Info } from "./info";
import { Money } from "./privacy";

/**
 * "Room for this bill": how big this card's bill can be and still be paid from cash and
 * paychecks, without savings. Each line adds up to the answer, then it's compared to the bill.
 */
export function CardRoomView({ rooms }: { rooms: CardRoom[] }) {
  const [i, setI] = useState(0);
  if (rooms.length === 0) return null;
  const r = rooms[Math.min(i, rooms.length - 1)]!;
  const fits = r.maxCents >= r.billCents;
  const gap = Math.abs(r.maxCents - r.billCents);
  return (
    <section className="rounded-2xl border border-line p-3.5" aria-label="Max bill">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center text-sm font-bold text-ink">
          Max bill without savings
          <Info label="Max bill">The biggest bill you can pay on its due date from your cash and paychecks, without moving money from savings. It counts every bill, card payment and plan before then, the everyday spending you usually do, what you&apos;ll still need afterwards until your next payday, and your cushion. It isn&apos;t your credit limit. What if uses this same number.</Info>
        </h3>
        {rooms.length > 1 && (
          <div role="group" aria-label="Which bill" className="flex rounded-full border border-line p-0.5">
            {rooms.map((x, k) => (
              <button key={x.due} type="button" onClick={() => setI(k)} aria-pressed={k === i} className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${k === i ? "bg-surface-3 text-ink" : "text-muted"}`}>
                Due {formatShort(x.due)}
              </button>
            ))}
          </div>
        )}
      </div>
      <p className="mt-2 text-sm">
        Max <Money cents={Math.max(0, r.maxCents)} whole className={`font-num text-2xl ${fits ? "text-display" : "text-warn"}`} /> on {formatShort(r.due)}
      </p>
      <p className={`text-xs ${fits ? "text-brand" : "text-warn"}`}>
        {r.projected ? "Expected bill" : "This bill"} <Money cents={r.billCents} whole /> ·{" "}
        {fits ? <>fits, with <Money cents={gap} whole /> to spare</> : <><Money cents={gap} whole /> more than cash allows: the rest would come from savings</>}
      </p>
      <details className="group mt-2">
        <summary className="cursor-pointer list-none text-xs font-semibold text-brand">How it adds up <span aria-hidden className="inline-block transition group-open:rotate-180">▾</span></summary>
        <dl className="mt-2 space-y-1 text-xs">
          {r.lines.map((l) => (
            <div key={l.label} className="flex justify-between gap-2">
              <dt className="text-muted">{l.label}{l.note ? <span className="text-faint"> · {l.note}</span> : null}</dt>
              <dd className="tabular text-ink"><Money cents={l.cents} whole sign /></dd>
            </div>
          ))}
          <div className="flex justify-between gap-2 border-t border-line pt-1 font-semibold">
            <dt className="text-ink">Max bill</dt>
            <dd className="tabular text-ink"><Money cents={r.maxCents} whole sign /></dd>
          </div>
        </dl>
      </details>
    </section>
  );
}
