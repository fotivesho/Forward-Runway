"use client";

import { useMemo, useState } from "react";
import { addDays, addMonths, dayOfWeek, eachDay, endOfMonth, formatLong, formatShort, parts, startOfMonth, type ISODate } from "@/lib/dates";
import type { Account } from "@/lib/engine";
import type { EventView } from "@/lib/view/dashboard";
import { deleteEvent } from "@/app/app/actions";
import { EventCard } from "./advisor";
import { QuickAction } from "./form";
import { Money } from "./privacy";
import { Info } from "./info";
import { Glyph } from "@/components/icon";
import { EmptyState } from "./ui";

export interface DayMark {
  date: ISODate;
  kind: "income" | "bill" | "move";
  label: string;
  cents: number;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
const DOT = { yes: "bg-brand", yes_with_plan: "bg-warn", not_yet: "bg-danger" } as const;

/**
 * A month calendar of your plans, paydays and bills. Tap a day to see just that day;
 * every plan card below carries the same answer as "Can I afford it?".
 */
export function PlanCalendar({
  views,
  marks,
  baseline,
  periods,
  today,
  end,
  accounts,
  typical = {},
}: {
  views: EventView[];
  marks: DayMark[];
  /** Everyday safe-to-spend per day (before plans). */
  baseline: Record<ISODate, number>;
  /** Pay periods, to explain why the daily amount changes on payday. */
  periods: Array<{ start: ISODate; end: ISODate; freeCents: number; perDayCents: number }>;
  today: ISODate;
  end: ISODate;
  accounts: Account[];
  /** Usual everyday spending per day, from your patterns. */
  typical?: Record<ISODate, { cents: number; why: string | null }>;
}) {
  const months = useMemo(() => {
    const out: ISODate[] = [];
    for (let m = startOfMonth(today); m <= end; m = addMonths(m, 1)) out.push(m);
    return out;
  }, [today, end]);
  // Open on the month of the next plan, so there's something to see.
  const firstPlan = views.find((v) => v.event.date >= today)?.event.date;
  const [monthIdx, setMonthIdx] = useState(() => Math.max(0, months.findIndex((m) => firstPlan && firstPlan.slice(0, 7) === m.slice(0, 7))));
  const [selected, setSelected] = useState<ISODate | null>(null);

  const month = months[monthIdx] ?? months[0]!;
  const { y, m } = parts(month);
  // In the current month, start at this week: past weeks only take up room.
  const first = monthIdx === 0 ? addDays(today, -dayOfWeek(today)) : month;
  const gridStart = first < month ? month : first;
  const lead = dayOfWeek(gridStart);
  const days = eachDay(gridStart, endOfMonth(month));
  const plansOn = (d: ISODate) => views.filter((v) => v.event.date === d);
  /** What's safe to spend that day: the everyday amount plus the cap of any plan that day. */
  const planCaps = (d: ISODate) => plansOn(d).reduce((t, v) => t + (v.advice?.capCents ?? 0), 0);
  const dayTotal = (d: ISODate) => (baseline[d] == null ? null : baseline[d]! + planCaps(d));
  const periodOf = (d: ISODate) => periods.find((p) => d >= p.start && d <= p.end) ?? null;
  const marksOn = (d: ISODate) => marks.filter((k) => k.date === d);

  // Plans that cost nothing (meetings, "not spending") stay out of the way.
  const free = views.filter((v) => v.plannedCents === 0 && !v.estimate.needsInput);
  const spending = views.filter((v) => !free.includes(v));
  const shown = selected ? views.filter((v) => v.event.date === selected) : spending;
  const groups = new Map<ISODate, EventView[]>();
  for (const v of shown) groups.set(v.event.date, [...(groups.get(v.event.date) ?? []), v]);

  return (
    <div>
      <div className="rounded-xl border border-line bg-surface p-2 sm:p-3">
        <div className="mb-2 flex items-center justify-between">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMonthIdx((i) => Math.max(0, i - 1))} disabled={monthIdx === 0} aria-label="Previous month">‹</button>
          <p className="font-semibold text-ink">{MONTHS[m - 1]} {y}</p>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMonthIdx((i) => Math.min(months.length - 1, i + 1))} disabled={monthIdx >= months.length - 1} aria-label="Next month">›</button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-faint" aria-hidden>
          {WEEKDAYS.map((d, i) => <span key={i}>{d}</span>)}
        </div>
        <ol className="mt-1 grid grid-cols-7 gap-1" aria-label={`${MONTHS[m - 1]} ${y}`}>
          {Array.from({ length: lead }, (_, i) => <li key={`lead-${i}`} aria-hidden />)}
          {days.map((d) => {
            const plans = plansOn(d).filter((v) => !free.includes(v));
            const dayMarks = marksOn(d);
            const payday = dayMarks.some((k) => k.kind === "income");
            const bills = dayMarks.filter((k) => k.kind === "bill").length;
            const moves = dayMarks.some((k) => k.kind === "move");
            const past = d < today;
            const outside = d > end;
            const isSel = selected === d;
            const label = `${formatLong(d)}: ${plans.length} plan${plans.length === 1 ? "" : "s"}${payday ? ", payday" : ""}${bills ? `, ${bills} bill${bills === 1 ? "" : "s"}` : ""}`;
            return (
              <li key={d}>
                <button
                  type="button"
                  disabled={past || outside}
                  onClick={() => setSelected(isSel ? null : d)}
                  aria-pressed={isSel}
                  aria-label={label}
                  className={`flex h-12 w-full flex-col items-center justify-start rounded-lg border pt-1 text-xs transition sm:h-16 ${
                    isSel ? "border-brand bg-brand/15" : d === today ? "border-brand/60" : "border-transparent hover:border-line"
                  } ${past || outside ? "opacity-35" : ""} ${plans.length ? "bg-surface-2/70" : ""}`}
                >
                  <span className={`tabular ${d === today ? "font-bold text-brand" : "text-ink"}`}>{Number(d.slice(8))}</span>
                  {!past && !outside && dayTotal(d) != null && (
                    <Money cents={dayTotal(d)!} whole className={`text-[9px] leading-tight sm:text-[10px] ${plans.length ? "font-semibold text-ink" : "text-faint"}`} />
                  )}
                  {plans.length > 0 && (
                    <span className="mt-0.5 flex items-center gap-0.5">
                      {plans.slice(0, 3).map((v) => (
                        <span key={v.event.id} className={`h-1.5 w-1.5 rounded-full ${v.check ? DOT[v.check.verdict] : "bg-info"}`} />
                      ))}
                    </span>
                  )}
                  <span className="flex items-center gap-0.5 text-[9px] leading-none sm:text-[10px]">
                    {payday && <span className="rounded bg-brand px-1 text-[8px] font-bold uppercase leading-[1.4] text-brand-ink sm:text-[9px]">Pay</span>}
                    {bills > 0 && <span className="rounded bg-out px-1 text-[8px] font-bold uppercase leading-[1.4] text-surface sm:text-[9px]">Bill</span>}
                    {moves && <span className="rounded bg-warn px-1 text-[8px] font-bold uppercase leading-[1.4] text-surface sm:text-[9px]">Save</span>}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
        <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted">
          <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-brand align-middle" />You're good</span>
          <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-warn align-middle" />Doable</span>
          <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-danger align-middle" />Not yet</span>
          <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-info align-middle" />Needs a cost</span>
          <span><span className="mr-1 rounded bg-brand px-1 text-[9px] font-bold uppercase text-brand-ink">Pay</span>Payday</span>
          <span><span className="mr-1 rounded bg-out px-1 text-[9px] font-bold uppercase text-surface">Bill</span>Bill due</span>
          <span><span className="mr-1 rounded bg-warn px-1 text-[9px] font-bold uppercase text-surface">Save</span>From savings</span>
          <Info label="Calendar key">The small amount under each date is how much you can spend that day on everyday things and still cover every bill, savings transfer and plan. Dots are plans: green fits, amber needs a small change, red doesn&apos;t fit yet.</Info>
        </p>
      </div>

      <div className="mt-4">
        {selected && (
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold text-ink">{formatLong(selected)}</p>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSelected(null)}>Show all plans</button>
          </div>
        )}
        {selected && dayTotal(selected) != null && (
          <div className="mb-2 rounded-xl border border-brand/30 bg-brand/[0.06] px-3 py-2 text-sm">
            <p className="flex justify-between gap-2">
              <span className="font-medium text-ink">Safe to spend</span>
              <Money cents={dayTotal(selected)!} className="text-base font-semibold text-brand" />
            </p>
            {planCaps(selected) > 0 && (
              <p className="text-xs text-muted">
                Includes{" "}
                {plansOn(selected)
                  .filter((v) => (v.advice?.capCents ?? 0) > 0)
                  .map((v, i) => (
                    <span key={v.event.id}>
                      {i > 0 && " and "}
                      <Money cents={v.advice!.capCents} whole /> for {v.event.title}
                    </span>
                  ))}
                .
              </p>
            )}
            {typical[selected] && typical[selected]!.cents > 0 && (
              <p className="mt-0.5 text-xs text-muted">
                Everyday spending usually ~<Money cents={typical[selected]!.cents} whole className="font-semibold text-ink" />
                {typical[selected]!.why && <span className={/high|after|usually/.test(typical[selected]!.why!) ? "text-warn" : ""}> · {typical[selected]!.why}</span>}
              </p>
            )}
            {(() => {
              const p = periodOf(selected);
              if (!p) return null;
              return (
                <p className="mt-0.5 text-xs text-muted">
                  {formatShort(p.start)}–{formatShort(p.end)} · <Money cents={p.freeCents} whole /> free · ~<Money cents={p.perDayCents} whole />/day
                  <Info label="Pay period">A pay period runs from one payday to the day before the next. &ldquo;Free&rdquo; is what&apos;s left from that paycheck after bills, savings and plans; &ldquo;a day&rdquo; spreads it evenly over the days.{selected === p.start && selected !== today ? " This date is a payday, so a new period starts." : ""}</Info>
                </p>
              );
            })()}
          </div>
        )}
        {selected && marksOn(selected).length > 0 && (
          <ul className="mb-3 space-y-1 rounded-xl border border-line p-2.5 text-sm">
            {marksOn(selected).map((k) => (
              <li key={k.label + k.cents} className="flex justify-between gap-2">
                <span className="text-ink"><Glyph name={k.kind === "income" ? "income" : k.kind === "move" ? "save" : "bill"} size="xs" /> {k.label}</span>
                <Money cents={k.cents} sign tone="auto" />
              </li>
            ))}
          </ul>
        )}
        {shown.length === 0 ? (
          <EmptyState title={selected ? "No plans that day" : "No plans found"}>
            {selected ? "Add a plan and the amount above updates." : "Connect your calendars or add a plan."}
          </EmptyState>
        ) : (
          <div className="space-y-4">
            {[...groups.entries()].map(([date, list]) => (
              <section key={date} aria-label={formatLong(date)}>
                {!selected && <h3 className="mb-1.5 text-sm font-bold text-ink">{formatLong(date)}{date === addDays(today, 1) ? " · tomorrow" : date === today ? " · today" : ""}</h3>}
                <ul className="space-y-2">
                  {list.map((v) => (
                    <div key={v.event.id}>
                      <EventCard view={v} accounts={accounts} />
                      {!v.event.sourceId && (
                        <div className="mt-1 flex justify-end">
                          <QuickAction action={deleteEvent} fields={{ id: v.event.id }} confirm="Delete this plan?">Delete plan</QuickAction>
                        </div>
                      )}
                    </div>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
        {!selected && free.length > 0 && (
          <details className="mt-4 rounded-xl border border-line p-3 text-sm">
            <summary className="cursor-pointer font-medium text-muted">{free.length} event{free.length === 1 ? "" : "s"} that cost nothing</summary>
            <ul className="mt-2 space-y-2">
              {free.map((v) => <EventCard key={v.event.id} view={v} accounts={accounts} />)}
            </ul>
          </details>
        )}
      </div>
    </div>
  );
}

