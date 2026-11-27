"use client";

import { createContext, useContext, useEffect, useRef, useState, useTransition } from "react";
import { CategoryMenu } from "./category-menu";
import { Repeat, Search, Sparkles } from "lucide-react";
import { NewCategoryButton } from "./new-category";
import { looksLike } from "@/lib/data/match";
import { deleteRule, deleteTransaction, saveRule, setTransactionCategory } from "@/app/app/actions";
import { addDays, addMonths, formatLong, formatShort, type ISODate } from "@/lib/dates";
import { describeSchedule, nextOccurrence, type Account, type OneTimeTransaction, type RecurringRule } from "@/lib/engine";
import { RuleForm, TransactionForm } from "./entity-forms";
import { ActionForm, DemoCtx, QuickAction, Submit } from "./form";
import { centsToInput } from "@/lib/money";
import { Modal } from "./modal";
import { CategoryReport } from "./reports-view";
import type { CategoryItem, SpendingReport } from "@/lib/view/budget";
import { Money } from "./privacy";
import { Badge, Disclosure, EmptyState } from "./ui";
import { HistoryChart } from "./history-chart";
import { Info } from "./info";
import { inPeriod, itemStats, PERIOD_LABEL, txnHistory, type HistoryView, type StatPeriod } from "@/lib/view/history";
import { APP_NAME } from "@/lib/brand";
import { Glyph } from "@/components/icon";
import { isNotSpending } from "@/lib/categories";


