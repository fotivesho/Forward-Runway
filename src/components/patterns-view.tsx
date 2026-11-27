import { formatShort, type ISODate } from "@/lib/dates";
import type { Insight, lifeAhead, rhythm } from "@/lib/view/patterns";
import { Info } from "./info";
import { PatternExplorer } from "./pattern-explorer";
import type { ExploreData } from "@/lib/view/explore";
import { Money } from "./privacy";
import { Glyph } from "@/components/icon";
import { Badge, EmptyState } from "./ui";

const TONE = { good: "border-brand/40", warn: "border-warn/50", info: "border-line" } as const;
const STAT = { good: "text-brand", warn: "text-warn", info: "text-ink" } as const;

/** Insight tiles: icon, a big number, one line; the rest behind ⓘ. */
export function InsightTiles({ items }: { items: Insight[] }) {
  return (
    <ul className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
      {items.map((i) => (
        <li key={i.id} className={`flex w-48 shrink-0 snap-start items-start gap-2.5 rounded-2xl border bg-surface p-3 shadow-sm ${TONE[i.tone]}`}>
          <Glyph name={i.icon} size="sm" />
          <span className="min-w-0 flex-1">
            <span className={`block text-lg font-extrabold leading-tight tabular ${STAT[i.tone]}`}>{i.stat}</span>
            <span className="block text-xs font-bold leading-snug text-ink">{i.title}<Info label={i.title}>{i.detail}</Info></span>
          </span>
        </li>
      ))}
    </ul>
  );
}

const WD = ["S", "M", "T", "W", "T", "F", "S"];

export function PatternsView({
  insights,
  ahead,
  week,
  pace,
  periodEnd,
  spendingMoneyCents,
  learnedDays,
  explore,
  hideAhead = false,
}: {
  insights: Insight[];
  ahead: ReturnType<typeof lifeAhead>;
  week: ReturnType<typeof rhythm> | null;
  /** Usual everyday spending until payday (null without enough history). */
  pace: { usualCents: number; gapCents: number } | null;
  periodEnd: ISODate;
  spendingMoneyCents: number;
  learnedDays: number;
  explore?: ExploreData;
  /** On Trends, the next 30 days live in Forecast instead. */
  hideAhead?: boolean;
}) {
  if (!week) {
    return (
      <EmptyState title="Learning your patterns">
        After about three weeks of spending, this shows your rhythm, what's creeping up, and what everyday life will likely cost ahead.
      </EmptyState>
    );
  }
  const segs = [
    { label: "Bills", cents: ahead.billsCents, color: "bg-out", kind: "Organized" },
    { label: "Plans", cents: ahead.plansCents, color: "bg-info", kind: "Organized" },
    { label: "Everyday", cents: ahead.everydayCents, color: "bg-brand", kind: "Predicted" },
    { label: "Big one-offs", cents: ahead.rareCents, color: "bg-warn", kind: "Predicted" },
  ].filter((s) => s.cents > 0);
  const maxDay = Math.max(1, ...week.weekday, week.payday);
  const short = pace && pace.gapCents < 0;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      {/* Until payday, at your usual pace */}
      {pace && (
        <section className="card overflow-hidden" aria-labelledby="pace-title">
          <div className="bg-gradient-to-br from-surface-3 to-surface p-4 sm:p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 id="pace-title" className="text-base font-bold text-ink">
                Usual spend to {formatShort(periodEnd)}
                <Info label="How this is predicted">
                  This is our best guess at the everyday spending you'll do before your next payday: groceries, coffee, takeout, rides. We learn it from your last {learnedDays} days: how much you usually spend a day, which weekdays cost more, and whether you spend more right after payday. Bills and calendar plans aren&apos;t included here, because the app already counts them separately.
                </Info>
              </h2>
              {short ? <Badge tone="warn">Tight</Badge> : <Badge tone="good">Covered</Badge>}
            </div>
            <p className="mt-2 font-num text-6xl leading-none tracking-tight text-display">~<Money cents={pace.usualCents} whole /></p>
            <p className="mt-1 text-sm text-muted">
              You have <Money cents={spendingMoneyCents} whole className="font-semibold text-ink" /> ·{" "}
              {short ? (
                <span className="font-semibold text-warn"><Money cents={-pace.gapCents} whole /> short</span>
              ) : (
                <span className="font-semibold text-brand"><Money cents={pace.gapCents} whole /> left</span>
              )}
            </p>
            <div className="mt-3 h-2 rounded-full bg-surface-3" aria-hidden>
              <div className={`h-2 rounded-full ${short ? "bg-warn" : "bg-brand"}`} style={{ width: `${Math.min(100, (pace.usualCents / Math.max(1, spendingMoneyCents, pace.usualCents)) * 100)}%` }} />
            </div>
          </div>
        </section>
      )}

      {/* What you've been doing */}
      {insights.length > 0 && (
        <section aria-labelledby="ins-title">
          <h2 id="ins-title" className="mb-2 text-base font-bold text-ink">Noticed</h2>
          <InsightTiles items={insights.slice(0, 6)} />
        </section>
      )}

      {explore && <PatternExplorer data={explore} />}

      {/* The next 30 days */}
      {!hideAhead && <section className="card p-4" aria-labelledby="ahead-title">
        <div className="flex items-baseline justify-between gap-2">
          <h2 id="ahead-title" className="text-base font-bold text-ink">
            Next 30 days <Info label="Next 30 days">Everything you&apos;re likely to spend in the next month, in two kinds. <strong className="font-semibold">Scheduled:</strong> bills and plans on your calendar, things we know about. <strong className="font-semibold">Predicted:</strong> everyday spending nobody puts on a calendar (groceries, gas, coffee), estimated from your habits, plus big costs that tend to come around now. Your budget is built from both.</Info>
          </h2>
          <Money cents={ahead.totalCents} whole className="text-lg font-extrabold text-ink" />
        </div>
        <div className="mt-2 flex h-3 overflow-hidden rounded-full bg-surface-3" aria-hidden>
          {segs.map((s) => <span key={s.label} className={s.color} style={{ width: `${(s.cents / Math.max(1, ahead.totalCents)) * 100}%` }} />)}
        </div>
        <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
          {segs.map((s) => (
            <li key={s.label} className="flex items-center justify-between gap-1">
              <span className="flex items-center gap-1.5 text-muted"><span className={`h-2 w-2 rounded-full ${s.color}`} />{s.label}</span>
              <Money cents={s.cents} whole className="font-semibold text-ink" />
            </li>
          ))}
        </ul>
        {(ahead.categories.length > 0 || ahead.lumpy.length > 0) && (
          <>
            <p className="mt-3 text-sm font-bold text-ink">Expected</p>
            <ul className="mt-1.5 flex flex-wrap gap-1.5">
              {ahead.categories.slice(0, 6).map((c) => (
                <li key={c.category} className="rounded-full border border-dashed border-brand/50 px-2.5 py-1 text-xs text-ink">
                  <Glyph name={c.category} size="xs" bare /> {c.category} <span className="font-semibold">~<Money cents={c.cents} whole /></span>
                </li>
              ))}
              {ahead.lumpy.map((l) => (
                <li key={l.category} className="rounded-full border border-dashed border-warn/60 px-2.5 py-1 text-xs text-ink">
                  <Glyph name={l.category} size="xs" bare /> {l.category} <span className="font-semibold">~<Money cents={l.avgCents} whole /></span> · {formatShort(l.nextAround)}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>}
    </div>
  );
}
