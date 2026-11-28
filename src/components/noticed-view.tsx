"use client";

import { useContext, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { EyeOff, Sparkles, ThumbsDown, ThumbsUp } from "lucide-react";
import { rateInsight, snoozeInsight } from "@/app/app/actions";
import { formatShort } from "@/lib/dates";
import type { Noticed } from "@/lib/view/noticed";
import { sameThing } from "@/lib/view/history";
import { DemoCtx } from "./form";
import { Glyph } from "@/components/icon";
import { HistoryChart } from "./history-chart";
import { Info } from "./info";
import { Modal } from "./modal";
import { Money } from "./privacy";
import { useTxnDrill } from "./txn-drill";
import { MerchantDrill } from "./transaction-list";

const STAT = { good: "text-brand", warn: "text-warn", info: "text-display" } as const;
const WASH = { good: "from-brand/15", warn: "from-warn/15", info: "from-info/12" } as const;
const RING = { good: "border-brand/40", warn: "border-warn/45", info: "border-line" } as const;

/**
 * The top of Trends: what we noticed, biggest first. The lead one large, with its evidence right
 * there; the rest a tap away. Each opens with the bars and charges behind it, what to do about it,
 * and whether it was useful.
 */
export function NoticedView({ items, base }: { items: Noticed[]; base: string }) {
  const [open, setOpen] = useState<Noticed | null>(null);
  if (!items.length) {
    return (
      <section className="card p-5" aria-labelledby="noticed-title">
        <h2 id="noticed-title" className="flex items-center gap-1.5 text-base font-bold text-ink"><Sparkles size={16} className="text-brand" aria-hidden /> Noticed</h2>
        <p className="mt-2 text-sm text-muted">Nothing stands out right now. As more history comes in, what&apos;s worth knowing shows up here first.</p>
      </section>
    );
  }
  const [lead, ...rest] = items;
  return (
    <section aria-labelledby="noticed-title" className="space-y-3">
      <h2 id="noticed-title" className="flex items-center gap-1.5 text-base font-bold text-ink">
        <Sparkles size={16} className="text-brand" aria-hidden /> Noticed
        <Info label="Noticed">What stands out in your money right now, ranked by the dollars at stake. Tap one for the months and charges behind it and what you can do. Tell us if it was useful: the kinds you find useful come first next time.</Info>
      </h2>

      <article className={`card overflow-hidden ${RING[lead!.tone]}`}>
        <button type="button" onClick={() => setOpen(lead!)} className={`block w-full bg-gradient-to-br ${WASH[lead!.tone]} to-transparent p-5 text-left`}>
          <div className="flex items-start gap-3">
            <Glyph name={lead!.icon} size="md" />
            <div className="min-w-0 flex-1">
              <p className="font-serif text-xl font-bold leading-snug text-ink">{lead!.title}</p>
              <p className={`mt-1 font-num text-5xl leading-none tracking-tight ${STAT[lead!.tone]}`}>{lead!.stat}</p>
            </div>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-muted">{lead!.detail}</p>
        </button>
        {lead!.bars && lead!.bars.length > 1 && (
          <div className="px-5 pb-1">
            <HistoryChart bars={lead!.bars} tone={lead!.tone === "good" ? "in" : "out"} selected={null} onSelect={() => setOpen(lead!)} />
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2 px-5 pb-4 pt-2">
          {lead!.actions.map((a) => <Link key={a.path} href={base + a.path} className="btn btn-secondary btn-sm">{a.label}</Link>)}
          <button type="button" onClick={() => setOpen(lead!)} className="btn btn-ghost btn-sm">The details</button>
        </div>
      </article>

      {rest.length > 0 && (
        <ul className="card divide-y divide-line p-1">
          {rest.map((n) => (
            <li key={n.id}>
              <button type="button" onClick={() => setOpen(n)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-surface-2/60">
                <Glyph name={n.icon} size="sm" />
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{n.title}</span>
                <span className={`shrink-0 font-num text-base ${STAT[n.tone]}`}>{n.stat}</span>
                <span aria-hidden className="text-faint">›</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {open && <NoticedModal n={open} base={base} onClose={() => setOpen(null)} />}
    </section>
  );
}

/** One insight, in full: the number, why, the evidence, what to do, and was it useful. */
function NoticedModal({ n, base, onClose }: { n: Noticed; base: string; onClose: () => void }) {
  const demo = useContext(DemoCtx);
  const router = useRouter();
  const drill = useTxnDrill();
  const [txn, setTxn] = useState<string | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [rated, setRated] = useState<boolean | null>(null);
  const [busy, start] = useTransition();
  // The charges behind it: the ones it names, or this month's in its category / at its merchant.
  const monthStart = drill ? `${drill.today.slice(0, 7)}-01` : "";
  const evidence = drill
    ? n.txnIds?.length
      ? drill.txns.filter((t) => n.txnIds!.includes(t.id))
      : drill.txns
          .filter((t) => t.direction === "out" && t.status === "posted" && (sel ? t.date.startsWith(sel.slice(0, 7)) : t.date >= monthStart) && (n.merchant ? sameThing(t.description, n.merchant) : n.category ? (t.category ?? "") === n.category : false))
          .sort((a, b) => (a.date < b.date ? 1 : -1))
          .slice(0, 12)
    : [];
  const rate = (useful: boolean) =>
    start(async () => {
      setRated(useful);
      if (!demo) await rateInsight(n.id, n.kind, useful, n.title);
    });
  const snooze = () =>
    start(async () => {
      if (!demo) await snoozeInsight(n.id, 30);
      onClose();
      router.refresh();
    });

  return (
    <Modal open onClose={onClose} icon={n.icon} title={n.title} subtitle={<span className={`font-num text-base ${STAT[n.tone]}`}>{n.stat}</span>}>
      {txn ? (
        <MerchantDrill txnId={txn} onBack={() => setTxn(null)} />
      ) : (
        <div className="space-y-4">
          <p className="text-sm leading-relaxed text-ink">{n.detail}</p>
          {n.bars && n.bars.length > 1 && <HistoryChart bars={n.bars} tone={n.tone === "good" ? "in" : "out"} selected={sel} onSelect={(k) => setSel(sel === k ? null : k)} />}
          {evidence.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-bold text-ink">{n.txnIds?.length ? "The charges" : sel ? "That month" : "This month"}</p>
              <ul className="divide-y divide-line rounded-xl border border-line">
                {evidence.map((t) => (
                  <li key={t.id}>
                    <button type="button" onClick={() => setTxn(t.id)} className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition hover:bg-surface-2/60">
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-ink">{t.description}</span>
                        <span className="block text-[11px] text-muted">{formatShort(t.date)} · {drill!.accountName(t.accountId)}</span>
                      </span>
                      <span className="flex shrink-0 items-center gap-1.5"><Money cents={-t.amountCents} sign tone="auto" className="font-semibold" /><span aria-hidden className="text-faint">›</span></span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {n.actions.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {n.actions.map((a) => <Link key={a.path} href={base + a.path} className="btn btn-primary btn-sm">{a.label}</Link>)}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3 text-xs text-muted">
            {rated == null ? (
              <>
                <span>Useful?</span>
                <button type="button" disabled={busy} onClick={() => rate(true)} aria-label="Useful" className="flex h-8 w-8 items-center justify-center rounded-full border border-line transition hover:border-brand/60"><ThumbsUp size={14} aria-hidden /></button>
                <button type="button" disabled={busy} onClick={() => rate(false)} aria-label="Not useful" className="flex h-8 w-8 items-center justify-center rounded-full border border-line transition hover:border-warn/60"><ThumbsDown size={14} aria-hidden /></button>
              </>
            ) : (
              <span>{rated ? "Thanks: more like this first." : "Got it: fewer like this."}{demo ? " (Demo: not saved.)" : ""}</span>
            )}
            <button type="button" disabled={busy} onClick={snooze} className="ml-auto inline-flex items-center gap-1 font-semibold text-muted transition hover:text-ink"><EyeOff size={13} aria-hidden /> Hide for 30 days</button>
          </div>
        </div>
      )}
    </Modal>
  );
}

/** On Today: the one thing worth knowing, a tap from the rest. */
export function NoticedLine({ items, base }: { items: Noticed[]; base: string }) {
  const lead = items[0];
  if (!lead) return null;
  return (
    <Link href={base + "/spend/trends"} className={`card flex items-center gap-3 border p-3 transition hover:bg-surface-2/60 ${RING[lead.tone]}`}>
      <Glyph name={lead.icon} size="sm" />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-faint"><Sparkles size={11} aria-hidden /> Noticed{items.length > 1 ? ` · ${items.length - 1} more` : ""}</span>
        <span className="block truncate text-sm font-semibold text-ink">{lead.title}</span>
      </span>
      <span className={`shrink-0 font-num text-lg ${STAT[lead.tone]}`}>{lead.stat}</span>
      <span aria-hidden className="text-faint">›</span>
    </Link>
  );
}
