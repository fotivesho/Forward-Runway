"use client";

import { useEffect, useRef, useState } from "react";
import { saveAccount, saveGoal, saveRule, saveStatement, saveTransaction, saveTransfer, updateBalance } from "@/app/app/actions";
import type { Account, CardStatement, RecurringRule, SavingsGoal } from "@/lib/engine";
import { centsToInput } from "@/lib/money";
import type { ISODate } from "@/lib/dates";
import { SPEND_CATEGORIES } from "./advisor";
import { CATEGORY_LIST } from "@/lib/categories";
import { ActionForm, CheckboxField, Field, MoneyField, SelectField, Submit } from "./form";

const dayOptions = (blank: string) => [
  { value: "", label: blank },
  ...Array.from({ length: 31 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) })),
  { value: "-1", label: "Last day of month" },
];
const opt = (accts: Account[]) => accts.map((a) => ({ value: a.id, label: a.name }));
const live = (accounts: Account[]) => accounts.filter((a) => !a.archived);
const isLiability = (a: Account) => a.kind === "credit_card" || a.kind === "loan";

/* ------------------------------------------------------------------ account */

export function AccountForm({ account, accounts, today, onDone, initialKind }: { account?: Account; accounts: Account[]; today: ISODate; onDone?: () => void; initialKind?: Account["kind"] }) {
  const [kind, setKind] = useState<Account["kind"]>(account?.kind ?? initialKind ?? "checking");
  const cashAccounts = live(accounts).filter((a) => !isLiability(a) && a.isSpendable);
  const card = kind === "credit_card";
  const liability = card || kind === "loan";
  return (
    <ActionForm action={saveAccount} className="grid gap-3 sm:grid-cols-2" resetOnSuccess={!account} onSuccess={onDone} aria-label={account ? `Edit ${account.name}` : "Add account"}>
      {account && <input type="hidden" name="id" value={account.id} />}
      <Field name="name" label="Name" defaultValue={account?.name} placeholder="Everyday Checking" maxLength={60} required />
      <SelectField
        name="kind"
        label="Type"
        value={kind}
        onChange={(e) => setKind(e.target.value as Account["kind"])}
        options={[
          { value: "checking", label: "Checking" },
          { value: "savings", label: "Savings" },
          { value: "cash", label: "Cash / wallet" },
          { value: "credit_card", label: "Credit card" },
          { value: "loan", label: "Loan" },
        ]}
      />
      <MoneyField name="balance" label={liability ? "Amount owed" : "Balance"} defaultValue={centsToInput(account?.balanceCents)} hint={liability ? "What you owe right now, as a positive number." : undefined} />
      <Field name="balanceAsOf" type="date" label="Balance as of (start of day)" defaultValue={account?.balanceAsOf ?? today} />
      {!liability && (
        <div className="sm:col-span-2">
          <CheckboxField
            name="isSpendable"
            label="Counts as spendable cash"
            defaultChecked={account ? account.isSpendable : kind !== "savings"}
            hint="Turn this on for accounts you spend from day to day, like checking. Bills and everyday spending come out of these. Savings usually stay off."
          />
        </div>
      )}
      {card && (
        <>
          <SelectField name="statementCloseDay" label="Statement closes on day" defaultValue={account?.statementCloseDay != null ? String(account.statementCloseDay) : ""} options={dayOptions("Not sure yet")} />
          <SelectField name="paymentDueDay" label="Payment due on day" defaultValue={account?.paymentDueDay != null ? String(account.paymentDueDay) : ""} options={dayOptions("Not sure yet")} />
          <MoneyField name="creditLimit" label="Credit limit (optional)" defaultValue={centsToInput(account?.creditLimitCents)} />
          <SelectField name="paymentAccountId" label="Paid from" defaultValue={account?.paymentAccountId ?? cashAccounts[0]?.id ?? ""} options={[{ value: "", label: "Main checking" }, ...opt(cashAccounts)]} />
          <div className="sm:col-span-2">
            <CheckboxField name="payInFull" label="I pay the statement in full" defaultChecked={account ? account.payInFull !== false : true} hint="Recommended. Paying the full statement balance each month means you pay no interest. If you turn this off, only the minimum payment is planned and we warn you about interest." />
          </div>
        </>
      )}
      {liability && (
        <>
          <Field name="apr" label="APR % (optional)" inputMode="decimal" defaultValue={account?.aprBps != null ? (account.aprBps / 100).toFixed(2) : ""} placeholder="24.99" />
          <MoneyField name="minimumPayment" label="Minimum payment (optional)" defaultValue={centsToInput(account?.minimumPaymentCents)} />
        </>
      )}
      {kind === "loan" && <SelectField name="paymentDueDay" label="Payment due on day" defaultValue={account?.paymentDueDay != null ? String(account.paymentDueDay) : ""} options={dayOptions("Not sure")} />}
      <div className="sm:col-span-2">
        <Submit>{account ? "Save changes" : "Add account"}</Submit>
      </div>
    </ActionForm>
  );
}

