import { QuickAction } from "@/components/form";
import { Money } from "@/components/privacy";
import { Badge } from "@/components/ui";
import { setCardPayInFull } from "@/app/app/actions";
import { diffDays, formatShort, type ISODate } from "@/lib/dates";
import { Info } from "./info";
import { SyncButton } from "./sync-button";
import type { Account, CardProjection, CardStatement, OneTimeTransaction } from "@/lib/engine";

function ago(iso: string | null, now: number): string {
  if (!iso) return "never";
  const mins = Math.round((now - Date.parse(iso)) / 60_000);
  if (mins < 60) return `${Math.max(1, mins)} min ago`;
  const h = Math.round(mins / 60);
  return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} days ago`;
}

const Row = ({ label, children, sub }: { label: React.ReactNode; children: React.ReactNode; sub?: React.ReactNode }) => (
  <div className="flex items-baseline justify-between gap-3 py-1.5">
    <dt className="text-sm text-muted">
      {label}
      {sub && <span className="block text-[11px] text-faint">{sub}</span>}
    </dt>
    <dd className="text-right text-sm font-semibold tabular text-ink">{children}</dd>
  </div>
);

/**
 * An account your bank keeps up to date: everything shown comes from the bank, nothing to type.
 * For a card: what you owe, the latest statement (amount, dates, minimum, paid so far), what's been
 * charged since it closed, and the next statement the forecast expects.
 */
export function BankAccountPanel({
  account: a,
  statements,
  transactions,
  projection,
  usualCardSpendCents,
  today,
  nowMs,
}: {
  account: Account;
  statements: CardStatement[];
  transactions: OneTimeTransaction[];
  projection: CardProjection | undefined;
  /** Typical everyday spending on this card still to come before the next statement closes. */
  usualCardSpendCents: number;
  today: ISODate;
  nowMs: number;
}) {
  const pending = transactions.filter((t) => t.accountId === a.id && t.pending);
  const pendingNet = pending.reduce((s, t) => s + (t.direction === "out" ? t.amountCents : -t.amountCents), 0);
  const updated = <>from your bank · updated {ago(a.balanceUpdatedAt, nowMs)}</>;
  const sync = a.bankConnectionId ? <div className="mt-2"><SyncButton connectionId={a.bankConnectionId} /></div> : null;

  if (a.kind !== "credit_card") {
    return (
      <div className="mt-1">
        <p className="text-3xl font-bold tabular text-ink">{a.balanceCents == null ? "—" : <Money cents={a.balanceCents} />}</p>
        <p className="text-xs text-muted">
          {a.kind === "loan" ? "Owed" : "Available now"} · {updated}
          {pending.length > 0 && a.kind !== "loan" && <> · includes {pending.length} pending</>}
        </p>
        {sync}
      </div>
    );
  }

  const owed = a.balanceCents ?? 0;
  const latest = [...statements].sort((x, y) => (x.closingDate < y.closingDate ? 1 : -1))[0];
  const leftOnStatement = latest && latest.status !== "paid" ? Math.max(0, latest.statementBalanceCents - latest.paidCents) : 0;
  const since = Math.max(0, owed - leftOnStatement);
  const next = projection?.statements.find((s) => s.isProjected);
  const limit = a.creditLimitCents ?? null;
  const available = limit != null ? limit - owed : null;
  const scale = Math.max(1, limit ?? owed);
  const pct = (c: number) => `${Math.max(0, Math.min(100, (c / scale) * 100))}%`;
  const daysToDue = latest ? diffDays(today, latest.dueDate) : null;

  return (
    <div className="mt-1">
      <p className="text-3xl font-bold tabular text-ink">
        <Money cents={owed} /> <span className="text-sm font-normal text-muted">owed</span>
      </p>
      <p className="text-xs text-muted">
        {updated}
        {pendingNet > 0 && <> · includes <Money cents={pendingNet} /> pending</>}
      </p>
      {sync}

      {/* What you owe, split: the statement to pay, what's been charged since, and what's left of your limit. */}
      <div className="mt-3 flex h-2.5 overflow-hidden rounded-full bg-surface-3" aria-hidden>
        <span className="h-full bg-warn" style={{ width: pct(leftOnStatement) }} />
        <span className="h-full bg-info/80" style={{ width: pct(since) }} />
      </div>
      <p className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-muted">
        <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-warn align-middle" />Statement to pay</span>
        <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-info/80 align-middle" />Since statement</span>
        {available != null && <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-surface-3 align-middle ring-1 ring-line" />Available credit</span>}
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <section className="rounded-xl border border-warn/40 bg-warn/5 p-3">
          <h3 className="text-sm font-bold text-ink">Latest statement</h3>
          {latest ? (
            <dl className="divide-y divide-line/60">
              <Row label="Statement balance" sub={`Closed ${formatShort(latest.closingDate)}`}><Money cents={latest.statementBalanceCents} /></Row>
              <Row label="Due" sub={daysToDue != null && daysToDue >= 0 ? `in ${daysToDue} day${daysToDue === 1 ? "" : "s"}` : undefined}>{formatShort(latest.dueDate)}</Row>
              {latest.minimumDueCents != null && <Row label="Minimum due"><Money cents={latest.minimumDueCents} /></Row>}
              <Row label="Paid so far">
                {latest.status === "paid" ? <Badge tone="good">Paid</Badge> : latest.paidCents > 0 ? <Money cents={latest.paidCents} /> : <span className="font-normal text-muted">Nothing yet</span>}
              </Row>
              {latest.status !== "paid" && <Row label="Left to pay"><span className="text-warn"><Money cents={leftOnStatement} /></span></Row>}
            </dl>
          ) : (
            <p className="mt-1 text-sm text-muted">Estimated <Info label="Estimated">Your bank hasn&apos;t shared this card&apos;s statement details (the bill amount and due date). Until it does, we estimate the bill from the card&apos;s current balance and its usual closing day.</Info></p>
          )}
        </section>

        <section className="rounded-xl border border-info/40 bg-info/5 p-3">
          <h3 className="text-sm font-bold text-ink">Next statement</h3>
          <dl className="divide-y divide-line/60">
            <Row label="Charged since the statement" sub="Already on the card">
              <Money cents={since} />
            </Row>
            {next && (
              <>
                <Row label="Expected by closing" sub={`Usual card spending until ${formatShort(next.closingDate)}`}>
                  ~<Money cents={usualCardSpendCents} whole />
                </Row>
                <Row label="Estimated statement" sub={`Closes ${formatShort(next.closingDate)} · due ${formatShort(next.dueDate)}`}>
                  ~<Money cents={next.balanceCents + usualCardSpendCents} whole />
                </Row>
              </>
            )}
          </dl>
        </section>
      </div>

      <dl className="mt-3 divide-y divide-line/60">
        {limit != null && <Row label="Credit limit"><Money cents={limit} whole /></Row>}
        {available != null && <Row label="Available credit"><Money cents={available} whole /></Row>}
        {a.aprBps != null && <Row label="Interest rate (APR)">{(a.aprBps / 100).toFixed(2)}%</Row>}
        <Row label="Statement closes / due" sub="From your bank">
          day {a.statementCloseDay ?? "?"} / day {a.paymentDueDay ?? "?"}
        </Row>
      </dl>

      <div className="mt-3 rounded-xl border border-line p-3">
        <p className="text-sm font-medium text-ink">How you pay this card</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <QuickAction action={setCardPayInFull} fields={{ id: a.id, payInFull: "true" }} variant={a.payInFull !== false ? "primary" : "secondary"}>
            {a.payInFull !== false ? "✓ " : ""}Statement in full
          </QuickAction>
          <QuickAction action={setCardPayInFull} fields={{ id: a.id, payInFull: "false" }} variant={a.payInFull === false ? "primary" : "secondary"}>
            {a.payInFull === false ? "✓ " : ""}Minimum payment
          </QuickAction>
        </div>
      </div>
    </div>
  );
}