/** Every transaction, newest first, grouped by day. Category chips (with totals) filter the list. */
export function TransactionList({
  txns,
  accounts,
  today,
  monthStart,
  report = [],
  catItems = {},
  categories = [],
  rules = [],
}: {
  txns: OneTimeTransaction[];
  accounts: Account[];
  today: ISODate;
  monthStart: ISODate;
  /** Per category: spending by month and by week, shown when you tap the category. */
  report?: SpendingReport;
  /** Per category, what's counted in it (for the category pop-up). */
  catItems?: Record<string, CategoryItem[]>;
  /** Your categories, most used first. */
  categories?: string[];
  /** Repeating items, to tell when a transaction already is one. */
  rules?: RecurringRule[];
}) {
  const [repeat, setRepeat] = useState(false);
  const [cat, setCatRaw] = useState<string | null>(null);
  const [period, setPeriod] = useState<{ start: ISODate; end: ISODate; label: string } | null>(null);
  const [q, setQ] = useState("");
  const [acct, setAcct] = useState<string>("");
  const [range, setRange] = useState<string>("");
  const setCat = (c: string | null) => { setCatRaw(c); setPeriod(null); };
  const [open, setOpen] = useState<string | null>(null);
  const [startCat, setStartCat] = useState(false);
  const [catOpen, setCatOpen] = useState(false);
  // Show the latest days first; older ones a tap away.
  const [days, setDays] = useState(10);
  const name = (id: string) => accounts.find((a) => a.id === id)?.name ?? "Deleted account";
  const live = rules.filter((r) => r.active !== false);
  const repeats = (t: OneTimeTransaction) => live.some((r) => looksLike(r, t));
  const onCard = (id: string) => accounts.find((a) => a.id === id)?.kind === "credit_card";

  const query = q.trim().toLowerCase();
  const matches = (t: OneTimeTransaction) =>
    !query ||
    t.description.toLowerCase().includes(query) ||
    (t.category ?? "").toLowerCase().includes(query) ||
    name(t.accountId).toLowerCase().includes(query) ||
    (/^[\d.,$]+$/.test(query) && (t.amountCents / 100).toFixed(2).includes(query.replace(/[$,]/g, "")));
  // Time range: a quick pick, unless a bar in a chart already chose a period.
  const ranges: Record<string, { label: string; from: ISODate; to: ISODate }> = {
    month: { label: "This month", from: monthStart, to: "9999-12-31" },
    last: { label: "Last month", from: addMonths(monthStart, -1), to: addDays(monthStart, -1) },
    "90": { label: "Last 90 days", from: addDays(today, -89), to: "9999-12-31" },
    year: { label: "This year", from: `${today.slice(0, 4)}-01-01`, to: "9999-12-31" },
  };
  const r = range ? ranges[range] : null;
  const acctName = acct ? name(acct) : null;
  // Chips: spending per category for the chosen account and time (this month by default), biggest first.
  const chipFrom = r?.from ?? monthStart;
  const totals = new Map<string, number>();
  for (const t of txns) {
    if (t.direction !== "out" || t.status !== "posted" || t.date < chipFrom || t.date > today || (r && t.date > r.to) || (acct && t.accountId !== acct) || isNotSpending(t.category)) continue;
    const c = t.category ?? "Other";
    totals.set(c, (totals.get(c) ?? 0) + t.amountCents);
  }
  const chips = [...totals.entries()].sort((a, b) => b[1] - a[1]);
  const shown = txns.filter(
    (t) =>
      (!cat || (t.category ?? "Other") === cat) &&
      (!period || (t.date >= period.start && t.date <= period.end)) &&
      (!r || (t.date >= r.from && t.date <= r.to)) &&
      (!acct || t.accountId === acct) &&
      matches(t),
  );
  const filtered = !!(period || query || r || acct);
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
      <div className="-mt-1 mb-3 flex gap-2">
        <FilterSelect label="Account" value={acct} onChange={setAcct} options={[{ value: "", label: "All accounts" }, ...accounts.filter((a) => !a.archived && txns.some((t) => t.accountId === a.id)).map((a) => ({ value: a.id, label: a.name }))]} />
        <FilterSelect label="Time" value={range} onChange={(v) => { setRange(v); setPeriod(null); }} options={[{ value: "", label: "Any time" }, ...Object.entries(ranges).map(([k, v]) => ({ value: k, label: v.label }))]} />
      </div>
      {(
        <div className="-mx-1 mb-3 flex gap-1.5 overflow-x-auto px-1 pb-1" role="group" aria-label="Categories, with totals for the chosen account and time">
          <button type="button" onClick={() => setCat(null)} aria-pressed={cat === null} className={chip(cat === null)}>All</button>
          {chips.map(([c, cents]) => (
            <button key={c} type="button" onClick={() => setCat(cat === c ? null : c)} aria-pressed={cat === c} className={chip(cat === c)}>
              <Glyph name={c} size="xs" bare /> {c} <Money cents={cents} whole className="font-semibold" />
            </button>
          ))}
          <NewCategoryButton label="New" />
        </div>
      )}
      {cat && report.length > 0 && (
        <button type="button" onClick={() => setCatOpen(true)} className="mb-3 flex w-full items-center gap-2 rounded-2xl border border-line px-3 py-2 text-left text-sm transition hover:border-brand/60">
          <Glyph name={cat} size="sm" />
          <span className="min-w-0 flex-1 text-muted"><b className="text-ink">{cat}</b> over time, average and trend</span>
          <span aria-hidden className="text-faint">›</span>
        </button>
      )}
      {cat && catOpen && (
        <Modal open onClose={() => setCatOpen(false)} icon={cat} title={cat} subtitle="Last 6 months">
          <CategoryReport cat={cat} data={report} items={catItems[cat] ?? []} />
        </Modal>
      )}
      {filtered && (
        <div className="mb-3 flex items-center justify-between gap-2 rounded-2xl bg-surface-2/70 px-3 py-2" aria-live="polite">
          <span className="min-w-0 text-sm text-muted">
            <span className="font-semibold text-ink">{[cat, acctName, period?.label ?? r?.label, query && `“${q.trim()}”`].filter(Boolean).join(" · ")}</span>
            {" "}· {shown.length} {shown.length === 1 ? "transaction" : "transactions"}
          </span>
          <span className="flex shrink-0 items-center gap-2">
            <span className="font-num text-lg leading-none text-display">
              {outTotal > 0 && <Money cents={-outTotal} sign />}
              {inTotal > 0 && <> {outTotal > 0 && " "}<Money cents={inTotal} sign tone="in" /></>}
              {outTotal === 0 && inTotal === 0 && <Money cents={0} />}
            </span>
            <button type="button" onClick={() => { setPeriod(null); setQ(""); setAcct(""); setRange(""); }} className="text-xs font-semibold text-brand">Clear</button>
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
                  <li key={t.id} className="flex items-center transition hover:bg-surface-2/60">
                    <button type="button" onClick={() => { setStartCat(true); setOpen(t.id); }} aria-label={`Change category of ${t.description}`} title="Change category" className="py-2 pl-3 pr-0 transition hover:scale-105">
                      <Glyph name={t.category ?? (t.direction === "in" ? "income" : "spend")} size="md" />
                    </button>
                    <button type="button" onClick={() => { setStartCat(false); setOpen(t.id); }} aria-haspopup="dialog" className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2 text-left">
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5 text-sm font-medium text-ink">
                          <span className="truncate">{t.description}</span>
                          {repeats(t) && <Repeat size={12} strokeWidth={2.6} className="shrink-0 text-brand" aria-label="Repeating" />}
                        </span>
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
          icon={current.category ?? (current.direction === "in" ? "income" : "spend")}
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
            <CatProvider key={current.id} txn={current}>
            <TxnBody startPanel={startCat ? "cat" : null} txn={current} txns={txns} today={today} categories={categories} rules={rules} accountName={name} onRepeat={() => setRepeat(true)}>
              <TransactionForm key={current.id} accounts={accounts} today={today} txn={current} categories={categories} onDone={() => setOpen(null)} />
              <div className="mt-4 flex justify-end border-t border-line pt-4">
                <QuickAction action={deleteTransaction} fields={{ id: current.id }} variant="danger" confirm="Delete this transaction?">Delete transaction</QuickAction>
              </div>
            </TxnBody>
            </CatProvider>
          )}
        </Modal>
      )}
    </div>
  );
}

