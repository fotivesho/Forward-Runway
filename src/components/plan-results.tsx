import { formatShort } from "@/lib/dates";
import type { Accuracy, PlanResult } from "@/lib/view/actuals";
import { Glyph } from "./icon";
import { Info } from "./info";
import { Money } from "./privacy";

/** Finished plans: planned vs what they really cost, and how close the estimates get. */
export function PlanResults({ results, acc }: { results: PlanResult[]; acc: Accuracy[] }) {
  const matched = results.filter((r) => r.actual);
  if (!matched.length) return null;
  const net = matched.reduce((a, r) => a + r.diffCents!, 0);
  return (
    <section className="card p-4 sm:p-5" aria-labelledby="results-title">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="results-title" className="text-base font-bold text-ink">
          How your plans went
          <Info label="How your plans went">
            After a plan&apos;s date, we look for the card or bank charge that matches it, and compare it with what you planned. Over time this shows how close your plans run, and new estimates adjust to it: if dinners usually end up a bit over, the next dinner estimate starts a bit higher.
          </Info>
        </h2>
        <span className={`text-sm font-semibold ${net > 0 ? "text-warn" : "text-brand"}`}>
          {net > 0 ? <>+<Money cents={net} whole /> over</> : <><Money cents={-net} whole /> under</>}
        </span>
      </div>
      <ul className="mt-2 divide-y divide-line/60">
        {matched.slice(0, 5).map((r) => {
          const d = r.diffCents!;
          const close = Math.abs(d) < Math.max(200, r.plannedCents * 0.03);
          return (
            <li key={r.eventId} className="flex items-center gap-3 py-2">
              <Glyph name={r.category} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold leading-snug text-ink">{r.title}</span>
                <span className="block text-[11px] text-faint">{formatShort(r.date)} · matched {r.actual!.description}</span>
              </span>
              <span className="text-right">
                <Money cents={r.actual!.cents} whole className="block text-sm font-bold tabular text-ink" />
                <span className={`block text-[11px] font-semibold ${close ? "text-brand" : d > 0 ? "text-warn" : "text-brand"}`}>
                  {close ? "on plan ✓" : d > 0 ? <>+<Money cents={d} whole /> over</> : <><Money cents={-d} whole /> under ✓</>}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
      {acc.length > 0 && (
        <div className="mt-3 rounded-2xl bg-surface-2/60 p-3">
          <p className="text-xs font-bold text-ink">How close your estimates run</p>
          <ul className="mt-2 space-y-2">
            {acc.slice(0, 3).map((a) => {
              const within = Math.round(a.withinPct * 100);
              return (
                <li key={a.category} className="text-xs">
                  <span className="flex justify-between gap-2 text-muted">
                    <span className="flex items-center gap-1.5 text-ink"><Glyph name={a.category} size="xs" bare />{a.category} · {a.plans} plan{a.plans === 1 ? "" : "s"}</span>
                    <span>within <b className="text-ink">{within}%</b>{Math.abs(a.bias - 1) >= 0.03 && a.plans >= 2 ? ` · runs ${Math.abs(Math.round((a.bias - 1) * 100))}% ${a.bias > 1 ? "over" : "under"}, adjusted` : ""}</span>
                  </span>
                  <span className="mt-1 block h-1.5 rounded-full bg-surface-3"><span className={`block h-1.5 rounded-full ${within <= 10 ? "bg-brand" : "bg-warn"}`} style={{ width: `${Math.max(8, 100 - within)}%` }} /></span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
