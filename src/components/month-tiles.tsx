"use client";

import { useContext, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setTransactionCategory } from "@/app/app/actions";
import { formatShort } from "@/lib/dates";
import type { FlowItem } from "@/lib/view/spend";
import { DemoCtx } from "./form";
import { Glyph } from "@/components/icon";
import { Info } from "./info";
import { Modal } from "./modal";
import { Money } from "./privacy";

type Which = "income" | "spent" | "net";

/**
 * The month at a glance: Income, Spent, Net, each one tappable to see exactly what it's made of,
 * so a wrong number (a transfer counted as income) is easy to spot and fix.
 */
export function MonthTiles({ month, items }: { month: string; items: { in: FlowItem[]; out: FlowItem[] } }) {
  const [open, setOpen] = useState<Which | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const ins = items.in.filter((i) => !hidden.has(i.key));
  const income = sum(ins);
  const spending = items.out.filter((i) => i.kind === "spending" && i.when === "done");
  const spent = sum(spending);
  const net = income - sum(items.out);
  const tiles: Array<{ k: Which; label: string; value: React.ReactNode }> = [
    { k: "income", label: "Income", value: <Money cents={income} whole tone="in" /> },
    { k: "spent", label: "Spent", value: <Money cents={spent} whole /> },
    { k: "net", label: "Net", value: <Money cents={net} whole sign tone="auto" /> },
  ];
  return (
    <section aria-labelledby="month-title">
      <h2 id="month-title" className="mb-2 flex items-center text-sm font-bold text-ink">
        {month}
        <Info label={month}>
          <b>Income</b> is everything that came in this month, plus paydays still coming before it ends. <b>Spent</b> is what you&apos;ve spent so far. <b>Net</b> is income minus everything going out this month: spending, bills and savings moves, including what&apos;s still scheduled. Moves between your own accounts and card payments aren&apos;t counted. Tap any of them to see what it&apos;s made of.
        </Info>
      </h2>
      <ul className="grid grid-cols-3 gap-2 sm:gap-3">
        {tiles.map((t) => (
          <li key={t.k}>
            <button type="button" onClick={() => setOpen(t.k)} aria-haspopup="dialog" className="card w-full min-w-0 p-2.5 text-left transition hover:border-brand/50 sm:p-4">
              <span className="flex items-center justify-between text-[11px] text-faint sm:text-xs">{t.label}<span aria-hidden>›</span></span>
              <span className="mt-0.5 block truncate text-lg font-bold tabular text-ink sm:text-2xl">{t.value}</span>
            </button>
          </li>
        ))}
      </ul>
      {open && (
        <Modal open onClose={() => setOpen(null)} icon={open === "income" ? "income" : open === "spent" ? "spend" : "📊"} title={`${tiles.find((t) => t.k === open)!.label} · ${month}`}
          subtitle={<span className="font-num text-2xl text-display">{tiles.find((t) => t.k === open)!.value}</span>}>
          {open === "income" && <IncomeList items={ins} onHide={(k) => setHidden((h) => new Set(h).add(k))} />}
          {open === "spent" && <SpentList items={spending} />}
          {open === "net" && <NetList income={income} out={items.out} />}
        </Modal>
      )}
    </section>
  );
}

const sum = (xs: FlowItem[]) => xs.reduce((t, i) => t + i.cents, 0);

function Row({ i, sign = 1, children }: { i: FlowItem; sign?: 1 | -1; children?: React.ReactNode }) {
  return (
    <li className="flex items-center gap-3 px-3 py-2">
      <Glyph name={i.kind === "income" ? "income" : i.category ?? "spend"} size="sm" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-ink">{i.label}</span>
        <span className="block truncate text-[11px] text-muted">{formatShort(i.date)}{i.account ? ` · ${i.account}` : ""}{i.when === "coming" ? " · coming" : ""}</span>
        {children}
      </span>
      <Money cents={sign * i.cents} sign tone="auto" className={`shrink-0 text-sm font-semibold ${i.when === "coming" ? "opacity-60" : ""}`} />
    </li>
  );
}

