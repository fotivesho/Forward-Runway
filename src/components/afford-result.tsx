"use client";

import { formatShort, type ISODate } from "@/lib/dates";
import { applyPlanOption } from "@/app/app/actions";
import { useContext, useState, useTransition } from "react";
import { DemoCtx } from "./form";
import { Info } from "./info";
import { BillRoom } from "./bill-room";
import { formatCents } from "@/lib/money";
import { Glyph } from "@/components/icon";
import type { AffordCheck } from "@/lib/engine";

/** Colours and icon for each verdict, shared by the checker and every plan card. */
export const LOOK = {
  yes: { panel: "border-brand/50 bg-brand/[0.07]", word: "text-brand", icon: "✓", badge: "border-brand/40 text-brand" },
  yes_with_plan: { panel: "border-warn/50 bg-warn/[0.07]", word: "text-warn", icon: "↺", badge: "border-warn/50 text-warn" },
  not_yet: { panel: "border-danger/40 bg-danger/[0.06]", word: "text-danger", icon: "✕", badge: "border-danger/50 text-danger" },
} as const;

/** Estimates read better in whole dollars. */
export const dollars = (c: number) => (c < 0 ? "−$" : "$") + Math.abs(Math.round(c / 100)).toLocaleString("en-US");
/** "Nov 25–28" within a month, "Nov 29–Dec 12" across months. */
export const span = (a: ISODate, b: ISODate) =>
  a === b ? formatShort(a) : a.slice(0, 7) === b.slice(0, 7) ? `${formatShort(a)}–${Number(b.slice(8))}` : `${formatShort(a)}–${formatShort(b)}`;

/** One answer tile: label, big number with a small note beside it, a bar, and a status line. */
export function Tile({
  label,
  value,
  aside,
  status,
  tone = "muted",
  compact = false,
  children,
}: {
  label: React.ReactNode;
  value: string;
  aside?: string;
  status: React.ReactNode;
  tone?: "muted" | "good" | "warn" | "bad";
  compact?: boolean;
  children: React.ReactNode;
}) {
  const toneClass = { muted: "text-muted", good: "text-brand", warn: "font-semibold text-warn", bad: "font-semibold text-danger" }[tone];
  return (
    <div className={`rounded-xl bg-surface/80 px-2.5 py-1.5 ${compact ? "" : "sm:p-3"}`}>
      <p className={`text-[11px] text-faint ${compact ? "" : "sm:text-xs"}`}>{label}</p>
      <p className="flex flex-wrap items-baseline gap-x-1">
        <span className={`font-bold tabular text-ink ${compact ? "text-xl" : "text-2xl sm:text-3xl"}`}>{value}</span>
        {aside && <span className={`text-[11px] text-muted ${compact ? "" : "sm:text-xs"}`}>{aside}</span>}
      </p>
      <div className="relative mt-1 h-1.5 rounded-full bg-surface-3" aria-hidden>
        {children}
      </div>
      <p className={`mt-0.5 text-[11px] ${compact ? "" : "sm:text-xs"} ${toneClass}`}>{status}</p>
    </div>
  );
}

/** Where the limit line sits on every bar, so over and under always read the same way. */
export const LINE = 70;
/**
 * Position (0–100) of a value on a bar whose limit sits at LINE%. Up to the limit scales
 * linearly; past it, `overRange` past the limit fills the remaining space (with a visible sliver minimum).
 */
export const gauge = (value: number, limit: number, overRange: number) =>
  value <= limit
    ? (Math.max(0, value) / Math.max(1, limit)) * LINE
    : LINE + Math.max(3, Math.min(1, (value - limit) / Math.max(1, overRange)) * (100 - LINE));
const w = (n: number) => `${Math.max(0, n)}%`;
export const LimitLine = () => (
  <span className="absolute -inset-y-1 w-0.5 -translate-x-1/2 rounded bg-ink" style={{ left: `${LINE}%` }} title="Limit" />
);

/**
 * The two answer tiles (free money or card statement, plus the lowest balance) and the card key.
 * `tile1After` and `lowestAfter` let the checker animate the numbers; plan cards pass nothing.
 */
