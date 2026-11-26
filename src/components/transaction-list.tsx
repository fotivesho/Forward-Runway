"use client";

import { useState } from "react";
import { deleteTransaction } from "@/app/app/actions";
import { formatLong, formatShort, type ISODate } from "@/lib/dates";
import type { Account, OneTimeTransaction } from "@/lib/engine";
import { RuleForm, TransactionForm } from "./entity-forms";
import { addMonths } from "@/lib/dates";
import { QuickAction } from "./form";
import { Modal } from "./modal";
import { CategoryTrend } from "./spend-insights";
import type { CategoryBucket } from "@/lib/view/spend";
import { Money } from "./privacy";
import { Badge, Disclosure, EmptyState } from "./ui";
import { HistoryChart } from "./history-chart";
import { Info } from "./info";
import { txnHistory } from "@/lib/view/history";
import { APP_NAME } from "@/lib/brand";
import { Glyph } from "@/components/icon";
import { isNotSpending } from "@/lib/categories";


/** Every transaction, newest first, grouped by day. Category chips (with totals) filter the list. */
export function TransactionList({
  txns,
  accounts,
  today,
  monthStart,
  trends = {},
  categories = [],
}: {
  txns: OneTimeTransaction[];
  accounts: Account[];
  today: ISODate;
  monthStart: ISODate;
  /** Per category: spending by month and by week, shown when you tap the category. */
  trends?: Record<string, { month: CategoryBucket[]; week: CategoryBucket[] }>;
  /** Your categories, most used first. */
  categories?: string[];
}) {
  const [repeat, setRepeat] = useState(false);
  const [cat, setCat] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  // Show the latest days first; older ones a tap away.
  const [days, setDays] = useState(10);
  const name = (id: string) => accounts.find((a) => a.id === id)?.name ?? "Deleted account";
  const onCard = (id: string) => accounts.find((a) => a.id === id)?.kind === "credit_card";

  // Chips: this month's spending per category, biggest first.
  const totals = new Map<string, number>();
  for (const t of txns) {
    if (t.direction !== "out" || t.status !== "posted" || t.date < monthStart || t.date > today || isNotSpending(t.category)) continue;
    const c = t.category ?? "Other";
    totals.set(c, (totals.get(c) ?? 0) + t.amountCents);
  }
  const chips = [...totals.entries()].sort((a, b) => b[1] - a[1]);
  const shown = cat ? txns.filter((t) => (t.category ?? "Other") === cat) : txns;
  const current = open ? (txns.find((t) => t.id === open) ?? null) : null;
  const groups = new Map<ISODate, OneTimeTransaction[]>();
  for (const t of shown) groups.set(t.date, [...(groups.get(t.date) ?? []), t]);

  if (txns.length === 0) {
    return <EmptyState title="Nothing logged yet">Logging spending lets {APP_NAME} learn your pattern and recalculate today's cap.</EmptyState>;
  }
  return (
    <div>
      {chips.length > 0 && (
        <div className="-mx-1 mb-3 flex gap-1.5 overflow-x-auto px-1 pb-1" role="group" aria-label="Pick a category to see it over time (this month's totals)">
          <button type="button" onClick={() => setCat(null)} aria-pressed={cat === null} className={chip(cat === null)}>All</button>
          {chips.map(([c, cents]) => (
            <button key={c} type="button" onClick={() => setCat(cat === c ? null : c)} aria-pressed={cat === c} className={chip(cat === c)}>
              <Glyph name={c} size="xs" bare /> {c} <Money cents={cents} whole className="font-semibold" />
            </button>
          ))}
        </div>
      )}
      {cat && trends[cat] && <CategoryTrend category={cat} month={trends[cat].month} week={trends[cat].week} />}
      <div className="space-y-3">
        {[...groups.entries()].slice(0, days).map(([date, list]) => {
          const dayOut = list.filter((t) => t.direction === "out").reduce((s, t) => s + t.amountCents, 0);
          return (
            <section key={date} aria-label={formatLong(date)}>
              <h3 className="mb-1 flex justify-between text-sm font-bold text-ink">
                <span>{date === today ? "Today" : formatLong(date)}</span>
                {dayOut > 0 && <Money cents={-dayOut} sign />}
              </h3>
              <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
                {list.map((t) => (
                  <li key={t.id}>
                    <button type="button" onClick={() => setOpen(t.id)} aria-haspopup="dialog" className="flex w-full items-center gap-3 px-3 py-2 text-left transition hover:bg-surface-2/60">
                      <Glyph name={t.direction === "in" ? "income" : t.category} size="md" />
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
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
      {groups.size > days && (
        <button type="button" onClick={() => setDays((d) => d + 14)} className="btn btn-ghost mt-3 w-full">
          Show older · {groups.size - days} more day{groups.size - days === 1 ? "" : "s"}
        </button>
      )}
      {current && (
        <Modal
          open
          onClose={() => {
            setOpen(null);
            setRepeat(false);
          }}
          icon={current.direction === "in" ? "income" : (current.category ?? "spend")}
          tone={current.direction === "in" ? "in" : "out"}
          title={current.description}
          subtitle={
            <>
              <Money cents={current.direction === "in" ? current.amountCents : -current.amountCents} sign tone="auto" className="font-semibold" /> · {formatShort(current.date)} · {name(current.accountId)}
              <span className="mt-1 flex flex-wrap gap-1">
                {current.category && <Badge>{current.category}</Badge>}
                {current.status === "planned" && <Badge tone="info">Planned</Badge>}
                {current.cleared && <Badge title="Already reflected in the balance">In balance</Badge>}
                {current.isEstimate && <Badge tone="warn">Estimate</Badge>}
                {onCard(current.accountId) && current.direction === "out" && <Badge title="Paid later with the statement — never counted twice">Paid with the statement</Badge>}
              </span>
            </>
          }
        >
          {repeat ? (
            <>
              <RuleForm
                prefill={{
                  id: "",
                  name: current.description,
                  kind: current.direction === "in" ? "income" : "bill",
                  amountCents: current.amountCents,
                  accountId: current.accountId,
                  category: current.category ?? null,
                  schedule: { frequency: "monthly", startDate: addMonths(current.date, 1), dayOfMonth: Number(current.date.slice(8)), weekendAdjust: current.direction === "in" ? "before" : "none" },
                }}
                accounts={accounts}
                today={today}
                onDone={() => {
                  setOpen(null);
                  setRepeat(false);
                }}
              />
            </>
          ) : (
            <TxnBody key={current.id} txn={current} txns={txns} today={today} onRepeat={() => setRepeat(true)}>
              <TransactionForm key={current.id} accounts={accounts} today={today} txn={current} categories={categories} onDone={() => setOpen(null)} />
              <div className="mt-4 flex justify-end border-t border-line pt-4">
                <QuickAction action={deleteTransaction} fields={{ id: current.id }} variant="danger" confirm="Delete this transaction?">Delete transaction</QuickAction>
              </div>
            </TxnBody>
          )}
        </Modal>
      )}
    </div>
  );
}

/** Inside a transaction: every time it showed up and what's likely next, then the edit form folded away. */
function TxnBody({ txn, txns, today, onRepeat, children }: { txn: OneTimeTransaction; txns: OneTimeTransaction[]; today: ISODate; onRepeat: () => void; children: React.ReactNode }) {
  const h = txnHistory(txn, txns, today);
  const [sel, setSel] = useState<string | null>(h ? (h.bars.find((b) => b.kind === "now")?.key ?? h.bars.find((b) => b.key === txn.id)?.key ?? h.bars.filter((b) => b.kind === "past").at(-1)?.key ?? null) : null);
  const canRepeat = !isNotSpending(txn.category);
  return (
    <div className="space-y-4">
      {h ? (
        <section aria-label="This over time">
          <ul className="mb-3 grid grid-cols-3 gap-2 text-center">
            <Stat label="Usually" value={<Money cents={h.usualCents} whole={h.usualCents >= 10_000} />} />
            {h.unit === "month" ? (
              <>
                <Stat label="Last 90 days" value={`${h.count}×`} />
                <Stat label="A month" value={<>~<Money cents={h.perMonthCents ?? 0} whole /></>} />
              </>
            ) : (
              <>
                <Stat label="Times seen" value={`${h.count}`} />
                <Stat label="Comes" value={h.everyDays ? `~${h.everyDays}d` : "Now & then"} />
              </>
            )}
          </ul>
          <HistoryChart bars={h.bars} tone={txn.direction === "in" ? "in" : "out"} selected={sel} onSelect={setSel} />
          <p className="mt-2 text-xs text-faint">
            {h.unit === "month" ? "By month, with the rest of this month and next month predicted." : h.everyDays ? "Each time, with the next ones expected." : "Each time it showed up."}
            <Info label="Reading the chart">Every transaction with this name. Solid bars already happened. Dashed, shaded bars are what we expect next, from how often and how much it usually is. Your budget and safe-to-spend use the same prediction.</Info>
          </p>
        </section>
      ) : (
        <p className="rounded-2xl bg-surface-2/60 px-3 py-2 text-xs text-muted">First time we&apos;ve seen this. Once it shows up again, you&apos;ll see a history and what to expect next.</p>
      )}
      {canRepeat && !h?.perMonthCents && (
        <button type="button" onClick={onRepeat} className="flex w-full items-center gap-3 rounded-2xl border border-line px-3 py-2.5 text-left transition hover:border-brand/60">
          <Glyph name="🔁" size="sm" />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-ink">{h?.everyDays ? "Looks like it repeats" : "Does this repeat?"}</span>
            <span className="block text-xs text-muted">Add it as repeating so it&apos;s counted ahead</span>
          </span>
          <span aria-hidden className="text-faint">›</span>
        </button>
      )}
      <Disclosure summary="Edit category, name or amount">{children}</Disclosure>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <li className="rounded-xl bg-surface-2/60 px-1 py-2">
      <span className="block text-[11px] text-faint">{label}</span>
      <span className="block font-num text-lg leading-tight text-display">{value}</span>
    </li>
  );
}

const chip = (active: boolean) =>
  `inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs transition ${active ? "border-brand bg-brand text-brand-ink" : "border-line bg-surface text-muted hover:border-brand/60"}`;
