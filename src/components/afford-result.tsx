"use client";

import { formatShort, type ISODate } from "@/lib/dates";
import { formatCents } from "@/lib/money";
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
      <p className="text-[11px] font-semibold leading-tight text-muted">{label}</p>
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
  const days = Math.max(1, Math.round((Date.parse(r.end) - Date.parse(r.start)) / 86_400_000) + 1);
  const perDay = dollars(Math.floor(r.after / days));

  if (check.verdict === "yes") {
    if (reservedCents > 0 && check.headline === "Yes, it's already planned.") {
      return { title: "Already covered", why: `Your spending plan already holds ${dollars(reservedCents)} for this, so nothing else changes.` };
    }
    if (card) {
      return { title: "You're good", why: `It goes on your ${card.name.split(" ")[0]}. The bill due ${formatShort(card.due)} would be ${dollars(card.withCents)}, which you can pay in full.` };
    }
    if (r.borrowed > 0) {
      return { title: "You're good, just", why: `It's ${dollars(r.borrowed)} more than your spending money for ${period}, so the next pay period gives up about that much.` };
    }
    return { title: "You're good", why: `You'd still have ${dollars(r.after)} to spend ${period}, about ${perDay} a day.` };
  }
  const gap = below
    ? `It would take your lowest balance to ${dollars(after)}, below the ${dollars(floor)} cushion you keep.`
    : card
      ? `The ${card.name.split(" ")[0]} bill due ${formatShort(card.due)} would be ${dollars(card.withCents)}, ${dollars(card.withCents - card.capCents)} more than you can pay in full.`
      : `It's ${dollars(r.shortfall)} more than the ${dollars(r.before)} you have to spend ${period}.`;
  if (check.verdict === "yes_with_plan") return { title: doableTitle(check.action), why: gap };
  return { title: "Not yet", why: `${gap} Even your savings can't cover it right now.` };
}

/**
 * A plan's answer at a glance: a plain headline in the verdict's colour, one sentence of why,
 * and two numbers anyone can read: spending money left, and the lowest your balance gets.
 */
export function PlanImpact({ check, reservedCents = 0 }: { check: AffordCheck; reservedCents?: number }) {
  const look = LOOK[check.verdict];
  const card = check.card && !check.cash.beyondHorizon ? check.card : null;
  const r = { ...check.room, before: check.room.before + reservedCents };
  const used = r.before - r.after + r.shortfall + r.borrowed;
  const floor = check.floorCents;
  const after = check.lowest.after.cents;
  const cushionBefore = check.lowest.before.cents - floor;
  const { title, why } = explain(check, reservedCents);
  const days = Math.max(1, Math.round((Date.parse(r.end) - Date.parse(r.start)) / 86_400_000) + 1);
  return (
    <div className={`mt-2 rounded-xl border p-3 ${look.panel}`}>
      <p className={`flex items-center gap-1.5 truncate whitespace-nowrap text-base font-bold leading-tight ${look.word}`}>
        <span aria-hidden>{look.icon}</span>
        <span className="truncate">{title}</span>
      </p>
      <p className="mt-0.5 text-xs leading-snug text-muted">{why}</p>
      <div className="mt-3 flex gap-3">
        {card ? (
          <Meter
            label={`${card.name.split(" ")[0]} bill`}
            when={`due ${formatShort(card.due)}`}
            value={dollars(card.withCents)}
            pos={gauge(card.withCents, card.capCents, card.capCents)}
            tone={card.withCents > card.capCents ? (check.verdict === "yes" ? "warn" : "bad") : "good"}
            status={card.withCents > card.capCents ? `${dollars(card.withCents - card.capCents)} over what you can pay` : `you can pay up to ${dollars(card.capCents)}`}
          />
        ) : (
          <Meter
            label="Spending money left"
            when={span(r.start, r.end)}
            value={dollars(r.after)}
            pos={gauge(used, r.before, r.before)}
            tone={r.shortfall > 0 ? "warn" : "good"}
            status={r.shortfall > 0 ? `${dollars(r.shortfall)} short` : `~${dollars(Math.floor(r.after / days))}/day of ${dollars(r.before)}`}
          />
        )}
        <Meter
          label="Lowest balance ahead"
          when={formatShort(check.lowest.after.date)}
          value={dollars(after)}
          pos={gauge(after, floor, cushionBefore > 0 ? cushionBefore : floor)}
          tone={after < floor ? "bad" : "good"}
          status={after < floor ? `${dollars(floor - after)} below cushion` : `${dollars(after - floor)} above cushion`}
        />
      </div>
      <details className="mt-2 text-xs text-muted">
        <summary className="cursor-pointer list-none text-faint [&::-webkit-details-marker]:hidden">ⓘ What these mean</summary>
        <p className="mt-1">
          <strong className="text-ink">Spending money</strong> is what's left this pay period after bills, savings and your other plans.{" "}
          <strong className="text-ink">Lowest balance</strong> is the tightest your account gets in the next 90 days; your{" "}
          <strong className="text-ink">cushion</strong> ({dollars(floor)}) is the amount you never want to go below.
        </p>
      </details>
      {check.cash.viaCard && !check.cash.beyondHorizon && <p className="mt-1.5 text-[11px] text-muted">On {check.cash.viaCard.split(" ")[0]}: cash leaves {formatShort(check.cash.date)}</p>}
      {check.verdict !== "yes" && (() => {
        const opts = [check.action, ...check.alternatives].filter((x) => x.kind !== "none");
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
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-faint">{check.verdict === "not_yet" ? "Ways to make it work" : "Options"}</p>
            <ul className="grid gap-1.5">
              {opts.map((x, i) => (
                <li key={x.title} className={`rounded-lg border px-2.5 py-1.5 ${tint[x.kind] ?? "border-line bg-surface-2"}`}>
                  <p className="flex items-center gap-1.5 text-[13px] font-semibold text-ink">
                    <span aria-hidden>{icon[x.kind] ?? "•"}</span>
                    <span className="min-w-0 flex-1">{x.title}</span>
                    {i === 0 && <span className="shrink-0 rounded-full bg-surface px-1.5 py-0.5 text-[10px] font-medium text-muted">best</span>}
                  </p>
                  <p className="text-[11px] leading-snug text-muted">{x.detail}</p>
                </li>
              ))}
            </ul>
          </div>
        );
      })()}
    </div>
  );
}
