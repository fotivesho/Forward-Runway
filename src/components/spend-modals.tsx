"use client";

import { useState } from "react";
import { deleteRule, toggleRule } from "@/app/app/actions";
import { formatShort, type ISODate } from "@/lib/dates";
import { describeSchedule, type Account, type Occurrence, type RecurringRule } from "@/lib/engine";
import { RuleForm, TransactionForm, TransferForm } from "./entity-forms";
import { QuickAction } from "./form";
import { Modal } from "./modal";
import { OccurrenceControls } from "./occurrence-controls";
import { Money } from "./privacy";
import { Info } from "./info";
import { Glyph } from "@/components/icon";
import { Badge } from "./ui";
import { Pencil } from "lucide-react";
import { HistoryChart } from "./history-chart";
import type { HistoryView } from "@/lib/view/history";

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
  const [editing, setEditing] = useState(false);
  const setOpenId = (id: string | null) => { setOpenIdRaw(id); setEditing(false); };
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
              <Money cents={open.rule.kind === "income" ? open.rule.amountCents : -open.rule.amountCents} sign tone="auto" className="font-semibold" /> · {describeSchedule(open.rule.schedule)}
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
              <RuleForm rule={open.rule} accounts={accounts} today={today} onDone={() => setEditing(false)} />
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
            <RuleBody tile={open} />
          )}
        </Modal>
      )}
    </>
  );
}

/** Inside a repeating item: the chart (past solid, ahead dashed), the picked date's actions, details folded away. */
function RuleBody({ tile }: { tile: RuleTile }) {
  const { rule, history } = tile;
  const bars = history?.bars ?? [];
  const income = rule.kind === "income";
  const [sel, setSel] = useState<string | null>(bars.find((b) => b.kind === "ahead")?.key ?? bars[bars.length - 1]?.key ?? null);
  const picked = bars.find((b) => b.key === sel);
  const o = picked?.occurrence;
  const ahead = bars.filter((b) => b.kind === "ahead");
  const aheadTotal = ahead.reduce((s, b) => s + b.cents, 0);
  const past = [...(history?.items ?? [])].reverse();
  const signed = (c: number) => (income ? c : -c);
  return (
    <div className="space-y-4">
      {bars.length > 0 && <HistoryChart bars={bars} tone={income ? "in" : "out"} selected={sel} onSelect={setSel} />}

      {/* A coming date you tapped: what you can do about that one date (the rest of the schedule stays). */}
      {o && (
        <div className="fade-up rounded-2xl border border-line p-3">
          <p className="text-sm text-ink">
            <span className="font-semibold">{formatShort(o.date)}</span> · <Money cents={signed(o.amountCents)} sign tone="auto" className="font-semibold" />
            {o.posted && <> <Badge tone="good">{income ? "Received" : "Paid"}</Badge></>}
            {o.movedFrom && <> <Badge tone="info">moved from {formatShort(o.movedFrom)}</Badge></>}
            {o.overridden && !o.posted && !o.movedFrom && <> <Badge tone="info">changed</Badge></>}
          </p>
          <p className="mb-2 text-[11px] text-faint">Only this {income ? "payday" : "date"}. The rest of the schedule stays the same.</p>
          <OccurrenceControls ruleId={rule.id} originalDate={o.originalDate} date={o.date} amountCents={o.amountCents} overridden={o.overridden} income={income} />
        </div>
      )}

      {/* Every time: what came in (or went out), then what's coming. */}
      <div>
        <p className="mb-1 flex items-baseline justify-between text-xs font-semibold text-faint">
          <span>Every time</span>
          {ahead.length > 0 && <span>Next {ahead.length}: <Money cents={signed(aheadTotal)} sign tone="auto" whole /></span>}
        </p>
        <ul className="divide-y divide-line rounded-xl border border-line">
          {ahead.map((b) => (
            <li key={b.key}>
              <button type="button" onClick={() => setSel(b.key)} className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm ${sel === b.key ? "bg-brand/[0.07]" : ""}`}>
                <span className="text-muted"><span className="font-semibold text-ink">{formatShort(b.occurrence?.date ?? b.key.slice(2))}</span> · expected</span>
                <Money cents={signed(b.cents)} sign className="shrink-0 text-faint" />
              </button>
            </li>
          )).reverse()}
          {past.map((i) => (
            <li key={i.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
              <span className="min-w-0 truncate"><span className="font-semibold text-ink">{formatShort(i.date)}</span> <span className="text-xs text-muted">{i.description}</span></span>
              <Money cents={signed(i.cents)} sign tone="auto" className="shrink-0 font-semibold" />
            </li>
          ))}
          {past.length === 0 && [...bars].filter((b) => b.kind === "past").reverse().map((b) => (
            <li key={b.key} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
              <span className="text-muted"><span className="font-semibold text-ink">{b.title}</span> · scheduled</span>
              <Money cents={signed(b.cents)} sign className="shrink-0 text-muted" />
            </li>
          ))}
          {past.length === 0 && (
            <li className="px-3 py-2 text-[11px] text-faint">These are from the schedule. Once the real {income ? "deposits" : "charges"} come in from your bank, they show here instead.</li>
          )}
        </ul>
      </div>
    </div>
  );
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
