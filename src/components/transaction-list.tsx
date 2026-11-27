"use client";

import { useContext, useState, useTransition } from "react";
import { Search } from "lucide-react";
import { deleteTransaction, setTransactionCategory } from "@/app/app/actions";
import { formatLong, formatShort, type ISODate } from "@/lib/dates";
import type { Account, OneTimeTransaction } from "@/lib/engine";
import { RuleForm, TransactionForm } from "./entity-forms";
import { addMonths } from "@/lib/dates";
import { DemoCtx, QuickAction } from "./form";
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
import { CATEGORY_LIST, isNotSpending } from "@/lib/categories";


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
  const [cat, setCatRaw] = useState<string | null>(null);
  const [period, setPeriod] = useState<{ start: ISODate; end: ISODate; label: string } | null>(null);
  const [q, setQ] = useState("");
  const setCat = (c: string | null) => { setCatRaw(c); setPeriod(null); };
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
  const query = q.trim().toLowerCase();
  const matches = (t: OneTimeTransaction) =>
    !query ||
    t.description.toLowerCase().includes(query) ||
    (t.category ?? "").toLowerCase().includes(query) ||
    name(t.accountId).toLowerCase().includes(query) ||
    (/^[\d.,$]+$/.test(query) && (t.amountCents / 100).toFixed(2).includes(query.replace(/[$,]/g, "")));
  const shown = txns.filter((t) => (!cat || (t.category ?? "Other") === cat) && (!period || (t.date >= period.start && t.date <= period.end)) && matches(t));
  const filtered = !!(period || query);
  const outTotal = shown.filter((t) => t.direction === "out").reduce((a, t) => a + t.amountCents, 0);
  const inTotal = shown.filter((t) => t.direction === "in").reduce((a, t) => a + t.amountCents, 0);
  const current = open ? (txns.find((t) => t.id === open) ?? null) : null;
  const groups = new Map<ISODate, OneTimeTransaction[]>();
  for (const t of shown) groups.set(t.date, [...(groups.get(t.date) ?? []), t]);

  if (txns.length === 0) {
    return <EmptyState title="Nothing logged yet">Logging spending lets {APP_NAME} learn your pattern and recalculate today's cap.</EmptyState>;
  }
  return (
    <div>
      <label className="mb-3 flex items-center gap-2 rounded-full border border-line bg-surface px-4 focus-within:border-brand/60">
        <Search size={15} className="text-faint" aria-hidden />
        <span className="sr-only">Search transactions</span>
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, category or amount" className="pill-input min-w-0 flex-1 bg-transparent py-2.5 text-sm text-ink outline-none placeholder:text-faint" />
      </label>
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
      {cat && trends[cat] && <CategoryTrend category={cat} month={trends[cat].month} week={trends[cat].week} picked={period?.start ?? null} onPick={(b) => setPeriod(b ? { start: b.start, end: b.end, label: b.label } : null)} />}
      {filtered && (
        <div className="mb-3 flex items-center justify-between gap-2 rounded-2xl bg-surface-2/70 px-3 py-2" aria-live="polite">
          <span className="min-w-0 text-sm text-muted">
            <span className="font-semibold text-ink">{[cat, period?.label, query && `“${q.trim()}”`].filter(Boolean).join(" · ")}</span>
            {" "}· {shown.length} {shown.length === 1 ? "transaction" : "transactions"}
          </span>
          <span className="flex shrink-0 items-center gap-2">
            <span className="font-num text-lg leading-none text-display">
              {outTotal > 0 && <Money cents={-outTotal} sign />}
              {inTotal > 0 && <> {outTotal > 0 && " "}<Money cents={inTotal} sign tone="in" /></>}
              {outTotal === 0 && inTotal === 0 && <Money cents={0} />}
            </span>
            <button type="button" onClick={() => { setPeriod(null); setQ(""); }} className="text-xs font-semibold text-brand">Clear</button>
          </span>
        </div>
      )}
      {filtered && shown.length === 0 && <p className="py-6 text-center text-sm text-muted">Nothing matches.</p>}
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
            <TxnBody key={current.id} txn={current} txns={txns} today={today} categories={categories} onRepeat={() => setRepeat(true)}>
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
function TxnBody({ txn, txns, today, categories, onRepeat, children }: { txn: OneTimeTransaction; txns: OneTimeTransaction[]; today: ISODate; categories: string[]; onRepeat: () => void; children: React.ReactNode }) {
  const h = txnHistory(txn, txns, today);
  const [sel, setSel] = useState<string | null>(h ? (h.bars.find((b) => b.kind === "now")?.key ?? h.bars.find((b) => b.key === txn.id)?.key ?? h.bars.filter((b) => b.kind === "past").at(-1)?.key ?? null) : null);
  const canRepeat = !isNotSpending(txn.category);
  const now = h?.bars.find((b) => b.kind === "now");
  // This month against a usual month: well under reads green, well over reads warm.
  const ratio = now && h?.perMonthCents ? now.cents / h.perMonthCents : 1;
  const pace = ratio > 1.15 ? "over" : ratio < 0.85 ? "under" : undefined;
  return (
    <div className="space-y-4">
      {txn.direction === "out" && <QuickCategory txn={txn} categories={categories} />}
      {h ? (
        <section aria-label="This over time">
          <ul className="mb-3 grid grid-cols-3 gap-2 text-center">
            <Stat label="Each time" value={<Money cents={h.usualCents} whole={h.usualCents >= 10_000} />} sub="usually" />
            <Stat label="How often" value={h.often ?? "Now & then"} sub={h.unit === "charge" ? `${h.count} times so far` : undefined} small />
            {h.unit === "month" ? (
              <Stat label="This month" value={<>~<Money cents={now?.cents ?? 0} whole /></>} sub={<>usually <Money cents={h.perMonthCents ?? 0} whole /></>} tone={pace} />
            ) : h.nextDate ? (
              <Stat label="Next" value={formatShort(h.nextDate)} sub="likely" small />
            ) : (
              <Stat label="All together" value={<Money cents={h.totalCents} whole />} sub={`${h.count} times`} />
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
      <Disclosure summary={txn.direction === "out" ? "Edit name, amount or date" : "Edit details"}>{children}</Disclosure>
    </div>
  );
}

/** The category as one tappable pill; tap to pick another, saved on the spot. */
function QuickCategory({ txn, categories }: { txn: OneTimeTransaction; categories: string[] }) {
  const demo = useContext(DemoCtx);
  const [cat, setCat] = useState(txn.category ?? null);
  const [picking, setPicking] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const choices = [...new Set([...categories, ...CATEGORY_LIST])].filter((c) => !isNotSpending(c)).slice(0, 14);
  const pick = (c: string) => {
    const before = cat;
    setCat(c);
    setPicking(false);
    if (demo) return setNote("Demo: changes aren't saved.");
    start(async () => {
      const r = await setTransactionCategory(txn.id, c);
      if (!r.ok) {
        setCat(before);
        setNote(r.error ?? "Couldn't save that.");
      } else setNote(null);
    });
  };
  return (
    <div>
      <button type="button" onClick={() => setPicking((p) => !p)} aria-expanded={picking} className="flex w-full items-center gap-3 rounded-2xl border border-line px-3 py-2.5 text-left transition hover:border-brand/60">
        <Glyph name={cat ?? "spend"} size="sm" />
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] text-faint">Category</span>
          <span className="block text-sm font-semibold text-ink">{cat ?? "Uncategorized"}{pending && <span className="ml-2 text-xs font-normal text-faint">Saving…</span>}</span>
        </span>
        <span className="text-xs font-semibold text-brand">{picking ? "Close" : "Change"}</span>
      </button>
      {picking && (
        <ul className="fade-up mt-2 flex flex-wrap gap-1.5" aria-label="Pick a category">
          {choices.map((c) => (
            <li key={c}>
              <button type="button" onClick={() => pick(c)} aria-pressed={c === cat} className={chip(c === cat)}>
                <Glyph name={c} size="xs" bare /> {c}
              </button>
            </li>
          ))}
        </ul>
      )}
      {note && <p className="mt-1.5 text-xs text-muted" aria-live="polite">{note}</p>}
    </div>
  );
}

function Stat({ label, value, sub, small, tone }: { label: string; value: React.ReactNode; sub?: React.ReactNode; small?: boolean; tone?: "over" | "under" }) {
  const color = tone === "over" ? "text-warn" : tone === "under" ? "text-brand" : "text-display";
  return (
    <li className="flex flex-col justify-center rounded-xl bg-surface-2/60 px-1 py-2">
      <span className="block text-[11px] text-faint">{label}</span>
      <span className={`block leading-tight ${small ? "text-sm font-bold text-ink" : `font-num text-lg ${color}`}`}>{value}</span>
      {sub && <span className="block text-[10px] text-faint">{sub}</span>}
    </li>
  );
}

const chip = (active: boolean) =>
  `inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs transition ${active ? "border-brand bg-brand text-brand-ink" : "border-line bg-surface text-muted hover:border-brand/60"}`;
