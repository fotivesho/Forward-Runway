import Link from "next/link";
import { formatShort, formatWeekday } from "@/lib/dates";
import type { LandingData } from "@/lib/view/landing";
import { Glyph } from "@/components/icon";
import { readTitle } from "@/lib/view/estimate";

const usd = (c: number) => `$${Math.round(Math.abs(c) / 100).toLocaleString("en-US")}`;
const VERDICT = {
  yes: { label: "Fits", cls: "bg-brand/12 text-brand", dot: "bg-brand" },
  yes_with_plan: { label: "With a change", cls: "bg-warn/12 text-warn", dot: "bg-warn" },
  not_yet: { label: "Not yet", cls: "bg-danger/12 text-danger", dot: "bg-danger" },
} as const;

/** One step: a number, a short title and line, and a picture of the real app. Alternates sides on wide screens. */
function Step({ n, kicker, title, body, flip, children }: { n: number; kicker: string; title: string; body: React.ReactNode; flip?: boolean; children: React.ReactNode }) {
  return (
    <li className="reveal grid grid-cols-[minmax(0,1fr)] items-center gap-5 py-10 sm:py-14 md:grid-cols-2 md:gap-12">
      <div className={flip ? "md:order-2" : ""}>
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-brand">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand text-[11px] font-bold text-brand-ink">{n}</span>
          {kicker}
        </p>
        <h3 className="font-display mt-2 text-3xl leading-tight text-display sm:text-4xl">{title}</h3>
        <p className="mt-2 max-w-md text-base text-muted">{body}</p>
      </div>
      <div className={`mx-auto w-full max-w-md ${flip ? "md:order-1" : ""}`}>{children}</div>
    </li>
  );
}

const Frame = ({ children }: { children: React.ReactNode }) => (
  <div className="card p-4 shadow-[0_24px_50px_-28px_rgba(31,69,49,0.45)]" aria-hidden>{children}</div>
);

/**
 * The idea, in five pictures: your life is messy → it gets priced → you pick the trade-off → the
 * unplanned is covered by your habits → a budget for the month ahead and a calm number each morning.
 */
