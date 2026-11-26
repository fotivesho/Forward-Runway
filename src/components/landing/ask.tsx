"use client";

import { useState } from "react";

const QA: Array<{ q: string; a: React.ReactNode }> = [
  { q: "Is it free?", a: <>Yes. Runway Tomorrow is <b>free while it&apos;s in beta</b>. If that ever changes, you&apos;ll hear about it well ahead, and the basics stay free.</> },
  { q: "Is my bank login safe?", a: <>You sign in to your bank through <b>Plaid</b>, the service most finance apps use. Your password goes to your bank, never to us.</> },
  { q: "Can it move my money?", a: <><b>No.</b> The connection is read-only. It can see balances and purchases. It can&apos;t pay, transfer or change anything.</> },
  { q: "Who sees my data?", a: <><b>Only you.</b> The database itself enforces it, not just the app. Export it or delete it anytime from Settings.</> },
  { q: "Which banks work?", a: <>Most US banks and credit cards, through Plaid. No bank? You can type balances in and it still works.</> },
  { q: "No calendar?", a: <>Add plans in a couple of taps. And for everything you don&apos;t plan, it learns your habits and fills in the rest.</> },
  { q: "Is this budgeting?", a: <>Kind of, minus the chores. <b>No categories to set up, no rules, no guilt.</b> Just what&apos;s coming, what it costs, and what&apos;s safe today.</> },
];

/**
 * Questions people ask before connecting a bank, answered like a conversation: tap a question, the
 * answer appears. One small block instead of a long FAQ page.
 */
export function Ask() {
  const [i, setI] = useState(0);
  const item = QA[i]!;
  return (
    <div className="card mx-auto max-w-2xl p-4 sm:p-6">
      <div className="flex min-h-[7.5rem] items-start gap-3" aria-live="polite">
        <span aria-hidden className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#182d26]">
          <svg width="20" height="20" viewBox="0 0 30 30"><path d="M7 25 V15 Q7 8 14 8 H24" stroke="#ddefbf" strokeWidth="4.5" fill="none" strokeLinecap="round" /><path d="M21 5 L26 8 L21 11" stroke="#ddefbf" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </span>
        <div key={i} className="fade-up min-w-0">
          <p className="ml-auto mb-2 w-fit rounded-2xl rounded-tr-md bg-brand px-3 py-1.5 text-sm font-semibold text-brand-ink">{item.q}</p>
          <p className="rounded-2xl rounded-tl-md bg-surface-2/80 px-4 py-3 text-[15px] leading-relaxed text-ink">{item.a}</p>
        </div>
      </div>
      <div role="group" aria-label="Questions" className="mt-4 flex flex-wrap gap-1.5 border-t border-line pt-4">
        {QA.map((x, n) => (
          <button key={x.q} type="button" onClick={() => setI(n)} aria-pressed={n === i}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition sm:text-sm ${n === i ? "bg-ink text-bg" : "bg-surface-2 text-muted hover:text-ink"}`}>
            {x.q}
          </button>
        ))}
      </div>
    </div>
  );
}
