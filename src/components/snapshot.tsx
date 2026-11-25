"use client";

import { formatShort, type ISODate } from "@/lib/dates";
import type { DashboardModel } from "@/lib/view/dashboard";
import { Money } from "./privacy";

/** "3 h ago" style freshness. */
export function ago(iso: string | null, nowMs: number): string {
  if (!iso) return "never";
  const mins = Math.round((nowMs - Date.parse(iso)) / 60_000);
  if (mins < 60) return `${Math.max(1, mins)} min ago`;
  const h = Math.round(mins / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
}

type SnapshotModel = Pick<DashboardModel, "cash" | "savings" | "goals" | "cards" | "loans">;

/** The whole money picture in four tiles: cash, savings, goals, cards. */
export function SnapshotTiles({ m, today, nowMs }: { m: SnapshotModel; today: ISODate; nowMs: number }) {
  const latest = (isos: Array<string | null>) => isos.filter(Boolean).sort().at(-1) ?? null;
  const cashUpdated = latest(m.cash.accounts.map((a) => a.account.balanceUpdatedAt));
  const cashStale = m.cash.accounts.some((a) => a.stale);
  const savingsTotal = m.savings.reduce((t, v) => t + v.valueCents, 0) + m.goals.filter((g) => !g.goal.protected).reduce((t, g) => t + g.balanceCents, 0);
  const savingsNames = [...m.savings.map((v) => v.account.name), ...m.goals.filter((g) => !g.goal.protected).map((g) => g.goal.name)];
  const goal = m.goals.find((g) => g.goal.protected) ?? m.goals[0];
  const owed = m.cards.reduce((t, c) => t + c.view.owedCents, 0);
  const nextBill = m.cards
    .map((c) => c.projection?.statements.find((s) => s.dueDate >= today))
    .filter((s) => !!s)
    .sort((a, b) => (a!.dueDate < b!.dueDate ? -1 : 1))[0];

  return (
    <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
      <SnapTile icon="💵" label="Cash" value={<Money cents={m.cash.totalCents} whole />} sub={<>{cashStale ? <span className="text-warn">Needs an update</span> : <>Updated {ago(cashUpdated, nowMs)}</>}</>} />
      <SnapTile
        icon="🛟"
        label="Savings"
        value={<Money cents={savingsTotal} whole />}
        sub={savingsNames.length ? savingsNames.join(", ") : "None yet"}
      />
      {goal ? (
        <SnapTile
          icon={goal.goal.protected ? "🔒" : "🎯"}
          title={goal.goal.protected ? "Protected: never suggested as a funding source" : undefined}
          label={goal.goal.name}
          value={<Money cents={goal.balanceCents} whole />}
          sub={<>{goal.pct}% of <Money cents={goal.goal.targetCents} whole /></>}
          bar={goal.pct}
        />
      ) : (
        <SnapTile icon="🎯" label="Goals" value="—" sub="Add a goal in Accounts" />
      )}
      <SnapTile
        icon="💳"
        label="Cards owed"
        value={<Money cents={owed} whole />}
        sub={nextBill ? <>Next bill <Money cents={nextBill.balanceCents} whole /> · {formatShort(nextBill.dueDate)}</> : m.cards.length ? "No bill due soon" : "No cards"}
      />
    </ul>
  );
}

function SnapTile({ icon, label, value, sub, bar, title }: { icon: string; label: string; value: React.ReactNode; sub: React.ReactNode; bar?: number; title?: string }) {
  return (
    <li title={title} className="min-w-0 rounded-xl border border-line bg-surface-2/50 p-2.5 sm:p-3">
      <p className="flex items-center gap-1.5 truncate text-xs text-faint">
        <span aria-hidden>{icon}</span>
        {label}
      </p>
      <p className="mt-0.5 text-xl font-bold tabular text-ink sm:text-2xl">{value}</p>
      {bar != null && (
        <div className="mt-1 h-1.5 rounded-full bg-surface-3" aria-hidden>
          <div className="h-1.5 rounded-full bg-brand" style={{ width: `${Math.min(100, bar)}%` }} />
        </div>
      )}
      <p className="mt-0.5 truncate text-[11px] text-muted sm:text-xs">{sub}</p>
    </li>
  );
}