/** Inside a transaction: two quick pills (category, repeats), what it's been over time, then the edit form folded away. */
function TxnBody({ startPanel = null, txn, txns, today, categories, rules, accountName, onRepeat, children }: { startPanel?: "cat" | null; txn: OneTimeTransaction; txns: OneTimeTransaction[]; today: ISODate; categories: string[]; rules: RecurringRule[]; accountName: (id: string) => string; onRepeat: () => void; children: React.ReactNode }) {
  const h = txnHistory(txn, txns, today);
  const [panel, setPanel] = useState<"cat" | "repeat" | null>(startPanel);
  const toggle = (p: "cat" | "repeat") => setPanel((x) => (x === p ? null : p));
  const repeating = rules.find((r) => r.active !== false && looksLike(r, txn));
  // Everyday things (lunch, coffee) are predicted from your habits already; repeating is for bills and subscriptions.
  const canRepeat = !isNotSpending(txn.category) && !repeating && h?.unit !== "month";
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <CatMenu txn={txn} categories={categories} startOpen={panel === "cat"} />
        {repeating ? (
          <button type="button" onClick={() => toggle("repeat")} aria-expanded={panel === "repeat"} className={pill(panel === "repeat")}>
            <Repeat size={14} strokeWidth={2.4} className="text-brand" aria-hidden /> Repeating
          </button>
        ) : canRepeat ? (
          <button type="button" onClick={() => toggle("repeat")} aria-expanded={panel === "repeat"} className={pill(panel === "repeat")}>
            <Repeat size={14} strokeWidth={2.4} aria-hidden /> {h?.everyDays ? "Repeats?" : "Make repeating"}
          </button>
        ) : null}
      </div>
      {panel === "repeat" && (repeating ? <RepeatingInfo rule={repeating} today={today} /> : <QuickRepeat txn={txn} h={h} today={today} accountName={accountName} onMore={onRepeat} />)}
      {h ? <Insights txn={txn} h={h} today={today} accountName={accountName} /> : (
        <p className="rounded-2xl bg-surface-2/60 px-3 py-2 text-xs text-muted">First time we&apos;ve seen this. Once it shows up again, you&apos;ll see its history and what to expect next.</p>
      )}
      <Disclosure summary={txn.direction === "out" ? "Edit name, amount or date" : "Edit details"}>{children}</Disclosure>
    </div>
  );
}