export function BalanceForm({ account, today }: { account: Account; today: ISODate }) {
  return (
    <ActionForm action={updateBalance} className="grid grid-cols-[1fr_1fr] gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end" aria-label={`Update ${account.name} balance`}>
      <input type="hidden" name="accountId" value={account.id} />
      <MoneyField name="balance" label={isLiability(account) ? "Owed now" : "Balance now"} required />
      <Field name="balanceAsOf" type="date" label="As of" defaultValue={today} required />
      <Submit className="col-span-2 sm:col-span-1">Update</Submit>
    </ActionForm>
  );
}

/* ---------------------------------------------------------------- statement */

export function StatementForm({ card, statement }: { card: Account; statement?: CardStatement }) {
  return (
    <ActionForm action={saveStatement} className="grid gap-3 sm:grid-cols-2" resetOnSuccess={!statement} aria-label={`${card.name} statement`}>
      {statement && <input type="hidden" name="id" value={statement.id} />}
      <input type="hidden" name="accountId" value={card.id} />
      <Field name="closingDate" type="date" label="Statement closing date" defaultValue={statement?.closingDate} required />
      <Field name="dueDate" type="date" label="Payment due date" defaultValue={statement?.dueDate} required />
      <MoneyField name="statementBalance" label="Statement balance" defaultValue={centsToInput(statement?.statementBalanceCents)} required />
      <MoneyField name="minimumDue" label="Minimum due (optional)" defaultValue={centsToInput(statement?.minimumDueCents)} />
      <MoneyField name="paid" label="Already paid toward it" defaultValue={centsToInput(statement?.paidCents ?? 0)} hint="Whatever you haven't paid yet is planned as a payment on the due date." />
      <div className="flex items-end">
        <Submit className="w-full">Save statement</Submit>
      </div>
    </ActionForm>
  );
}

/* --------------------------------------------------------------------- goal */

export function GoalForm({ goal, accounts }: { goal?: SavingsGoal; accounts: Account[] }) {
  const savings = live(accounts).filter((a) => !isLiability(a));
  return (
    <ActionForm action={saveGoal} className="grid gap-3 sm:grid-cols-2" resetOnSuccess={!goal} aria-label={goal ? `Edit ${goal.name}` : "Add goal"}>
      {goal && <input type="hidden" name="id" value={goal.id} />}
      <Field name="name" label="Goal" defaultValue={goal?.name} placeholder="Wedding" required maxLength={60} />
      <SelectField
        name="kind"
        label="Type"
        defaultValue={goal?.kind ?? "wedding"}
        options={[
          { value: "wedding", label: "Wedding" },
          { value: "emergency", label: "Emergency fund" },
          { value: "debt", label: "Debt payoff" },
          { value: "other", label: "Other" },
        ]}
      />
      <SelectField name="accountId" label="Held in" defaultValue={goal?.accountId ?? ""} options={[{ value: "", label: "Not linked yet" }, ...opt(savings)]} hint="Keep goal money in its own savings account, so it's never mistaken for money you can spend." />
      <MoneyField name="target" label="Target" defaultValue={centsToInput(goal?.targetCents)} required />
      <Field name="targetDate" type="date" label="Target date (optional)" defaultValue={goal?.targetDate ?? ""} />
      <MoneyField name="monthlyContribution" label="Planned monthly contribution" defaultValue={centsToInput(goal?.monthlyContributionCents)} hint="How much you'll add each month. We set it aside for you automatically, unless a repeating transfer already does it." />
      <div className="sm:col-span-2">
        <CheckboxField name="protected" label="Protect this money" defaultChecked={goal ? goal.protected !== false : true} hint="When on, the app will never suggest using this money to pay for something else, even if you're short." />
      </div>
      <div className="sm:col-span-2">
        <Submit>{goal ? "Save goal" : "Add goal"}</Submit>
      </div>
    </ActionForm>
  );
}

