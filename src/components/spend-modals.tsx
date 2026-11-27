"use client";

import { useState } from "react";
import { deleteRule, toggleRule } from "@/app/app/actions";
import { formatShort, type ISODate } from "@/lib/dates";
import { describeSchedule, type Account, type Occurrence, type RecurringRule } from "@/lib/engine";
import { RuleForm, TransactionForm, TransferForm } from "./entity-forms";
import { QuickAction } from "./form";
import { Modal } from "./modal";
import { Money } from "./privacy";
import { Info } from "./info";
import { Glyph } from "@/components/icon";
import { Badge } from "./ui";
import { Pencil } from "lucide-react";
import { HistoryChart } from "./history-chart";
import type { HistoryView } from "@/lib/view/history";
import { cleanName } from "@/lib/view/recurring";

const KIND_ICON: Partial<Record<RecurringRule["kind"], string>> = { income: "💰", loan_payment: "🏦", card_payment: "💳", savings_transfer: "🐷", transfer: "↔️", subscription: "🔁" };
export const ruleIcon = (r: RecurringRule) => KIND_ICON[r.kind] ?? r.category ?? "bill";

export interface RuleTile {
  rule: RecurringRule;
  occurrences: Occurrence[];
  next: ISODate | null;
  onCard: boolean;
  from: string;
  to: string | null;
  /** Its account is archived, so it isn't in the forecast. */
  orphaned?: boolean;
  /** Its last few dates and the next few, for the chart. */
  history?: HistoryView;
}

