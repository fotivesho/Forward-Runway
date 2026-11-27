"use client";

import { useContext, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setTransactionCategory } from "@/app/app/actions";
import { formatShort } from "@/lib/dates";
import type { FlowItem } from "@/lib/view/spend";
import { DemoCtx } from "./form";
import { Glyph } from "@/components/icon";
import { CategoryMenu } from "./category-menu";
import { INCOME_CATEGORIES, NOT_SPENDING } from "@/lib/categories";
import { Info } from "./info";
import { Modal } from "./modal";
import { Money } from "./privacy";

type Which = "income" | "fixed" | "spent" | "net";

/**
 * The month at a glance: Income, Spent, Net, each one tappable to see exactly what it's made of,
 * so a wrong number (a transfer counted as income) is easy to spot and fix.
 */
export function MonthTiles({ month, items, today, expectedPerDayCents, calendarHref, limit }: { month: string; items: { in: FlowItem[]; out: FlowItem[] }; today: string; expectedPerDayCents?: number; calendarHref?: string; limit?: { cents: number; until: string; href: string } }) {
  const [open, setOpen] = useState<Which | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const ins = items.in.filter((i) => !hidden.has(i.key));
  const income = sum(ins);
  const spending = items.out.filter((i) => i.kind === "spending" && i.when === "done");
  const spent = sum(spending);
  // Everything else going out: bills, savings moves, plans and planned purchases (paid or still coming).
  const fixedItems = items.out.filter((i) => !(i.kind === "spending" && i.when === "done"));
  const fixed = sum(fixedItems);
  const net = income - fixed - spent;
  // Read as one sum: Income − Fixed − Spent = Net.
  const tiles: Array<{ k: Which; label: string; op: string; value: React.ReactNode }> = [
    { k: "income", label: "Income", op: "", value: <Money cents={income} whole tone="in" /> },
    { k: "fixed", label: "Fixed", op: "−", value: <Money cents={fixed} whole /> },
    { k: "spent", label: "Spent", op: "−", value: <Money cents={spent} whole /> },
    { k: "net", label: "Net", op: "=", value: <Money cents={net} whole sign tone="auto" /> },
  ];
  return (
    <section aria-labelledby="month-title">
      <h2 id="month-title" className="mb-2 flex items-center text-sm font-bold text-ink">
        {month}
        <Info label={month}>
          <b>Income</b> is everything that came in this month, plus paydays still coming before it ends. <b>Fixed</b> is what&apos;s spoken for: bills, subscriptions, loan payments, savings moves and plans, paid or still coming. <b>Spent</b> is your everyday spending so far. <b>Net</b> is income − fixed − spent: what the month leaves you with. Moves between your own accounts and card payments aren&apos;t counted. Tap any of them to see what it&apos;s made of.
        </Info>
      </h2>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
        {tiles.map((t) => (
          <li key={t.k}>
            <button type="button" onClick={() => setOpen(t.k)} aria-haspopup="dialog" className="card w-full min-w-0 p-2.5 text-left transition hover:border-brand/50 sm:p-4">
              <span className="flex items-center justify-between text-[11px] text-faint sm:text-xs"><span>{t.op && <span className="mr-1 font-bold text-muted">{t.op}</span>}{t.label}</span><span aria-hidden>›</span></span>
              <span className="mt-0.5 block truncate text-lg font-bold tabular text-ink sm:text-2xl">{t.value}</span>
            </button>
          </li>
        ))}
      </ul>
      {expectedPerDayCents !== undefined && (
        <WhereItGoes income={income} out={items.out} today={today} expectedPerDayCents={expectedPerDayCents} calendarHref={calendarHref} limit={limit} />
      )}
      {open && (
        <Modal open onClose={() => setOpen(null)} icon={open === "income" ? "income" : open === "spent" ? "spend" : open === "fixed" ? "bill" : "📊"} title={`${tiles.find((t) => t.k === open)!.label} · ${month}`}
          subtitle={<span className="font-num text-2xl text-display">{tiles.find((t) => t.k === open)!.value}</span>}>
          {open === "income" && <IncomeList items={ins} onHide={(k) => setHidden((h) => new Set(h).add(k))} />}
          {open === "spent" && <SpentList items={spending} />}
          {open === "fixed" && (
            <div className="space-y-3">
              <Group title="Paid" items={fixedItems.filter((i) => i.when === "done")}>{(i) => <Row key={i.key} i={i} sign={-1} />}</Group>
              <Group title="Still coming" items={fixedItems.filter((i) => i.when === "coming")}>{(i) => <Row key={i.key} i={i} sign={-1} />}</Group>
            </div>
          )}
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

/** Income, item by item. Each one's category is a tap away: a refund goes back to its spending category, a move between your accounts becomes a transfer. */
function IncomeList({ items, onHide }: { items: FlowItem[]; onHide: (key: string) => void }) {
  const demo = useContext(DemoCtx);
  const router = useRouter();
  const [busy, start] = useTransition();
  const [note, setNote] = useState<string | null>(null);
  const [cats, setCats] = useState<Record<string, string>>({});
  const choose = (i: FlowItem, c: string) =>
    start(async () => {
      if (!demo) {
        const r = await setTransactionCategory(i.txnId!, c);
        if (!r.ok) return setNote(r.error ?? "Couldn't save that.");
      }
      setCats((x) => ({ ...x, [i.key]: c }));
      const stays = INCOME_CATEGORIES.has(c);
      if (!stays) onHide(i.key);
      setNote(
        (demo ? "Demo: not saved. " : "") +
          (stays ? `“${i.label}” is now ${c}.` : NOT_SPENDING.has(c) ? `“${i.label}” is now a transfer, so it's not income.` : `“${i.label}” is now a ${c} refund: it lowers your ${c} spending instead of counting as income.`),
      );
      if (!demo) router.refresh();
    });
  const done = items.filter((i) => i.when === "done");
  const coming = items.filter((i) => i.when === "coming");
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted">
        Tap a category to fix it.
        <Info label="Fixing income">A refund (like money back from DoorDash) belongs to its spending category, so pick Dining and it lowers your Dining spending instead. Money moved from your own savings or another account of yours is a Transfer. Anything else stays as income.</Info>
      </p>
      {note && <p className="rounded-xl bg-surface-2/70 px-3 py-2 text-xs text-muted" aria-live="polite">{note}</p>}
      <Group title="Came in" items={done}>
        {(i) => (
          <Row key={i.key} i={i}>
            {i.txnId && (
              <>
                <span className="mt-1 block"><CategoryMenu size="sm" direction="in" disabled={busy} value={cats[i.key] ?? i.category ?? "Income"} onPick={(c) => choose(i, c)} /></span>
              </>
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
    { label: "Calendar plans", list: out.filter((i) => i.kind === "plan") },
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

/**
 * The month in one picture: income, minus what's fixed (bills, savings moves, plans), leaves what
 * you live on; part of that's already spent; the rest, spread over the days left, against what a
 * day usually costs you.
 */
function WhereItGoes({ income, out, today, expectedPerDayCents, calendarHref, limit }: { income: number; out: FlowItem[]; today: string; expectedPerDayCents: number; calendarHref?: string; limit?: { cents: number; until: string; href: string } }) {
  const [drill, setDrill] = useState<string | null>(null);
  const parts = [
    { k: "Fixed", list: out.filter((i) => i.kind === "bill" || i.kind === "savings" || (i.kind === "spending" && i.when === "coming")), color: "bg-out/80", sign: -1 as const },
    { k: "Plans", list: out.filter((i) => i.kind === "plan"), color: "bg-info", sign: -1 as const },
    { k: "Spent", list: out.filter((i) => i.kind === "spending" && i.when === "done"), color: "bg-warn", sign: -1 as const },
  ];
  const fixed = sum(parts[0]!.list) + sum(parts[1]!.list);
  const spent = sum(parts[2]!.list);
  const free = income - fixed;
  const left = free - spent;
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));
  const daysLeft = new Date(Date.UTC(y, m, 0)).getUTCDate() - Number(today.slice(8)) + 1;
  // Today's limit comes from the same plan as Today (payday, floor and card payments included).
  const perDay = limit ? limit.cents : Math.round(Math.max(0, left) / daysLeft);
  const scale = Math.max(1, income, fixed + spent);
  const pct = (c: number) => `${Math.max(0, (c / scale) * 100)}%`;
  const ok = perDay >= expectedPerDayCents;
  const gap = Math.abs(perDay - expectedPerDayCents);
  const open = parts.find((p) => p.k === drill);
  return (
    <div className="card mt-3 p-4">
      <p className="flex items-center text-sm font-bold text-ink">
        Where it goes
        <Info label="Where it goes">
          <b>Fixed</b> is what&apos;s already spoken for: repeating bills and savings moves, paid or still coming. <b>Plans</b> are the calendar plans still ahead this month, at their estimated cost. Income minus both is what you have to <b>live on</b>. Everyday spending so far comes out of that, and what&apos;s <b>left</b> is spread over the days remaining. <b>Today&apos;s limit</b> is the same number as on Today: a reasonable most to spend today, after bills, plans, card payments and your floor until payday. <b>A usual day</b> is what everyday life typically costs you. Tap any part to see what&apos;s in it.
        </Info>
      </p>
      <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-surface-3" aria-hidden>
        {parts.map((p) => <span key={p.k} className={`h-full ${p.color}`} style={{ width: pct(sum(p.list)) }} />)}
        <span className="h-full bg-brand" style={{ width: pct(Math.max(0, left)) }} />
      </div>
      <ul className="mt-2 grid grid-cols-4 gap-1.5 text-xs">
        {parts.map((p) => (
          <li key={p.k}>
            <button type="button" onClick={() => setDrill(p.k)} disabled={p.list.length === 0} className="w-full rounded-lg px-1 py-1 text-left transition hover:bg-surface-2 disabled:opacity-60">
              <span className="flex items-center gap-1 text-muted"><span className={`h-2 w-2 rounded-full ${p.color}`} />{p.k}{p.list.length > 0 && <span aria-hidden className="text-faint">›</span>}</span>
              <Money cents={sum(p.list)} whole className="font-semibold text-ink" />
            </button>
          </li>
        ))}
        <li className="px-1 py-1"><span className="flex items-center gap-1 text-muted"><span className="h-2 w-2 rounded-full bg-brand" />Left</span><Money cents={left} whole className={`font-semibold ${left < 0 ? "text-danger" : "text-ink"}`} /></li>
      </ul>
      {open && (
        <Modal open onClose={() => setDrill(null)} icon={open.k === "Plans" ? "plan" : open.k === "Spent" ? "spend" : "bill"} title={open.k} subtitle={<span className="font-num text-2xl text-display"><Money cents={sum(open.list)} whole /></span>}>
          <div className="space-y-3">
            <Group title={open.k === "Plans" ? "Still ahead" : "This month"} items={open.list}>{(i) => <Row key={i.key} i={i} sign={open.sign} />}</Group>
            {open.k === "Plans" && calendarHref && <a href={calendarHref} className="block text-center text-xs font-semibold text-brand">Open them in Calendar ›</a>}
          </div>
        </Modal>
      )}
      <p className="mt-1 text-[11px] text-faint">
        <Money cents={income} whole /> income − <Money cents={fixed} whole /> fixed &amp; plans = <Money cents={free} whole /> to live on
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-surface-2/60 px-3 py-2">
          <p className="text-[11px] text-faint">Today&apos;s limit</p>
          <p className={`font-num text-2xl leading-tight ${ok ? "text-display" : "text-warn"}`}><Money cents={perDay} whole /></p>
        </div>
        <div className="rounded-xl bg-surface-2/60 px-3 py-2">
          <p className="text-[11px] text-faint">A usual day</p>
          <p className="font-num text-2xl leading-tight text-muted"><Money cents={expectedPerDayCents} whole /></p>
        </div>
      </div>
      <p className={`mt-2 text-xs ${ok ? "text-brand" : "text-warn"}`}>
        {perDay <= 0 ? "Nothing to spare today." : ok ? <>On track: about <Money cents={gap} whole /> more than a usual day.</> : <>Tight: about <Money cents={gap} whole /> less than a usual day.</>}
      </p>
      {limit && <a href={limit.href} className="mt-1 block text-xs font-semibold text-brand">Every day to {limit.until} ›</a>}
    </div>
  );
}
