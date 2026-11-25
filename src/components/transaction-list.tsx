"use client";

import { useState } from "react";
import { deleteTransaction } from "@/app/app/actions";
import { formatLong, type ISODate } from "@/lib/dates";
import type { Account, OneTimeTransaction } from "@/lib/engine";
import { TransactionForm } from "./entity-forms";
import { QuickAction } from "./form";
import { Money } from "./privacy";
import { Badge, EmptyState } from "./ui";
import { APP_NAME } from "@/lib/brand";
import { iconFor } from "@/lib/categories";


/** Every transaction, newest first, grouped by day. Category chips (with totals) filter the list. */
export function TransactionList({ txns, accounts, today, monthStart }: { txns: OneTimeTransaction[]; accounts: Account[]; today: ISODate; monthStart: ISODate }) {
  const [cat, setCat] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const name = (id: string) => accounts.find((a) => a.id === id)?.name ?? "Deleted account";
  const onCard = (id: string) => accounts.find((a) => a.id === id)?.kind === "credit_card";

  // Chips: this month's spending per category, biggest first.
  const totals = new Map<string, number>();
  for (const t of txns) {
    if (t.direction !== "out" || t.status !== "posted" || t.date < monthStart || t.date > today) continue;
    const c = t.category ?? "Other";
    totals.set(c, (totals.get(c) ?? 0) + t.amountCents);
  }
  const chips = [...totals.entries()].sort((a, b) => b[1] - a[1]);
  const shown = cat ? txns.filter((t) => (t.category ?? "Other") === cat) : txns;
  const groups = new Map<ISODate, OneTimeTransaction[]>();
  for (const t of shown) groups.set(t.date, [...(groups.get(t.date) ?? []), t]);

  if (txns.length === 0) {
    return <EmptyState title="Nothing logged yet">Logging spending lets {APP_NAME} learn your pattern and recalculate today's cap.</EmptyState>;
  }
  return (
    <div>
      {chips.length > 0 && (
        <div className="-mx-1 mb-3 flex gap-1.5 overflow-x-auto px-1 pb-1" role="group" aria-label="Filter by category (this month's totals)">
          <button type="button" onClick={() => setCat(null)} aria-pressed={cat === null} className={chip(cat === null)}>All</button>
          {chips.map(([c, cents]) => (
            <button key={c} type="button" onClick={() => setCat(cat === c ? null : c)} aria-pressed={cat === c} className={chip(cat === c)}>
              <span aria-hidden>{iconFor(c)}</span> {c} <Money cents={cents} whole className="font-semibold" />
            </button>
          ))}
        </div>
      )}
      <div className="space-y-3">
        {[...groups.entries()].map(([date, list]) => {
          const dayOut = list.filter((t) => t.direction === "out").reduce((s, t) => s + t.amountCents, 0);
          return (
            <section key={date} aria-label={formatLong(date)}>
              <h3 className="mb-1 flex justify-between text-xs font-semibold uppercase tracking-wide text-faint">
                <span>{date === today ? "Today" : formatLong(date)}</span>
                {dayOut > 0 && <Money cents={-dayOut} sign />}
              </h3>
              <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
                {list.map((t) => (
                  <li key={t.id}>
                    <button type="button" onClick={() => setOpen(open === t.id ? null : t.id)} aria-expanded={open === t.id} className="flex w-full items-center gap-3 px-3 py-2 text-left">
                      <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-3 text-base">{t.direction === "in" ? "💰" : iconFor(t.category)}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-ink">{t.description}</span>
                        <span className="block truncate text-xs text-muted">
                          {t.category ?? "Uncategorized"} · {name(t.accountId)}
                          {t.status === "planned" && " · planned"}
                          {onCard(t.accountId) && t.direction === "out" && " · on card"}
                        </span>
                      </span>
                      <Money cents={t.direction === "in" ? t.amountCents : -t.amountCents} sign tone="auto" className="shrink-0 text-sm font-semibold" />
                    </button>
                    {open === t.id && (
                      <div className="border-t border-line p-3">
                        <div className="mb-2 flex flex-wrap gap-1">
                          {t.cleared && <Badge title="Already reflected in the balance">In balance</Badge>}
                          {t.isEstimate && <Badge tone="warn">Estimate</Badge>}
                          {onCard(t.accountId) && t.direction === "out" && <Badge title="Paid later with the statement — never counted twice">Paid with the statement</Badge>}
                        </div>
                        <TransactionForm accounts={accounts} today={today} txn={t} />
                        <div className="mt-2 flex justify-end">
                          <QuickAction action={deleteTransaction} fields={{ id: t.id }} variant="danger" confirm="Delete this transaction?">Delete</QuickAction>
                        </div>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}

const chip = (active: boolean) =>
  `inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs transition ${active ? "border-brand bg-brand text-brand-ink" : "border-line bg-surface text-muted hover:border-brand/60"}`;