export function AffordTiles({
  result,
  tile1After,
  lowestAfter,
  reservedCents = 0,
  compact = false,
}: {
  result: AffordCheck;
  tile1After?: number;
  lowestAfter?: number;
  /** Already set aside for this plan: shown as part of what it uses, so the bar isn't empty. */
  reservedCents?: number;
  compact?: boolean;
}) {
  const onCard = !!result.card && !result.cash.beyondHorizon;
  const first = tile1After ?? (onCard ? result.card!.withCents : result.room.after);
  const lowest = lowestAfter ?? result.lowest.after.cents;
  return (
    <>
      <div className={`grid grid-cols-2 gap-2 ${compact ? "" : "sm:gap-3"}`}>
        {onCard ? (
          (() => {
            const c = result.card!;
            const purchase = c.withCents - c.usualCents;
            const g = (v: number) => gauge(v, c.capCents, c.capCents);
            const over = c.withCents > c.capCents;
            // The part of this purchase that still fits under the max is green; anything past it is red.
            const fits = Math.max(0, Math.min(purchase, c.capCents - c.usualCents));
            // A small overage the next pay period absorbs is amber (still a plain yes); a real one is red.
            const overColor = result.verdict === "yes" ? "bg-warn" : "bg-danger";
            return (
              <Tile
                compact={compact}
                label={<>{c.name.split(" ")[0]} statement · {formatShort(c.due)}</>}
                value={dollars(first)}
                aside={`of ${dollars(c.capCents)} max`}
                tone={over ? (result.verdict === "yes" ? "warn" : "bad") : "good"}
                status={over ? (result.verdict === "yes" ? `${dollars(c.withCents - c.capCents)} over · next period covers it` : `over by ${dollars(c.withCents - c.capCents)}`) : `${dollars(c.capCents - c.withCents)} room left`}
              >
                <div className="absolute inset-0 flex overflow-hidden rounded-full">
                  <span className="h-full bg-faint/70" style={{ width: w(g(c.onCardCents)) }} />
                  <span className="h-full bg-info/70" style={{ width: w(g(c.usualCents) - g(c.onCardCents)) }} />
                  <span className="h-full bg-brand transition-[width] duration-500" style={{ width: w(g(c.usualCents + fits) - g(c.usualCents)) }} />
                  <span className={`h-full transition-[width] duration-500 ${overColor}`} style={{ width: w(g(c.withCents) - Math.max(g(c.usualCents), g(c.usualCents + fits))) }} />
                </div>
                <LimitLine />
              </Tile>
            );
          })()
        ) : (
          (() => {
            const r = { ...result.room, before: result.room.before + reservedCents };
            const used = r.before - r.after + r.shortfall + r.borrowed;
            const overflow = r.shortfall > 0;
            const g = (v: number) => gauge(v, r.before, r.before);
            return (
              <Tile
                compact={compact}
                label={<>Free to spend · {span(r.start, r.end)}</>}
                value={formatCents(first)}
                aside={`left of ${dollars(r.before)}`}
                tone={overflow ? "warn" : r.borrowed > 0 ? "muted" : "good"}
                status={overflow ? `short ${dollars(r.shortfall)}` : r.borrowed > 0 ? `+${dollars(r.borrowed)} from next period` : "fits this pay period"}
              >
                <div className="absolute inset-0 flex overflow-hidden rounded-full">
                  <span className="h-full bg-brand transition-[width] duration-500" style={{ width: w(g(Math.min(used, r.before))) }} />
                  <span className="h-full bg-warn transition-[width] duration-500" style={{ width: w(used > r.before ? g(used) - LINE : 0) }} />
                </div>
                <LimitLine />
              </Tile>
            );
          })()
        )}
        {(() => {
          const floor = result.floorCents;
          const cushionAfter = result.lowest.after.cents - floor;
          const below = cushionAfter < 0;
          // Floor at the line; the space to its right is the cushion you had before this purchase.
          const cushionBefore = result.lowest.before.cents - floor;
          const pos = gauge(result.lowest.after.cents, floor, cushionBefore > 0 ? cushionBefore : floor);
          return (
            <Tile
              compact={compact}
              label={<>Lowest<span className={compact ? "hidden" : "hidden sm:inline"}> balance</span>, 90 days · {formatShort(result.lowest.after.date)}</>}
              value={dollars(lowest)}
              aside={`floor ${dollars(floor)}`}
              tone={below ? "bad" : "good"}
              status={below ? `${dollars(-cushionAfter)} below your floor` : `✓ ${dollars(cushionAfter)} above your floor`}
            >
              <span className={`absolute inset-y-0 left-0 rounded-full transition-[width] duration-500 ${below ? "bg-danger" : "bg-brand"}`} style={{ width: w(pos) }} />
              <LimitLine />
            </Tile>
          );
        })()}
      </div>
      {onCard && (
        <p className={`mt-1.5 flex flex-wrap gap-x-2.5 gap-y-0.5 text-[11px] text-muted ${compact ? "" : "sm:gap-x-3 sm:text-xs"}`}>
          <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-faint/70 align-middle" />{dollars(result.card!.onCardCents)} on card</span>
          {result.card!.typicalCents > 0 && (
            <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-info/70 align-middle" />{dollars(result.card!.typicalCents)} expected</span>
          )}
          <span>
            <span className={`mr-1 inline-block h-2 w-2 rounded-full align-middle ${result.card!.withCents <= result.card!.capCents ? "bg-brand" : result.verdict === "yes" ? "bg-warn" : "bg-danger"}`} />
            {dollars(result.card!.withCents - result.card!.usualCents)} this purchase
          </span>
        </p>
      )}
    </>
  );
}

