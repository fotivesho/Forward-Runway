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
import { Glyph } from "@/components/icon";
import { Badge } from "./ui";

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
          {open.occurrences.length > 0 && (
            <section aria-label="Upcoming dates" className="mb-4">
              <h3 className="mb-1 text-sm font-bold text-ink">Upcoming</h3>
              <ul className="divide-y divide-line rounded-xl border border-line">
                {open.occurrences.slice(0, 4).map((o) => (
                  <li key={o.originalDate} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                    <span>
                      <span className="font-medium text-ink">{formatShort(o.date)}</span> · <Money cents={o.amountCents} />
                      {o.posted && <> <Badge tone="good">In balance</Badge></>}
                      {o.movedFrom && <> <Badge tone="info">moved from {formatShort(o.movedFrom)}</Badge></>}
                      {o.overridden && !o.posted && !o.movedFrom && <> <Badge tone="info">changed</Badge></>}
                    </span>
                    <OccurrenceControls ruleId={open.rule.id} originalDate={o.originalDate} date={o.date} amountCents={o.amountCents} overridden={o.overridden} />
                  </li>
                ))}
              </ul>
            </section>
          )}
          <h3 className="mb-2 text-sm font-bold text-ink">Details</h3>
          <RuleForm rule={open.rule} accounts={accounts} today={today} onDone={() => setOpenId(null)} />
          <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
            <QuickAction action={toggleRule} fields={{ id: open.rule.id, active: open.rule.active === false ? "true" : "false" }} variant="secondary">
              {open.rule.active === false ? "Resume" : "Pause"}
            </QuickAction>
            <QuickAction action={deleteRule} fields={{ id: open.rule.id }} variant="danger" confirm={`Delete “${open.rule.name}” and all its date changes?`}>
              Delete
            </QuickAction>
          </div>
        </Modal>
      )}
    </>
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