/* --------------------------------------------------------------------- rule */

const RULE_KINDS: Array<{ value: RecurringRule["kind"]; label: string }> = [
  { value: "income", label: "Income / payday" },
  { value: "bill", label: "Bill" },
  { value: "subscription", label: "Subscription" },
  { value: "expense", label: "Regular spending (e.g. groceries)" },
  { value: "loan_payment", label: "Loan payment" },
  { value: "card_payment", label: "Credit card payment" },
  { value: "savings_transfer", label: "Savings transfer" },
  { value: "transfer", label: "Other transfer" },
];

export function RuleForm({
  rule,
  prefill,
  accounts,
  today,
  defaultKind,
  startFrom,
  onDone,
}: {
  /** Changing it from this date on: the form starts here. */
  startFrom?: ISODate;
  rule?: RecurringRule;
  /** Starting values for a new item, e.g. from a transaction or a suggestion. */
  prefill?: RecurringRule;
  accounts: Account[];
  today: ISODate;
  defaultKind?: RecurringRule["kind"];
  onDone?: () => void;
}) {
  const base = rule ?? prefill;
  const [kind, setKind] = useState<RecurringRule["kind"]>(base?.kind ?? defaultKind ?? "bill");
  const [freq, setFreq] = useState(base?.schedule.frequency ?? "monthly");
  const all = live(accounts);
  const cash = all.filter((a) => !isLiability(a) && a.isSpendable);
  const transferKind = ["loan_payment", "card_payment", "savings_transfer", "transfer"].includes(kind);
  const fromOptions = kind === "income" ? cash : transferKind ? all.filter((a) => !isLiability(a)) : all.filter((a) => a.isSpendable || a.kind === "credit_card");
  const toOptions =
    kind === "card_payment" ? all.filter((a) => a.kind === "credit_card") : kind === "loan_payment" ? all.filter((a) => a.kind === "loan") : kind === "savings_transfer" ? all.filter((a) => a.kind === "savings") : all;
  const FREQS = [
    { value: "weekly", label: "Weekly" },
    { value: "biweekly", label: "Every 2 weeks" },
    { value: "semimonthly", label: "Twice a month" },
    { value: "monthly", label: "Monthly" },
    { value: "once", label: "Once" },
  ] as const;
  return (
    <ActionForm demoPreview action={saveRule} onSuccess={onDone} className="grid gap-4" resetOnSuccess={!rule} aria-label={rule ? `Edit ${rule.name}` : "Add recurring item"}>
      {rule && <input type="hidden" name="id" value={rule.id} />}
      <input type="hidden" name="frequency" value={freq} />
      {/* The two things that matter most: what it is and how much. */}
      <div className="grid grid-cols-[minmax(0,1fr)_8.5rem] gap-3">
        <Field name="name" label="Name" defaultValue={base?.name} placeholder={kind === "income" ? "Paycheck" : "Rent"} required maxLength={80} />
        <MoneyField name="amount" label="Amount" defaultValue={centsToInput(base?.amountCents)} required />
      </div>
      <div>
        <p className="mb-1.5 text-sm font-medium text-ink">How often</p>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="How often">
          {FREQS.map((f) => (
            <button key={f.value} type="button" role="radio" aria-checked={freq === f.value} onClick={() => setFreq(f.value)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${freq === f.value ? "border-brand bg-brand text-brand-ink" : "border-line text-muted hover:border-brand/60"}`}>
              {f.label}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field name="startDate" type="date" label={freq === "once" ? "Date" : rule ? "Starting from" : "First one"} defaultValue={startFrom ?? base?.schedule.startDate ?? today} required />
        <SelectField
          name="accountId"
          label={kind === "income" ? "Paid into" : transferKind ? "From" : "Paid with"}
          defaultValue={base?.accountId ?? fromOptions[0]?.id}
          options={opt(fromOptions)}
        />
      </div>
      {transferKind && <SelectField name="toAccountId" label="To" defaultValue={base?.toAccountId ?? toOptions[0]?.id ?? ""} options={[{ value: "", label: "Choose…" }, ...opt(toOptions)]} />}
      {/* Everything else, folded away. */}
      <details className="group rounded-2xl border border-line">
        <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between px-3 text-sm font-medium text-muted">
          More options <span aria-hidden className="text-faint transition group-open:rotate-180">▾</span>
        </summary>
        <div className="grid grid-cols-2 gap-3 border-t border-line p-3">
          <SelectField name="kind" label="What is it?" value={kind} onChange={(e) => setKind(e.target.value as RecurringRule["kind"])} options={RULE_KINDS} />
          <CategoryField label="Category" defaultValue={base?.category} />
          {(freq === "monthly" || freq === "semimonthly") && (
            <SelectField
              name="dayOfMonth"
              label={freq === "semimonthly" ? "First day" : "Day of month"}
              defaultValue={base?.schedule.dayOfMonth != null ? String(base.schedule.dayOfMonth) : freq === "semimonthly" ? "1" : ""}
              options={dayOptions(freq === "monthly" ? "Same as the date" : "1")}
            />
          )}
          {freq === "semimonthly" && (
            <SelectField name="secondDayOfMonth" label="Second day" defaultValue={base?.schedule.secondDayOfMonth != null ? String(base.schedule.secondDayOfMonth) : "15"} options={dayOptions("15")} />
          )}
          {freq !== "once" && <Field name="endDate" type="date" label="Ends (optional)" defaultValue={base?.schedule.endDate ?? ""} />}
          <SelectField
            name="weekendAdjust"
            label="On a weekend"
            defaultValue={base?.schedule.weekendAdjust ?? (kind === "income" ? "before" : "none")}
            options={[
              { value: "none", label: "Keep the date" },
              { value: "before", label: "Friday before" },
              { value: "after", label: "Monday after" },
            ]}
          />
          <div className="col-span-2">
            <CheckboxField name="isEstimate" label="The amount varies (an estimate)" defaultChecked={base?.isEstimate} />
          </div>
        </div>
      </details>
      <Submit className="w-full">{rule ? "Save changes" : "Add"}</Submit>
    </ActionForm>
  );
}

/* -------------------------------------------------------------- transaction */

/**
 * Category picker: your categories first, then the usual ones, then "+ New category…" to type your own.
 */
export function CategoryField({ name = "category", label = "Category", defaultValue, yours = [], wrapperClassName = "" }: { name?: string; label?: string; defaultValue?: string | null; yours?: string[]; wrapperClassName?: string }) {
  const rest = CATEGORY_LIST.filter((c) => !yours.includes(c));
  const all = [...yours, ...rest];
  const initial = defaultValue ?? "";
  const known = initial === "" || all.includes(initial);
  const [choice, setChoice] = useState(known ? initial : "__new");
  const [custom, setCustom] = useState(known ? "" : initial);
  // React resets a form's fields after it submits; keep showing the category that's actually chosen.
  const ref = useRef<HTMLSelectElement>(null);
  useEffect(() => {
    const form = ref.current?.form;
    if (!form) return;
    const keep = () => setTimeout(() => ref.current && (ref.current.value = choice), 0);
    form.addEventListener("reset", keep);
    return () => form.removeEventListener("reset", keep);
  }, [choice]);
  return (
    <div className={`flex flex-col gap-1 ${wrapperClassName}`}>
      <label className="text-sm font-medium text-ink">
        {label}
        <select ref={ref} className="input mt-1 font-normal" value={choice} name={choice === "__new" ? undefined : name} onChange={(e) => setChoice(e.target.value)}>
          <option value="">Choose…</option>
          {yours.length > 0 && (
            <optgroup label="Your categories">{yours.map((c) => <option key={c} value={c}>{c}</option>)}</optgroup>
          )}
          <optgroup label={yours.length ? "More" : "Categories"}>{rest.map((c) => <option key={c} value={c}>{c}</option>)}</optgroup>
          <option value="__new">+ New category…</option>
        </select>
      </label>
      {choice === "__new" && (
        <input className="input" name={name} value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Name your category" maxLength={40} aria-label="New category name" autoFocus />
      )}
    </div>
  );
}

export function TransactionForm({
  accounts,
  today,
  txn,
  onDone,
  categories = [],
}: {
  accounts: Account[];
  today: ISODate;
  txn?: import("@/lib/engine").OneTimeTransaction;
  onDone?: () => void;
  /** Your own categories, most used first. */
  categories?: string[];
}) {
  const [direction, setDirection] = useState<"in" | "out">(txn?.direction ?? "out");
  const usable = live(accounts).filter((a) => a.kind !== "loan");
  // From your bank: amount, date, account and status are the bank's facts. You can rename, recategorize, and say if it's day-to-day.
  if (txn?.externalId) {
    return (
      <ActionForm demoPreview action={saveTransaction} onSuccess={onDone} className="grid grid-cols-2 gap-3" aria-label="Edit transaction">
        <input type="hidden" name="id" value={txn.id} />
        <Field name="description" label="Name" defaultValue={txn.description} required maxLength={120} wrapperClassName="col-span-2" />
        <CategoryField defaultValue={txn.category} yours={categories} wrapperClassName="col-span-2" />
        {txn.direction === "out" && (
          <div className="col-span-2">
            <CheckboxField name="flexible" label="Day-to-day spending" defaultChecked={txn.flexible !== false} />
          </div>
        )}
        <p className="col-span-2 text-xs text-faint">Amount, date, account and {txn.pending ? "pending" : "posted"} status come from your bank.</p>
        <div className="col-span-2"><Submit>Save</Submit></div>
      </ActionForm>
    );
  }
  return (
    <ActionForm demoPreview action={saveTransaction} onSuccess={onDone} className="grid grid-cols-2 gap-3" resetOnSuccess={!txn} aria-label={txn ? "Edit transaction" : "Add transaction"}>
      {txn && <input type="hidden" name="id" value={txn.id} />}
      <SelectField name="direction" label="Type" value={direction} onChange={(e) => setDirection(e.target.value as "in" | "out")} options={[{ value: "out", label: "Money out" }, { value: "in", label: "Money in" }]} />
      <MoneyField name="amount" label="Amount" defaultValue={centsToInput(txn?.amountCents)} required />
      <Field name="description" label="Description" defaultValue={txn?.description} required maxLength={120} wrapperClassName="col-span-2" />
      <SelectField name="accountId" label="Account" defaultValue={txn?.accountId ?? usable[0]?.id} options={opt(usable)} wrapperClassName="col-span-2" />
      <CategoryField defaultValue={txn?.category} yours={categories} />
      <Field name="date" type="date" label="Date" defaultValue={txn?.date ?? today} required hint="A future date makes it a planned purchase. Today or earlier means it already happened." />
      <div className="col-span-2 flex flex-col gap-2">
        {direction === "out" && <CheckboxField name="flexible" label="Day-to-day spending" defaultChecked={txn ? txn.flexible !== false : true} />}
        <CheckboxField name="cleared" label="Already in my balance" defaultChecked={txn?.cleared} />
        <CheckboxField name="isEstimate" label="Amount is an estimate" defaultChecked={txn?.isEstimate} />
      </div>
      <div className="col-span-2">
        <Submit>{txn ? "Save" : "Add"}</Submit>
      </div>
    </ActionForm>
  );
}

export function TransferForm({ accounts, today, onDone }: { accounts: Account[]; today: ISODate; onDone?: () => void }) {
  const all = live(accounts);
  const from = all.filter((a) => !isLiability(a));
  return (
    <ActionForm demoPreview action={saveTransfer} onSuccess={onDone} className="grid gap-3 sm:grid-cols-2" resetOnSuccess aria-label="Add transfer or card payment">
      <SelectField name="fromAccountId" label="From" defaultValue={from[0]?.id} options={opt(from)} />
      <SelectField name="toAccountId" label="To" defaultValue={all.find((a) => a.id !== from[0]?.id)?.id} options={opt(all)} hint="To record paying off a credit card, choose the card here." />
      <MoneyField name="amount" label="Amount" required />
      <Field name="date" type="date" label="Date" defaultValue={today} required />
      <Field name="note" label="Note (optional)" maxLength={120} />
      <SelectField name="status" label="Status" defaultValue="planned" options={[{ value: "planned", label: "Planned" }, { value: "posted", label: "Done" }]} />
      <div className="sm:col-span-2">
        <CheckboxField name="cleared" label="Already included in the balances I entered" />
      </div>
      <div className="sm:col-span-2">
        <Submit>Add transfer</Submit>
      </div>
    </ActionForm>
  );
}