/** Holds the transaction's category while the pop-up is open: tapping one saves it right away. */
function CatProvider({ txn, children }: { txn: OneTimeTransaction; children: React.ReactNode }) {
  const demo = useContext(DemoCtx);
  const [cat, setCat] = useState(txn.category ?? null);
  const [note, setNote] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = (c: string | null) => {
    if (!c || c === cat) return;
    const before = cat;
    setCat(c);
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
    <CatCtx.Provider value={{ cat, set, pending, note }}>
      {children}
      {note && <p className="mt-2 text-xs text-muted" aria-live="polite">{note}</p>}
    </CatCtx.Provider>
  );
}

/** The transaction's category as a pill that pops out the category list. */
function CatMenu({ txn, categories, startOpen }: { txn: OneTimeTransaction; categories: string[]; startOpen: boolean }) {
  const { cat, set, pending } = useContext(CatCtx);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (startOpen) ref.current?.querySelector("button")?.click();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <span ref={ref} className="inline-flex items-center gap-2">
      <CategoryMenu value={cat ?? txn.category ?? null} direction={txn.direction} yours={categories} onPick={set} />
      {pending && <span className="text-xs text-faint">Saving…</span>}
    </span>
  );
}

const pill = (on: boolean) =>
  `inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-sm font-semibold transition ${on ? "border-brand bg-brand/10 text-ink" : "border-line text-ink hover:border-brand/60"}`;

/** The category, live: the pill shows what it is now (changed here or in the picker). */
const CatCtx = createContext<{ cat: string | null; set: (c: string | null) => void; pending: boolean; note: string | null }>({ cat: null, set: () => {}, pending: false, note: null });



/** Already repeating: what that means, and a one-tap way to stop it. */
function RepeatingInfo({ rule, today }: { rule: RecurringRule; today: ISODate }) {
  const next = nextOccurrence(rule, [], today);
  return (
    <div className="fade-up flex items-center justify-between gap-3 rounded-2xl border border-line bg-surface-2/50 px-3 py-2.5">
      <span className="min-w-0 text-sm text-muted">
        <span className="block font-semibold text-ink">{rule.name}</span>
        {describeSchedule(rule.schedule)}{next ? ` · next ${formatShort(next.date)}` : ""}
      </span>
      <QuickAction action={deleteRule} fields={{ id: rule.id }} variant="secondary" confirm={`Stop “${rule.name}” repeating? It won't be counted ahead anymore. Past transactions stay.`}>
        Stop repeating
      </QuickAction>
    </div>
  );
}

