"use client";

import { useState } from "react";
import { Modal } from "./modal";
import { Money } from "./privacy";

export interface AccountTile {
  id: string;
  name: string;
  icon: string;
  /** Signed: assets positive, what you owe negative. */
  cents: number | null;
  sub: React.ReactNode;
  /** Optional 0–100 bar (card: used of limit; goal: progress). */
  bar?: { pct: number; tone: "good" | "warn" | "bad" | "info" };
  tag?: string;
  warn?: boolean;
  /** What opens when you tap it. */
  detail: React.ReactNode;
}

const BAR = { good: "bg-brand", warn: "bg-warn", bad: "bg-danger", info: "bg-info" };

/** Accounts as tiles: the number first, one line under it, tap for everything else. */
export function AccountGrid({ tiles }: { tiles: AccountTile[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const cur = tiles.find((t) => t.id === open);
  return (
    <>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {tiles.map((t) => (
          <li key={t.id}>
            <button
              type="button"
              onClick={() => setOpen(t.id)}
              className={`flex h-full w-full flex-col rounded-2xl border bg-surface p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${t.warn ? "border-warn/60" : "border-line"}`}
            >
              <span className="flex items-center justify-between gap-1">
                <span aria-hidden className="text-lg">{t.icon}</span>
                {t.tag && <span className="rounded-full bg-surface-3 px-1.5 py-0.5 text-[10px] font-medium text-muted">{t.tag}</span>}
              </span>
              <span className="mt-1 truncate text-sm font-bold text-ink">{t.name}</span>
              <span className="text-xl font-extrabold tabular text-ink">
                {t.cents == null ? <span className="text-sm text-danger">No balance</span> : <Money cents={t.cents} whole sign={t.cents < 0} />}
              </span>
              {t.bar && (
                <span className="mt-1 block h-1.5 rounded-full bg-surface-3">
                  <span className={`block h-1.5 rounded-full ${BAR[t.bar.tone]}`} style={{ width: `${Math.max(2, Math.min(100, t.bar.pct))}%` }} />
                </span>
              )}
              <span className={`mt-1 truncate text-[11px] ${t.warn ? "text-warn" : "text-faint"}`}>{t.sub}</span>
            </button>
          </li>
        ))}
      </ul>
      {cur && (
        <Modal open onClose={() => setOpen(null)} icon={cur.icon} title={cur.name}>
          {cur.detail}
        </Modal>
      )}
    </>
  );
}

/** "+ Add" that opens its form in a pop-up. */
export function AddInModal({ label, title, icon, children }: { label: string; title: string; icon: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => setOpen(true)}>{label}</button>
      <Modal open={open} onClose={() => setOpen(false)} icon={icon} title={title}>
        {children}
      </Modal>
    </>
  );
}