/** Repeating items as tiles; tapping one opens it in a pop-up to edit, skip a date, pause or delete. */
export function RecurringTiles({ tiles, accounts, today }: { tiles: RuleTile[]; accounts: Account[]; today: ISODate }) {
  const [openId, setOpenIdRaw] = useState<string | null>(null);
  const [editing, setEditingRaw] = useState(false);
  const [from, setFrom] = useState<ISODate | null>(null);
  const setEditing = (v: boolean | ((e: boolean) => boolean)) => { setEditingRaw(v); setFrom(null); };
  const setOpenId = (id: string | null) => { setOpenIdRaw(id); setEditing(false); };
  const editFrom = (d: ISODate) => { setEditingRaw(true); setFrom(d); };
  const open = tiles.find((t) => t.rule.id === openId) ?? null;
  return (
    <>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {tiles.map(({ rule: r, next, onCard, orphaned }) => {
          const isIncome = r.kind === "income";
          return (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => setOpenId(r.id)}
                className={`flex h-full w-full flex-col gap-0.5 rounded-xl border p-3 text-left transition hover:-translate-y-0.5 hover:shadow-md ${isIncome ? "border-brand/40 bg-brand/[0.06]" : "border-line bg-surface-2/50"} ${r.active === false ? "opacity-60" : ""}`}
              >
                <span className="flex items-center justify-between gap-1">
                  <Glyph name={ruleIcon(r)} size="md" />
                  <span className="text-[11px] text-faint">{r.active === false ? "Paused" : next ? `Next ${formatShort(next)}` : ""}</span>
                </span>
                <span className="truncate text-sm font-medium text-ink">{r.name}</span>
                <Money cents={isIncome ? r.amountCents : -r.amountCents} sign tone="auto" className="text-lg font-bold" />
                <span className="truncate text-[11px] text-muted">{describeSchedule(r.schedule)}</span>
                {orphaned && <span className="mt-0.5 text-[11px] font-semibold text-warn"><Glyph name="⚠" size="xs" /> Its account is archived, so it isn't counted. Tap to choose another.</span>}
                {(r.isEstimate || onCard) && (
                  <span className="mt-0.5 flex flex-wrap gap-1">
                    {r.isEstimate && <Badge tone="warn">Estimate</Badge>}
                    {onCard && <Badge title="Charged to a card; paid with the statement">On card</Badge>}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      {open && (
        <Modal
          open
          onClose={() => setOpenId(null)}
          icon={ruleIcon(open.rule)}
          tone={open.rule.kind === "income" ? "in" : "out"}
          action={
            <button type="button" onClick={() => setEditing((e) => !e)} aria-pressed={editing} className="flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-surface-3/70 px-3 text-xs font-semibold text-ink transition hover:bg-surface-3">
              {editing ? "Done" : <><Pencil size={13} strokeWidth={2.4} aria-hidden /> Edit</>}
            </button>
          }
          title={open.rule.name}
          subtitle={
            <>
              {describeSchedule(open.rule.schedule)}
              <span className="block text-xs">
                {open.rule.kind === "income" ? "Into" : "From"} {open.from}
                {open.to && ` → ${open.to}`}
                {open.rule.category && ` · ${open.rule.category}`}
              </span>
            </>
          }
        >
          {editing ? (
            <div className="space-y-4">
              {from && <p className="rounded-xl bg-surface-2/70 px-3 py-2 text-xs text-muted">Changes apply from <b className="text-ink">{formatShort(from)}</b> on. Earlier ones stay as they were.</p>}
              <RuleForm key={from ?? "all"} rule={open.rule} startFrom={from ?? undefined} accounts={accounts} today={today} onDone={() => setEditing(false)} />
              <div className="flex items-center justify-between gap-2 border-t border-line pt-3">
                <QuickAction action={toggleRule} fields={{ id: open.rule.id, active: open.rule.active === false ? "true" : "false" }} variant="ghost">
                  {open.rule.active === false ? "Resume" : "Pause"}
                </QuickAction>
                <QuickAction action={deleteRule} fields={{ id: open.rule.id }} variant="ghost" confirm={`Delete “${open.rule.name}” and all its date changes?`}>
                  <span className="text-danger">Delete</span>
                </QuickAction>
              </div>
            </div>
          ) : (
            <RuleBody tile={open} onEditFrom={editFrom} />
          )}
        </Modal>
      )}
    </>
  );
}

/** Inside a repeating item: the chart (past solid, ahead dashed), the picked date's actions, details folded away. */
/** A repeating item: the chart (the selected amount is the one big number), then every time, newest first. */
function RuleBody({ tile, onEditFrom }: { tile: RuleTile; onEditFrom: (d: ISODate) => void }) {
  const { rule, history } = tile;
  const bars = history?.bars ?? [];
  const income = rule.kind === "income";
  const [sel, setSel] = useState<string | null>(bars.find((b) => b.kind === "ahead")?.key ?? bars[bars.length - 1]?.key ?? null);
  const picked = bars.find((b) => b.key === sel);
  const ahead = bars.filter((b) => b.kind === "ahead");
  const past = [...(history?.items ?? [])].reverse();
  const signed = (c: number) => (income ? c : -c);
  const nextDate = (b: (typeof bars)[number]) => b.occurrence?.date ?? b.key.slice(2);
  return (
    <div className="space-y-4">
      {bars.length > 0 && <HistoryChart bars={bars} tone={income ? "in" : "out"} selected={sel} onSelect={setSel} />}
      {/* Past ones are what happened; a coming one can be changed from that date on. */}
      {picked?.kind === "ahead" && (
        <button type="button" onClick={() => onEditFrom(nextDate(picked))} className="fade-up flex w-full items-center justify-between rounded-full border border-line px-4 py-2 text-sm text-muted transition hover:border-brand/60">
          <span>Change from <b className="text-ink">{formatShort(nextDate(picked))}</b> on</span>
          <span aria-hidden className="text-faint">›</span>
        </button>
      )}
      <div>
        <p className="mb-1 text-xs font-semibold text-faint">Every time</p>
        <ul className="divide-y divide-line rounded-xl border border-line">
          {[...ahead].reverse().map((b) => (
            <li key={b.key}>
              <button type="button" onClick={() => setSel(b.key)} className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm ${sel === b.key ? "bg-brand/[0.07]" : ""}`}>
                <span><span className="font-semibold text-ink">{formatShort(nextDate(b))}</span> <span className="text-xs text-faint">expected</span></span>
                {b.cents !== rule.amountCents && <Money cents={signed(b.cents)} sign className="shrink-0 text-xs text-faint" />}
              </button>
            </li>
          ))}
          {past.map((i) => (
            <li key={i.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
              <span className="min-w-0 truncate"><span className="font-semibold text-ink">{formatShort(i.date)}</span> <span className="text-xs text-muted">{prettyName(i.description)}</span></span>
              <Money cents={signed(i.cents)} sign tone="auto" className="shrink-0 font-semibold" />
            </li>
          ))}
          {past.length === 0 && [...bars].filter((b) => b.kind === "past").reverse().map((b) => (
            <li key={b.key} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
              <span><span className="font-semibold text-ink">{b.title}</span> <span className="text-xs text-faint">scheduled</span></span>
            </li>
          ))}
          {past.length === 0 && (
            <li className="px-3 py-2 text-[11px] text-faint">From the schedule. Once the real {income ? "deposits" : "charges"} come in from your bank, they show here instead.</li>
          )}
        </ul>
      </div>
    </div>
  );
}

/** "TRINET 11102026 PAYROLL PPD ID: 84…" → "Trinet Payroll". */
function prettyName(s: string): string {
  const k = cleanName(s);
  if (!k) return s;
  return k.split(" ").map((w) => w[0]!.toUpperCase() + w.slice(1)).join(" ");
}

/** "+ Add" buttons that open the matching form in a pop-up. */
export function AddButton({ what, accounts, today, label = "+ Add" }: { what: "rule" | "transaction" | "transfer"; accounts: Account[]; today: ISODate; label?: string }) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const meta = {
    rule: { icon: "🔁", title: "Add something that repeats", subtitle: "A payday, bill, subscription or savings transfer." },
    transaction: { icon: "🧾", title: "Add income or spending", subtitle: "A one-time purchase, refund or payment." },
    transfer: { icon: "↔️", title: "Add a transfer", subtitle: "Between your accounts, or a card payment." },
  }[what];
  return (
    <>
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => setOpen(true)}>
        {label}
      </button>
      <Modal open={open} onClose={close} icon={meta.icon} title={meta.title} subtitle={meta.subtitle}>
        {what === "rule" && <RuleForm accounts={accounts} today={today} onDone={close} />}
        {what === "transaction" && <TransactionForm accounts={accounts} today={today} onDone={close} />}
        {what === "transfer" && <TransferForm accounts={accounts} today={today} onDone={close} />}
      </Modal>
    </>
  );
}