/** Make it repeating in one tap: how often (guessed from its history), then add. More options opens the full form. */
function QuickRepeat({ txn, h, today, accountName, onMore }: { txn: OneTimeTransaction; h: HistoryView | null; today: ISODate; accountName: (id: string) => string; onMore: () => void }) {
  const guess: "weekly" | "biweekly" | "monthly" = h?.everyDays ? (h.everyDays <= 10 ? "weekly" : h.everyDays <= 20 ? "biweekly" : "monthly") : "monthly";
  const [freq, setFreq] = useState(guess);
  const amount = h?.usualCents ?? txn.amountCents;
  const varies = !!h?.items && h.items.some((i) => Math.abs(i.cents - amount) > amount * 0.1);
  const last = h?.items?.at(-1)?.date ?? txn.date;
  let next = freq === "monthly" ? addMonths(last, 1) : addDays(last, freq === "weekly" ? 7 : 14);
  while (next <= today) next = freq === "monthly" ? addMonths(next, 1) : addDays(next, freq === "weekly" ? 7 : 14);
  const income = txn.direction === "in";
  const kind = income ? "income" : txn.category === "Subscriptions" || (amount < 5_000 && freq === "monthly") ? "subscription" : "bill";
  return (
    <div className="fade-up rounded-2xl border border-line bg-surface-2/50 p-3">
      <div className="flex gap-1.5" role="radiogroup" aria-label="How often">
        {(["weekly", "biweekly", "monthly"] as const).map((f) => (
          <button key={f} type="button" role="radio" aria-checked={freq === f} onClick={() => setFreq(f)} className={chip(freq === f)}>
            {f === "weekly" ? "Weekly" : f === "biweekly" ? "Every 2 weeks" : "Monthly"}
          </button>
        ))}
      </div>
      <p className="mt-2 text-sm text-muted">
        <span className="font-semibold text-ink">{varies ? "~" : ""}<Money cents={amount} /></span> · next {formatShort(next)} · {accountName(txn.accountId)}
      </p>
      <ActionForm action={saveRule} demoPreview className="mt-2 flex flex-wrap items-center gap-3" aria-label="Add as repeating">
        <input type="hidden" name="kind" value={kind} />
        <input type="hidden" name="name" value={txn.description} />
        <input type="hidden" name="amount" value={centsToInput(amount)} />
        <input type="hidden" name="accountId" value={txn.accountId} />
        <input type="hidden" name="category" value={txn.category ?? ""} />
        <input type="hidden" name="frequency" value={freq} />
        <input type="hidden" name="startDate" value={next} />
        {freq === "monthly" && <input type="hidden" name="dayOfMonth" value={String(Number(next.slice(8)))} />}
        <input type="hidden" name="weekendAdjust" value={income ? "before" : "none"} />
        {varies && <input type="hidden" name="isEstimate" value="on" />}
        <Submit variant="primary" className="btn-sm" pendingLabel="Adding…">Add as repeating</Submit>
        <button type="button" onClick={onMore} className="text-xs font-semibold text-brand">More options</button>
      </ActionForm>
    </div>
  );
}

