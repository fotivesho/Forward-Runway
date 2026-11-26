import { AccountForm, GoalForm, RuleForm } from "@/components/entity-forms";
import { Money } from "@/components/privacy";
import { ProfileForm, SettingsForm } from "@/components/settings-forms";
import { Badge } from "@/components/ui";
import type { ViewProps } from "./types";
import { completeOnboarding } from "@/app/app/actions";
import { Info } from "@/components/info";
import { APP_NAME } from "@/lib/brand";

function Step({ n, title, done, optional, children, why }: { n: number; title: string; done: boolean; optional?: boolean; children: React.ReactNode; why: string }) {
  return (
    <section aria-labelledby={`step-${n}`} className={`card p-4 sm:p-5 ${done ? "border-brand/40" : ""}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={`step-${n}`} className="text-lg font-bold text-ink">
          <span className="mr-2 text-faint">{n}.</span>{title}
          <Info label={title}>{why}</Info>
        </h2>
        {done ? <Badge tone="good">Done</Badge> : optional ? <Badge>Optional</Badge> : <Badge tone="warn">To do</Badge>}
      </div>
      <div className="mt-3" />
      {done ? <details><summary className="cursor-pointer text-sm text-brand">Add another</summary><div className="mt-3">{children}</div></details> : children}
    </section>
  );
}

export function OnboardingView({ snapshot, today, demo = false }: ViewProps) {
    const a = snapshot.accounts.filter((x) => !x.archived);
  const cash = a.filter((x) => x.isSpendable);
  const hasIncome = snapshot.rules.some((r) => r.kind === "income");
  const bills = snapshot.rules.filter((r) => r.kind !== "income");
  const cards = a.filter((x) => x.kind === "credit_card");
  const required = [!!snapshot.profile.timezone, cash.length > 0 && cash.every((c) => c.balanceCents != null), hasIncome];
  const ready = required.every(Boolean);
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="font-display mb-1 text-3xl leading-tight text-display">
        Set up your runway
        <Info label="Setting up">Use real numbers where you know them, and tick &ldquo;estimate&rdquo; where you don&apos;t. {APP_NAME} keeps facts and estimates separate, and everything can be changed later.</Info>
      </h1>
      <p className="mb-4 text-sm text-muted">About five minutes.</p>
      <div className="flex flex-col gap-4">
        <Step n={1} title="About you" done={!!snapshot.profile.onboardedAt || !!snapshot.profile.displayName} optional why="Your time zone decides what “today” is.">
          <ProfileForm snapshot={snapshot} detectTimezone />
        </Step>
        <Step n={2} title="Checking account" done={cash.length > 0 && cash.every((c) => c.balanceCents != null)} why="Where your pay lands and bills come out. Enter today's balance.">
          {cash.length > 0 && <ul className="mb-3 text-sm">{cash.map((c) => <li key={c.id}>{c.name}: {c.balanceCents != null ? <Money cents={c.balanceCents} /> : "no balance"}</li>)}</ul>}
          <AccountForm accounts={snapshot.accounts} today={today} initialKind="checking" />
        </Step>
        <Step n={3} title="Payday" done={hasIncome} why="When money comes in and how much (take-home). Paydays split your spending into pay periods.">
          <RuleForm accounts={snapshot.accounts} today={today} defaultKind="income" />
        </Step>
        <Step n={4} title="Bills, loans and savings transfers" done={bills.length > 0} why="Rent, utilities, subscriptions, loan payments and money you move to savings. Add the big ones now.">
          {bills.length > 0 && <ul className="mb-3 text-sm text-muted">{bills.map((b) => <li key={b.id}>{b.name} · <Money cents={b.amountCents} /></li>)}</ul>}
          <RuleForm accounts={snapshot.accounts} today={today} defaultKind="bill" />
        </Step>
        <Step n={5} title="Credit cards" done={cards.length > 0} optional why="What you owe, and the day each statement closes and is due. Purchases on a card are only counted when you pay the statement.">
          {cards.length > 0 && <ul className="mb-3 text-sm text-muted">{cards.map((c) => <li key={c.id}>{c.name}</li>)}</ul>}
          <AccountForm accounts={snapshot.accounts} today={today} initialKind="credit_card" />
        </Step>
        <Step n={6} title="Savings & wedding fund" done={snapshot.goals.length > 0} optional why="Add the savings account first (as type Savings), then the goal. Goal money is kept apart from spendable cash and protected.">
          <AccountForm accounts={snapshot.accounts} today={today} initialKind="savings" />
          <div className="mt-4 border-t border-line pt-4"><GoalForm accounts={snapshot.accounts} /></div>
        </Step>
        <Step n={7} title="Your cash floor" done={!!snapshot.profile.onboardedAt} optional why="The least you want in checking at any time. Daily caps keep you above it.">
          <SettingsForm snapshot={snapshot} />
        </Step>
        <form action={completeOnboarding} className="card flex flex-wrap items-center justify-between gap-3 p-4">
          <p className="text-sm text-muted">{ready ? "You're ready. You can keep adding details anytime." : "Add a checking balance and a payday to get a reliable forecast. You can also continue now and answer later."}</p>
          <button className="btn btn-primary" disabled={demo}>{ready ? "See my runway" : "Continue anyway"}</button>
        </form>
      </div>
    </div>
  );
}
