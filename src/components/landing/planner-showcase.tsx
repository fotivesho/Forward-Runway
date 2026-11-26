import Link from "next/link";
import { formatShort } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { DOW_SHORT } from "@/lib/view/explore";
import type { LandingData } from "@/lib/view/landing";
import { Glyph } from "@/components/icon";

const usd = (c: number) => `$${Math.round(c / 100).toLocaleString("en-US")}`;

/**
 * "Got something coming up? Plan it." The guided planner, filled in for a sample dinner: the
 * paycheck it comes from, what you usually spend, a suggested amount, and the answer.
 */
export function PlannerShowcase({ planner }: { planner: NonNullable<LandingData["planner"]> }) {
  const { period, committed, profile, suggestions } = planner;
  const total = Math.max(1, committed.bills + committed.savings + committed.plans + period.freeCents);
  const pick = suggestions[1] ?? suggestions[0]!;
  const steps = [
    {
      n: 1,
      title: "Which paycheck",
      body: (
        <>
          <p className="text-xs text-muted">{formatShort(period.start)} – {formatShort(period.end)}</p>
          <p className="font-num text-2xl text-display">{usd(period.freeCents)} <span className="font-sans text-xs font-normal text-muted">free</span></p>
          <div className="mt-1.5 flex h-1.5 overflow-hidden rounded-full bg-surface-3" aria-hidden>
            <span className="bg-out" style={{ width: `${(committed.bills / total) * 100}%` }} />
            <span className="bg-warn" style={{ width: `${(committed.savings / total) * 100}%` }} />
            <span className="bg-info" style={{ width: `${(committed.plans / total) * 100}%` }} />
            <span className="bg-brand" style={{ width: `${(period.freeCents / total) * 100}%` }} />
          </div>
          <p className="mt-1 text-[11px] text-faint">after bills, savings and plans</p>
        </>
      ),
    },
    {
      n: 2,
      title: "What kind of plan",
      body: (
        <>
          <p className="flex items-center gap-2 text-sm font-bold text-ink"><Glyph name="Dining" size="sm" /> Dinner out</p>
          {profile ? (
            <p className="mt-1.5 text-xs text-muted">
              You usually spend <b className="text-ink">{usd(profile.avgCents)}</b>, between {usd(profile.lowCents)} and {usd(profile.highCents)}
              {profile.busiestDow != null ? <>, mostly on {DOW_SHORT[profile.busiestDow]}s</> : null}.
            </p>
          ) : (
            <p className="mt-1.5 text-xs text-muted">Starts from typical amounts until it learns yours.</p>
          )}
        </>
      ),
    },
    {
      n: 3,
      title: "Day and amount",
      body: (
        <>
          <div className="flex flex-wrap gap-1">
            {suggestions.map((sg) => (
              <span key={sg.label} className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${sg === pick ? "bg-brand text-brand-ink" : "bg-surface-2 text-muted"}`}>
                {sg.label} {formatCents(sg.cents, { compact: true }).replace(".00", "")}
              </span>
            ))}
          </div>
          <p className="mt-2 flex items-center gap-1.5 text-sm font-bold text-brand">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand text-[11px] text-brand-ink">✓</span>
            You&apos;re good
          </p>
          <p className="text-[11px] text-faint">{usd(pick.cents)} fits, with every bill still covered.</p>
        </>
      ),
    },
  ];
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-3">
      {steps.map((st) => (
        <article key={st.n} className="card relative p-4">
          <span className="absolute right-4 top-3 font-display text-2xl text-brand/30">{st.n}</span>
          <h3 className="text-xs font-bold uppercase tracking-wide text-faint">{st.title}</h3>
          <div className="mt-2">{st.body}</div>
        </article>
      ))}
      <div className="sm:col-span-3">
        <Link href="/demo/calendar?add=1" className="btn btn-primary">Plan one yourself →</Link>
      </div>
    </div>
  );
}