/** Income, item by item. A move from your own account counted as income can be relabelled in one tap. */
function IncomeList({ items, onHide }: { items: FlowItem[]; onHide: (key: string) => void }) {
  const demo = useContext(DemoCtx);
  const router = useRouter();
  const [busy, start] = useTransition();
  const [note, setNote] = useState<string | null>(null);
  const notIncome = (i: FlowItem) =>
    start(async () => {
      if (demo) {
        onHide(i.key);
        return setNote("Demo: changes aren't saved.");
      }
      const r = await setTransactionCategory(i.txnId!, "Transfer");
      if (!r.ok) return setNote(r.error ?? "Couldn't save that.");
      onHide(i.key);
      setNote(`“${i.label}” is now a transfer, so it's no longer counted as income.`);
      router.refresh();
    });
  const done = items.filter((i) => i.when === "done");
  const coming = items.filter((i) => i.when === "coming");
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted">
        Not really income? Tap <b>Not income</b>.
        <Info label="Not income">Money you moved from your own savings or another account of yours isn&apos;t income. Tapping Not income relabels it as a transfer, so it stops counting here, in your budget and in your forecast.</Info>
      </p>
      {note && <p className="rounded-xl bg-surface-2/70 px-3 py-2 text-xs text-muted" aria-live="polite">{note}</p>}
      <Group title="Came in" items={done}>
        {(i) => (
          <Row key={i.key} i={i}>
            {i.txnId && (
              <button type="button" disabled={busy} onClick={() => notIncome(i)} className="mt-1 rounded-full border border-line px-2 py-0.5 text-[11px] font-semibold text-muted transition hover:border-warn/60 hover:text-ink">
                Not income
              </button>
            )}
          </Row>
        )}
      </Group>
      <Group title="Still coming" items={coming}>{(i) => <Row key={i.key} i={i} />}</Group>
    </div>
  );
}

/** Spending so far, by category (biggest first); open one to see its transactions. */
function SpentList({ items }: { items: FlowItem[] }) {
  const by = new Map<string, FlowItem[]>();
  for (const i of items) by.set(i.category ?? "Other", [...(by.get(i.category ?? "Other") ?? []), i]);
  const cats = [...by.entries()].map(([c, list]) => ({ c, list, cents: sum(list) })).sort((a, b) => b.cents - a.cents);
  const max = Math.max(1, ...cats.map((c) => c.cents));
  return (
    <ul className="space-y-1.5">
      {cats.map(({ c, list, cents }) => (
        <li key={c}>
          <details className="group rounded-xl border border-line">
            <summary className="flex cursor-pointer list-none items-center gap-3 px-3 py-2">
              <Glyph name={c} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="truncate font-medium text-ink">{c} <span className="text-xs font-normal text-faint">· {list.length}</span></span>
                  <Money cents={cents} whole className="font-semibold text-ink" />
                </span>
                <span className="mt-1 block h-1.5 rounded-full bg-surface-3"><span className="block h-1.5 rounded-full bg-out/70" style={{ width: `${(cents / max) * 100}%` }} /></span>
              </span>
            </summary>
            <ul className="divide-y divide-line border-t border-line">{list.map((i) => <Row key={i.key} i={i} sign={-1} />)}</ul>
          </details>
        </li>
      ))}
    </ul>
  );
}

/** Net, as a short sum: income, minus each kind of money going out. */
function NetList({ income, out }: { income: number; out: FlowItem[] }) {
  const parts = [
    { label: "Spent so far", list: out.filter((i) => i.kind === "spending" && i.when === "done") },
    { label: "Bills", list: out.filter((i) => i.kind === "bill") },
    { label: "Savings moves", list: out.filter((i) => i.kind === "savings") },
    { label: "Planned purchases", list: out.filter((i) => i.kind === "spending" && i.when === "coming") },
  ].filter((p) => p.list.length > 0);
  const net = income - sum(out);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between rounded-xl border border-line px-3 py-2 text-sm">
        <span className="font-medium text-ink">Income</span>
        <Money cents={income} sign tone="in" className="font-semibold" />
      </div>
      {parts.map((p) => (
        <details key={p.label} className="group rounded-xl border border-line">
          <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2 text-sm">
            <span className="font-medium text-ink">{p.label} <span className="text-xs font-normal text-faint">· {p.list.length}{p.list.some((i) => i.when === "coming") ? " · some still coming" : ""}</span></span>
            <span className="flex items-center gap-2"><Money cents={-sum(p.list)} sign tone="auto" className="font-semibold" /><span aria-hidden className="text-faint transition group-open:rotate-180">▾</span></span>
          </summary>
          <ul className="divide-y divide-line border-t border-line">{p.list.map((i) => <Row key={i.key} i={i} sign={-1} />)}</ul>
        </details>
      ))}
      <div className="flex items-center justify-between border-t-2 border-line px-3 pt-2 text-sm">
        <span className="font-bold text-ink">Net</span>
        <Money cents={net} sign tone="auto" className="font-num text-lg" />
      </div>
    </div>
  );
}

function Group({ title, items, children }: { title: string; items: FlowItem[]; children: (i: FlowItem) => React.ReactNode }) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="mb-1 flex justify-between text-xs font-semibold text-faint"><span>{title} · {items.length}</span><Money cents={sum(items)} whole /></p>
      <ul className="divide-y divide-line rounded-xl border border-line">{items.map(children)}</ul>
    </div>
  );
}