/** A calendar plan's answer, in the same shape as "Can I afford it?": verdict, tiles, and the suggested move. */
/** A small labelled meter: value, a bar with the limit line, and a one-word status. */
function Meter({ label, when, value, pos, tone, status }: { label: string; when?: string; value: string; pos: number; tone: "good" | "warn" | "bad"; status: string }) {
  const bar = { good: "bg-brand", warn: "bg-warn", bad: "bg-danger" }[tone];
  const text = { good: "text-brand", warn: "text-warn", bad: "text-danger" }[tone];
  return (
    <div className="min-w-0 flex-1 rounded-xl bg-surface px-2.5 py-2 shadow-sm">
      <p className="text-[13px] font-bold leading-tight text-ink">{label}</p>
      {when && <p className="text-[10px] leading-tight text-faint">{when}</p>}
      <p className="text-2xl font-extrabold leading-tight tabular text-ink">{value}</p>
      <div className="relative mt-1 h-2 rounded-full bg-surface-3" aria-hidden>
        <span className={`absolute inset-y-0 left-0 rounded-full ${bar}`} style={{ width: `${Math.max(0, Math.min(100, pos))}%` }} />
        <LimitLine />
      </div>
      <p className={`mt-1 text-[11px] font-semibold leading-tight ${text}`}>{status}</p>
    </div>
  );
}

/** What tapping "Do this" will do, said plainly before it happens. */
function confirmText(a: AffordCheck["action"]): string {
  const parts: string[] = [];
  const total = (a.apply?.moves ?? []).reduce((t, m) => t + m.cents, 0);
  if (total) parts.push(`plan a ${dollars(total)} transfer from savings${a.apply?.date ? ` on ${formatShort(a.apply.date)}` : ""}`);
  if (a.apply?.skipEventIds?.length) parts.push(`skip ${a.apply.skipEventIds.length === 1 ? "the other plan" : "those plans"}`);
  if (a.apply?.capCents) parts.push(`cap it at ${dollars(a.apply.capCents)}`);
  if (a.apply?.newDate) parts.push(`move it to ${formatShort(a.apply.newDate)}`);
  if (!parts.length) parts.push("keep it and spend lighter until then");
  return `This will ${parts.join(", ")}. Go ahead?`;
}

/** Option titles short enough for one line: "Move $410 from savings", "Skip Lake trip + $150 savings". */
function shortTitle(t: string): string {
  return t
    .replace(/ by [A-Z][a-z]{2} \d+$/, "")
    .replace(/ from [^$]*?(Savings|savings|Fund|fund)\b.*$/, " from savings")
    .replace(/ and move (\$[\d,]+)$/, " + $1 savings")
    .replace(/^Skip (Weekend |The )?/, "Skip ");
}