/** Its history: a period to look at, the cards, a finding or two, the chart, and every time it happened. */
function Insights({ txn, h, today, accountName }: { txn: OneTimeTransaction; h: HistoryView; today: ISODate; accountName: (id: string) => string }) {
  const [period, setPeriod] = useState<StatPeriod>("all");
  const [sel, setSel] = useState<string | null>(h.bars.find((b) => b.kind === "now")?.key ?? h.bars.find((b) => b.key === txn.id)?.key ?? h.bars.filter((b) => b.kind === "past").at(-1)?.key ?? null);
  const [showAll, setShowAll] = useState(false);
  const items = h.items ?? [];
  const st = itemStats(items, period, today);
  const now = h.bars.find((b) => b.kind === "now");
  const ratio = now && h.perMonthCents ? now.cents / h.perMonthCents : 1;
  const pace = ratio > 1.15 ? "over" : ratio < 0.85 ? "under" : undefined;
  // The list follows the chart: a month bar shows that month; a charge bar marks that charge.
  const picked = h.bars.find((b) => b.key === sel);
  const monthPick = h.unit === "month" && picked && picked.kind !== "ahead" ? picked.key.slice(0, 7) : null;
  const rows = items.filter((i) => (monthPick ? i.date.startsWith(monthPick) : inPeriod(i.date, period, today))).reverse();
  const shown = showAll ? rows : rows.slice(0, 6);
  const trendTone = st.trendPct == null ? undefined : st.trendPct >= 10 ? "over" : st.trendPct <= -10 ? "under" : undefined;
  return (
    <section aria-label="This over time" className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-ink">Over time</h3>
        <label className="relative">
          <span className="sr-only">Period</span>
          <select value={period} onChange={(e) => setPeriod(e.target.value as StatPeriod)} className="appearance-none rounded-full border border-line bg-surface py-1 pl-3 pr-7 text-xs font-semibold text-ink">
            {(Object.keys(PERIOD_LABEL) as StatPeriod[]).map((p) => <option key={p} value={p}>{PERIOD_LABEL[p]}</option>)}
          </select>
          <span aria-hidden className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-faint">▾</span>
        </label>
      </div>
      {st.count === 0 ? (
        <p className="text-xs text-muted">Nothing in this period.</p>
      ) : (
        <ul className="grid grid-cols-3 gap-2 text-center">
          <Stat label="Average" value={<Money cents={st.avgCents} whole={st.avgCents >= 10_000} />} sub="each time" />
          <Stat label="Total" value={<Money cents={st.totalCents} whole />} sub={`${st.count} ${st.count === 1 ? "time" : "times"}`} />
          {h.unit === "month" && period === "all" ? (
            <Stat label="This month" value={<>~<Money cents={now?.cents ?? 0} whole /></>} sub={<>usually <Money cents={h.perMonthCents ?? 0} whole /></>} tone={pace} />
          ) : h.nextDate ? (
            <Stat label="Next" value={formatShort(h.nextDate)} sub={h.often?.toLowerCase() ?? "likely"} small />
          ) : st.trendPct != null ? (
            <Stat label="Trend" value={`${st.trendPct > 0 ? "↑" : st.trendPct < 0 ? "↓" : ""}${Math.abs(st.trendPct)}%`} sub="last 3 vs before" tone={trendTone} />
          ) : (
            <Stat label="How often" value={h.often ?? "Now & then"} small />
          )}
        </ul>
      )}
      {st.findings.length > 0 && (
        <ul className="space-y-1">
          {st.findings.map((f) => (
            <li key={f} className="flex items-center gap-2 text-xs text-muted"><Sparkles size={13} className="shrink-0 text-brand" aria-hidden /> {f}</li>
          ))}
        </ul>
      )}
      <HistoryChart bars={h.bars} tone={txn.direction === "in" ? "in" : "out"} selected={sel} onSelect={setSel} />
      <p className="text-xs text-faint">
        {h.unit === "month" ? "By month. Tap a month to list it." : "Each time it showed up."}
        <Info label="Reading the chart">Every transaction with this name. Solid bars already happened; dashed, shaded bars are what we expect next. Tapping a bar only shows its amount and lists its transactions below: it doesn&apos;t change anything.</Info>
      </p>
      <div>
        <p className="mb-1 text-xs font-semibold text-faint">{monthPick ? `In ${picked!.title}` : "Every time"} · {rows.length}</p>
        <ul className="divide-y divide-line rounded-xl border border-line">
          {shown.map((i) => (
            <li key={i.id} className={`flex items-center justify-between gap-2 px-3 py-2 text-sm ${i.id === sel || i.id === txn.id ? "bg-brand/[0.07]" : ""}`}>
              <span className="min-w-0">
                <span className="font-semibold text-ink">{formatShort(i.date)}</span>
                <span className="ml-2 truncate text-xs text-muted">{accountName(i.accountId)}{i.id === txn.id ? " · this one" : ""}</span>
              </span>
              <Money cents={txn.direction === "in" ? i.cents : -i.cents} sign tone="auto" className="shrink-0 font-semibold" />
            </li>
          ))}
        </ul>
        {rows.length > 6 && (
          <button type="button" onClick={() => setShowAll((x) => !x)} className="mt-1.5 text-xs font-semibold text-brand">{showAll ? "Show fewer" : `Show all ${rows.length}`}</button>
        )}
      </div>
    </section>
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

/** A slim pill-shaped dropdown for filtering. Highlighted when something other than "all" is chosen. */
function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: Array<{ value: string; label: string }> }) {
  return (
    <label className="relative min-w-0 flex-1">
      <span className="sr-only">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className={`w-full appearance-none truncate rounded-full border py-1.5 pl-3 pr-7 text-xs font-semibold transition ${value ? "border-brand bg-brand/10 text-ink" : "border-line bg-surface text-muted"}`}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <span aria-hidden className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-faint">▾</span>
    </label>
  );
}