export function Story({ d }: { d: LandingData }) {
  const { calendar, priced, tradeoff } = d.story;
  const b = d.budget;
  const groups = [
    { k: "Needs", c: b.groups.needs.budgetCents, cls: "bg-info" },
    { k: "Wants", c: b.groups.wants.budgetCents, cls: "bg-brand" },
    { k: "Savings", c: b.groups.savings.budgetCents, cls: "bg-warn" },
  ];
  const life = b.life;
  const lifeTotal = Math.max(1, life.billsCents + life.plansCents + life.everydayCents + life.setAsideCents);
  const result = d.results.find((r) => r.actual && r.diffCents! < 0) ?? d.results.find((r) => r.actual);

  return (
    <ol className="divide-y divide-line">
      <Step n={1} kicker="Your life, as it is" title="Messy, busy, and mostly planned." body="Dinners, a shower, a concert, a trip. Your calendar already knows what's coming. Traditional budgets ignore it.">
        <Frame>
          <p className="mb-2 flex items-center gap-2 text-xs font-bold text-faint"><Glyph name="plan" size="xs" /> Your calendar</p>
          <ul className="space-y-1.5">
            {calendar.map((e) => (
              <li key={e.title + e.date} className="flex items-center gap-3 rounded-xl bg-surface-2/60 px-3 py-2">
                <span className="w-10 text-center leading-tight">
                  <span className="block text-[10px] uppercase text-faint">{formatWeekday(e.date)}</span>
                  <span className="block text-sm font-bold text-ink">{Number(e.date.slice(8))}</span>
                </span>
                <span className="min-w-0 truncate text-sm text-ink">{e.title}</span>
              </li>
            ))}
          </ul>
        </Frame>
      </Step>

      <Step n={2} kicker="We price it" flip title="Every plan gets a real cost." body={<>What it will likely cost <em>you</em>, from your own history, and whether it fits. After each plan it checks the real charge and gets sharper.</>}>
        <Frame>
          <ul className="space-y-1.5">
            {priced.map((e) => (
              <li key={e.title + e.date} className="flex items-center gap-3 rounded-xl bg-surface-2/60 px-3 py-2">
                <Glyph name={readTitle(e.title).category} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-ink">{e.title}</span>
                  <span className="block text-[11px] text-faint">{formatShort(e.date)}</span>
                </span>
                <span className="text-right">
                  <span className="block text-sm font-bold tabular text-ink">~{usd(e.cents)}</span>
                  <span className={`inline-flex items-center gap-1 rounded-full px-1.5 text-[10px] font-semibold ${VERDICT[e.verdict].cls}`}><span className={`h-1 w-1 rounded-full ${VERDICT[e.verdict].dot}`} />{VERDICT[e.verdict].label}</span>
                </span>
              </li>
            ))}
          </ul>
          {result?.actual && (
            <p className="mt-3 rounded-xl border border-brand/25 bg-brand/[0.07] px-3 py-2 text-xs text-ink">
              <b>{result.title}</b>: planned {usd(result.plannedCents)}, really {usd(result.actual.cents)}.{" "}
              <span className="font-semibold text-brand">{result.diffCents! < 0 ? `${usd(-result.diffCents!)} under ✓` : "On plan ✓"}</span>
            </p>
          )}
        </Frame>
      </Step>

      {tradeoff && (
        <Step n={3} kicker="You choose the trade-off" title="Keep the plan. Know the cost." body="When something doesn't simply fit, you don't get a lecture. You get options, and you see each one's effect before you commit.">
          <Frame>
            <div className="rounded-2xl bg-gradient-to-br from-[#a87708] to-[#865d00] px-4 py-3 text-white">
              <p className="font-display text-2xl leading-none">Yes, with a plan.</p>
              <p className="mt-1 text-xs opacity-90">{tradeoff.title} · ~{usd(tradeoff.cents)} · {formatShort(tradeoff.date)}</p>
            </div>
            <ul className="mt-2 space-y-1.5">
              {tradeoff.options.map((o, i) => (
                <li key={o} className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-ink ${i === 0 ? "bg-surface ring-1 ring-warn/60" : "bg-surface-2/60"}`}>
                  {i === 0 && <span className="text-warn">★</span>}
                  <span className="min-w-0 flex-1 truncate">{o}</span>
                  <span className="text-[11px] font-medium text-faint">tap to see</span>
                </li>
              ))}
            </ul>
          </Frame>
        </Step>
      )}

      <Step n={tradeoff ? 4 : 3} kicker="And the life you don't plan" flip title="Your habits fill in the rest." body="Lunch, rides, the payday splurge. It learns your patterns in plain words and predicts the everyday spending nobody schedules.">
        <Frame>
          <ul className="grid grid-cols-2 gap-2">
            {d.insights.slice(0, 4).map((i) => (
              <li key={i.id} className={`rounded-2xl border bg-surface p-2.5 ${i.tone === "warn" ? "border-warn/50" : "border-line"}`}>
                <Glyph name={i.icon} size="xs" />
                <p className={`mt-1 text-base font-extrabold tabular ${i.tone === "warn" ? "text-warn" : "text-ink"}`}>{i.stat}</p>
                <p className="text-[11px] font-bold leading-snug text-ink">{i.title}</p>
              </li>
            ))}
          </ul>
          {d.habits.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {d.habits.map((h) => (
                <li key={h.category} className="flex items-center gap-1.5 rounded-full border border-dashed border-line px-2.5 py-1 text-xs text-muted">
                  <Glyph name={h.category} size="xs" bare /> {h.category} <b className="text-ink">~{usd(h.expectedCents)}</b>
                </li>
              ))}
            </ul>
          )}
        </Frame>
      </Step>

      <Step n={tradeoff ? 5 : 4} kicker="The result" title="A budget for the month ahead." body="Built from your plans and your habits, not last month's copy. And every morning, one calm number: what's safe to spend today.">
        <Frame>
          <div className="flex items-end justify-between gap-3 rounded-2xl bg-gradient-to-br from-surface-3 to-surface p-3">
            <div>
              <p className="text-[11px] font-bold text-muted">Safe to spend today</p>
              <p className="font-num text-4xl leading-none text-display">{usd(d.hero.safeTodayCents)}</p>
            </div>
            <p className="text-right text-[11px] text-faint">every bill, plan and<br />savings move covered</p>
          </div>
          <p className="mt-3 text-[11px] font-bold text-faint">This month, built from</p>
          <div className="mt-1 flex h-2.5 overflow-hidden rounded-full bg-surface-3">
            <span className="bg-out" style={{ width: `${(life.billsCents / lifeTotal) * 100}%` }} />
            <span className="bg-info" style={{ width: `${(life.plansCents / lifeTotal) * 100}%` }} />
            <span className="bg-brand" style={{ width: `${(life.everydayCents / lifeTotal) * 100}%` }} />
            <span className="bg-warn" style={{ width: `${(life.setAsideCents / lifeTotal) * 100}%` }} />
          </div>
          <p className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-muted">
            <span><span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-out" />Bills</span>
            <span><span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-info" />Plans</span>
            <span><span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-brand" />Everyday, predicted</span>
            <span><span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-warn" />Set aside</span>
          </p>
          <ul className="mt-3 grid grid-cols-3 gap-1.5 text-center">
            {groups.map((g) => (
              <li key={g.k} className="rounded-xl bg-surface-2/60 px-1 py-2">
                <span className={`mx-auto mb-1 block h-1.5 w-6 rounded-full ${g.cls}`} />
                <span className="block text-[11px] text-muted">{g.k}</span>
                <span className="block text-sm font-bold tabular text-ink">{usd(g.c)}</span>
              </li>
            ))}
          </ul>
        </Frame>
      </Step>

      <li className="reveal flex flex-col items-center gap-3 py-10 text-center">
        <p className="font-display text-2xl text-display sm:text-3xl">See it with your own eyes.</p>
        <Link href="/demo/calendar?add=1" className="btn btn-primary px-6">Try the demo →</Link>
        <p className="text-xs text-faint">Sample money, nothing to connect. Takes a minute.</p>
      </li>
    </ol>
  );
}

/** Two kinds of people, one product. */
export function ForWho() {
  const cards = [
    {
      icon: "📈",
      title: "You've tried budgeting, and quit.",
      body: "Spreadsheets and apps that only look backward, then scold you. This one looks at what's coming, so the budget fits your real month and you never re-enter a thing.",
    },
    {
      icon: "lock",
      title: "You've never budgeted. It feels scary.",
      body: "No categories to set up, no rules, no guilt. Connect once and get one calm number each morning, plus a heads-up before something won't fit.",
    },
  ];
  return (
    <ul className="grid grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-2">
      {cards.map((c) => (
        <li key={c.title} className="card p-5">
          <Glyph name={c.icon} size="md" />
          <p className="mt-3 text-lg font-bold text-ink">{c.title}</p>
          <p className="mt-1 text-sm text-muted">{c.body}</p>
        </li>
      ))}
    </ul>
  );
}
