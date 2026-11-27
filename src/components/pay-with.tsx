"use client";

import { useContext, useState, useTransition } from "react";
import { saveEverydayPay } from "@/app/app/actions";
import { DemoCtx } from "./form";

/** "Everyday purchases go on": Auto (from your history), Debit, or a card. */
export function PayWith({ value, cards, auto }: { value: string; cards: Array<{ id: string; name: string }>; auto: string }) {
  const demo = useContext(DemoCtx);
  const [v, setV] = useState(value);
  const [busy, start] = useTransition();
  const opts = [{ id: "auto", name: `Auto · ${auto}` }, { id: "debit", name: "Debit (cash leaves the same day)" }, ...cards.map((c) => ({ id: c.id, name: `${c.name} (paid with the statement)` }))];
  return (
    <label className="block">
      <span className="sr-only">Everyday purchases go on</span>
      <select value={v} disabled={busy} onChange={(e) => { const n = e.target.value; setV(n); if (!demo) start(async () => { await saveEverydayPay(n); }); }} className="input w-full">
        {opts.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
      {demo && <span className="mt-1 block text-xs text-faint">Demo: not saved.</span>}
    </label>
  );
}
