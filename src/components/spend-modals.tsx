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
import { Badge, Disclosure } from "./ui";
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
  const [openId, setOpenId] = useState<string | null>(null);
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
          <RuleBody tile={open} accounts={accounts} today={today} onDone={() => setOpenId(null)} />
        </Modal>
      )}
    </>
  );
}

/** Inside a repeating item: the chart (past solid, ahead dashed), the picked date's actions, details folded away. */
function RuleBody({ tile, accounts, today, onDone }: { tile: RuleTile; accounts: Account[]; today: ISODate; onDone: () => void }) {
  const { rule, history } = tile;
  const bars = history?.bars ?? [];
  const [sel, setSel] = useState<string | null>(bars.find((b) => b.kind === "ahead")?.key ?? bars[bars.length - 1]?.key ?? null);
  const picked = bars.find((b) => b.key === sel);
  const o = picked?.occurrence;
  const ahead = bars.filter((b) => b.kind === "ahead");
  const aheadTotal = ahead.reduce((s, b) => s + b.cents, 0);
  return (
    <div className="space-y-4">
      {bars.length > 0 && (
        <section aria-label="Past and upcoming">
          <HistoryChart bars={bars} tone={rule.kind === "income" ? "in" : "out"} selected={sel} onSelect={setSel} />
          {o && (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-surface-2/60 px-3 py-2">
              <span className="flex flex-wrap items-center gap-1 text-xs text-muted">
                Just this date
                {o.posted && <Badge tone="good">In balance</Badge>}
                {o.movedFrom && <Badge tone="info">moved from {formatShort(o.movedFrom)}</Badge>}
                {o.overridden && !o.posted && !o.movedFrom && <Badge tone="info">changed</Badge>}
              </span>
              <OccurrenceControls ruleId={rule.id} originalDate={o.originalDate} date={o.date} amountCents={o.amountCents} overridden={o.overridden} />
            </div>
          )}
          {ahead.length > 0 && (
            <p className="mt-2 text-xs text-faint">
              Next {ahead.length}: <Money cents={rule.kind === "income" ? aheadTotal : -aheadTotal} sign tone="auto" whole className="font-semibold" />
              <Info label="Reading the chart">Solid bars already happened. Dashed bars are coming up, at the amount we expect. Tap a coming one to mark it as already happened, skip just that date, or change its date or amount.</Info>
            </p>
          )}
        </section>
      )}
      <Disclosure summary="Edit details">
        <RuleForm rule={rule} accounts={accounts} today={today} onDone={onDone} />
        <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
          <QuickAction action={toggleRule} fields={{ id: rule.id, active: rule.active === false ? "true" : "false" }} variant="secondary">
            {rule.active === false ? "Resume" : "Pause"}
          </QuickAction>
          <QuickAction action={deleteRule} fields={{ id: rule.id }} variant="danger" confirm={`Delete “${rule.name}” and all its date changes?`}>
            Delete
          </QuickAction>
        </div>
      </Disclosure>
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