/** A one-line "doable" headline from the main option. */
function doableTitle(a: AffordCheck["action"]): string {
  const amt = a.title.match(/\$[\d,]+(?:\.\d\d)?/)?.[0];
  switch (a.kind) {
    case "move":
      return amt ? `Doable with ${amt} from savings` : "Doable with savings";
    case "skip_plan":
      return "Doable if you skip a plan";
    case "lean":
      return "Doable if you run lean";
    case "wait":
      return "Doable if you wait";
    case "cheaper":
      return amt ? `Doable at ${amt}` : "Doable for less";
    default:
      return "Doable";
  }
}

/** The answer in plain words: a short headline and one sentence of why, with the real numbers. */
export function explain(check: AffordCheck, reservedCents = 0): { title: string; why: string } {
  const r = check.room;
  const period = span(r.start, r.end);
  const floor = check.floorCents;
  const after = check.lowest.after.cents;
  const below = after < floor;
  const card = check.card && !check.cash.beyondHorizon ? check.card : null;

  if (check.verdict === "yes") {
    if (reservedCents > 0 && check.headline === "Yes, it's already planned.") {
      return { title: "Already covered", why: `${dollars(reservedCents)} already set aside for this.` };
    }
    if (card) {
      return { title: "You're good", why: `${card.name.split(" ")[0]} bill ${formatShort(card.due)} becomes ${dollars(card.withCents)}, payable in full.` };
    }
    if (r.borrowed > 0) {
      return { title: "You're good, just", why: `Uses ${dollars(r.borrowed)} of next pay period's money.` };
    }
    return { title: "You're good", why: `${dollars(r.after)} left for ${period} after this.` };
  }
  const gap = below
    ? `Drops you to ${dollars(after)}, under your ${dollars(floor)} cushion.`
    : card
      ? `${card.name.split(" ")[0]} bill would be ${dollars(card.withCents - card.capCents)} more than you can pay.`
      : `${dollars(r.shortfall)} over your ${dollars(r.before)} for ${period}.`;
  if (check.verdict === "yes_with_plan") return { title: doableTitle(check.action), why: gap };
  return { title: "Not yet", why: `${gap} Savings can't cover it yet.` };
}

/**
 * A plan's answer at a glance: a plain headline in the verdict's colour, one sentence of why,
 * and two numbers anyone can read: spending money left, and the lowest your balance gets.
 */
export function PlanImpact({
  check: base,
  reservedCents = 0,
  eventId,
  payWith,
  preview,
}: {
  check: AffordCheck;
  /** Tap an option to see its effect before doing it. */
  preview?: (option: AffordCheck["action"]) => AffordCheck | null;
  reservedCents?: number;
  /** A saved plan: options get a "Do this" button. */
  eventId?: string;
  /** The payment method shown; doing an option also saves it. */
  payWith?: string | null;
}) {
  const [trying, setTrying] = useState<string | null>(null);
  const tried = trying ? [base.action, ...base.alternatives].find((x) => x.title === trying) : undefined;
  const previewed = tried && preview ? preview(tried) : null;
  const check = previewed ?? base;
  const look = LOOK[check.verdict];
  const card = check.card && !check.cash.beyondHorizon ? check.card : null;
  const r = { ...check.room, before: check.room.before + reservedCents };
  const used = r.before - r.after + r.shortfall + r.borrowed;
  const floor = check.floorCents;
  const after = check.lowest.after.cents;
  const cushionBefore = check.lowest.before.cents - floor;
  const { title, why } = explain(check, reservedCents);
  const [chosen, setChosen] = useState<{ option: AffordCheck["action"]; payWith?: string | null; decline?: boolean } | null>(null);
  const demo = useContext(DemoCtx);
  if (chosen) return <ChosenBanner chosen={chosen} demo={demo} card={check.cash.viaCard ?? null} />;
  const days = Math.max(1, Math.round((Date.parse(r.end) - Date.parse(r.start)) / 86_400_000) + 1);
  return (
    <div className={`mt-2 rounded-xl border p-3 ${look.panel}`}>
      <p className={`flex items-center gap-1.5 whitespace-nowrap text-base font-bold leading-tight ${look.word}`}>
        <span aria-hidden>{look.icon}</span>
        <span className="truncate">{title}</span>
        <Info label="Why">
          {why}
          {check.cash.viaCard && !check.cash.beyondHorizon && <> On {check.cash.viaCard.split(" ")[0]}, cash leaves {formatShort(check.cash.date)}.</>}
          <span className="mt-2 block text-muted">
            <strong className="text-ink">Spending money</strong>: what's left this pay period after bills, savings and other plans. <strong className="text-ink">Lowest balance</strong>: the tightest your account gets in 90 days. <strong className="text-ink">Cushion</strong> ({dollars(floor)}): what you never want to go below.
          </span>
        </Info>
      </p>
      <div className="mt-3 flex gap-3">
        {card ? (
<BillRoom usualCents={card.usualCents} withCents={card.withCents} capCents={card.capCents} due={card.due} fits={check.verdict === "yes"} />
        ) : (
          <Meter
            label="Spending money"
            when={span(r.start, r.end)}
            value={dollars(r.after)}
            pos={gauge(used, r.before, r.before)}
            tone={r.shortfall > 0 ? "warn" : "good"}
            status={r.shortfall > 0 ? `${dollars(r.shortfall)} short` : `~${dollars(Math.floor(r.after / days))}/day of ${dollars(r.before)}`}
          />
        )}
        <Meter
          label="Lowest balance"
          when={formatShort(check.lowest.after.date)}
          value={dollars(after)}
          pos={gauge(after, floor, cushionBefore > 0 ? cushionBefore : floor)}
          tone={after < floor ? "bad" : "good"}
          status={after < floor ? `${dollars(floor - after)} below cushion` : `${dollars(after - floor)} above cushion`}
        />
      </div>
      {base.verdict !== "yes" && (() => {
        const opts = [base.action, ...base.alternatives].filter((x) => x.kind !== "none");
        if (!opts.length) return null;
        const tint: Record<string, string> = {
          move: "border-warn/50 bg-warn/10",
          skip_plan: "border-info/50 bg-info/10",
          lean: "border-brand/50 bg-brand/10",
          wait: "border-brand/50 bg-brand/10",
          goal: "border-info/50 bg-info/10",
          cheaper: "border-line bg-surface-2",
        };
        const icon: Record<string, string> = { move: "🛟", skip_plan: "✂️", lean: "🥗", wait: "⏳", goal: "🎯", cheaper: "🏷️" };
        return (
          <div className="mt-3">
            <p className="mb-1.5 flex items-center justify-between text-sm font-bold text-ink">
              Options
              {preview && <span className="text-[11px] font-normal text-faint">{previewed ? <button type="button" className="underline" onClick={() => setTrying(null)}>Back to without</button> : "Tap one to see it"}</span>}
            </p>
            <ul className="grid grid-cols-[minmax(0,1fr)] gap-1.5">
              {opts.map((x, i) => (
                <li key={x.title} className={`flex min-w-0 items-center gap-2 rounded-lg border px-2.5 py-1.5 transition ${tint[x.kind] ?? "border-line bg-surface-2"} ${trying === x.title ? "ring-2 ring-ink/60" : ""}`}>
                  <p
                    className={`flex min-w-0 flex-1 items-center gap-1.5 text-[13px] font-semibold leading-snug text-ink ${preview && x.apply ? "cursor-pointer" : ""}`}
                    role={preview && x.apply ? "button" : undefined}
                    tabIndex={preview && x.apply ? 0 : undefined}
                    aria-pressed={preview && x.apply ? trying === x.title : undefined}
                    onClick={preview && x.apply ? () => setTrying((t) => (t === x.title ? null : x.title)) : undefined}
                    onKeyDown={preview && x.apply ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setTrying((t) => (t === x.title ? null : x.title)); } } : undefined}
                  >
                    <Glyph name={icon[x.kind]} size="xs" />
                    <span className="min-w-0" title={x.title}>
                      {i === 0 && <span className="mr-1 text-warn" title="Best option">★</span>}
                      {shortTitle(x.title)}
                      {x.detail && <Info label={`About: ${x.title}`}>{x.detail}</Info>}
                    </span>
                  </p>
                    {eventId && (x.apply || x.kind === "lean") && (
                      <DoThis
                        eventId={eventId}
                        option={x}
                        payWith={payWith}
                        primary={i === 0}
                        onDone={() => setChosen({ option: x, payWith })}
                      />
                    )}
                </li>
              ))}
            </ul>
            {eventId && (
              <div className="mt-2 flex justify-end">
                <DoThis eventId={eventId} option={{ kind: "none", title: "Skip this plan", detail: "" }} decline onDone={() => setChosen({ option: { kind: "none", title: "Skip this plan", detail: "" }, decline: true })} />
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}

/** "Do this" / "Skip this plan": asks once, does it (or, in the demo, shows what it would do). */
function DoThis({
  eventId,
  option,
  payWith,
  primary = false,
  decline = false,
  onDone,
}: {
  eventId: string;
  option: AffordCheck["action"];
  payWith?: string | null;
  primary?: boolean;
  decline?: boolean;
  onDone: () => void;
}) {
  const demo = useContext(DemoCtx);
  const [pending, start] = useTransition();
  const run = () => {
    const msg = decline ? "Skip this plan? Its money goes back to everyday spending." : confirmText(option);
    if (!window.confirm(demo ? `${msg}\n\n(Demo: nothing is saved.)` : msg)) return;
    if (demo) return onDone();
    start(async () => {
      const f = new FormData();
      f.set("eventId", eventId);
      f.set("kind", decline ? "decline" : option.kind);
      f.set("apply", JSON.stringify({ ...(option.apply ?? {}), ...(payWith !== undefined ? { paymentAccountId: payWith } : {}) }));
      await applyPlanOption(f);
      onDone();
    });
  };
  return (
    <button type="button" onClick={run} disabled={pending} className={`btn btn-sm shrink-0 ${decline ? "btn-ghost" : primary ? "btn-primary" : "btn-secondary"}`}>
      {pending ? "…" : decline ? "Skip this plan" : "Do this"}
    </button>
  );
}

/** What was just set up, in plain words. */
function ChosenBanner({ chosen, demo, card }: { chosen: { option: AffordCheck["action"]; payWith?: string | null; decline?: boolean }; demo: boolean; card: string | null }) {
  const a = chosen.option.apply ?? {};
  const moved = (a.moves ?? []).reduce((t, m) => t + m.cents, 0);
  const lines: string[] = [];
  if (chosen.decline) lines.push("Skipped. Its money is back in everyday spending.");
  else {
    if (chosen.payWith !== undefined) lines.push(chosen.payWith ? `Paying with ${card?.split(" ")[0] ?? "credit"}` : "Paying with debit");
    if (moved) lines.push(`${dollars(moved)} from savings scheduled${a.date ? ` for ${formatShort(a.date)}` : ""}`);
    if (a.skipEventIds?.length) lines.push(`${a.skipEventIds.length === 1 ? "Other plan" : "Other plans"} skipped`);
    if (a.capCents) lines.push(`Capped at ${dollars(a.capCents)}`);
    if (a.newDate) lines.push(`Moved to ${formatShort(a.newDate)}`);
    if (chosen.option.kind === "lean") lines.push("Daily caps tighten until then");
  }
  return (
    <div className={`mt-2 rounded-xl border p-3 ${chosen.decline ? "border-line bg-surface-2" : "border-brand/50 bg-brand/[0.08]"}`} role="status">
      <p className={`text-base font-bold ${chosen.decline ? "text-ink" : "text-brand"}`}>{chosen.decline ? "Plan skipped" : "✓ Plan set"}</p>
      <ul className="mt-1 space-y-0.5 text-sm text-ink">{lines.map((l) => <li key={l}>• {l}</li>)}</ul>
      <p className="mt-1.5 text-[11px] text-muted">{demo ? "Demo preview: in your account this updates your forecast, caps and calendar." : "Your forecast, caps and calendar are updated."}</p>
    </div>
  );
}
