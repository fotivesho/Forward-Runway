"use client";

import { useState } from "react";
import { saveAccount, saveGoal, saveRule, saveStatement, saveTransaction, saveTransfer, updateBalance } from "@/app/app/actions";
import type { Account, CardStatement, RecurringRule, SavingsGoal } from "@/lib/engine";
import { centsToInput } from "@/lib/money";
import type { ISODate } from "@/lib/dates";
import { SPEND_CATEGORIES } from "./advisor";
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
            hint="Bills and daily spending come out of spendable accounts. Savings normally aren't."
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
            <CheckboxField name="payInFull" label="I pay the statement in full" defaultChecked={account ? account.payInFull !== false : true} hint="Recommended. If off, only the minimum is scheduled and interest is flagged." />
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
      <MoneyField name="paid" label="Already paid toward it" defaultValue={centsToInput(statement?.paidCents ?? 0)} hint="Anything still unpaid is scheduled on the due date." />
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
      <SelectField name="accountId" label="Held in" defaultValue={goal?.accountId ?? ""} options={[{ value: "", label: "Not linked yet" }, ...opt(savings)]} hint="Use a separate savings account so it's never counted as spendable." />
      <MoneyField name="target" label="Target" defaultValue={centsToInput(goal?.targetCents)} required />
      <Field name="targetDate" type="date" label="Target date (optional)" defaultValue={goal?.targetDate ?? ""} />
      <MoneyField name="monthlyContribution" label="Planned monthly contribution" defaultValue={centsToInput(goal?.monthlyContributionCents)} hint="Reserved automatically unless a recurring transfer already funds it." />
      <div className="sm:col-span-2">
        <CheckboxField name="protected" label="Protect this money" defaultChecked={goal ? goal.protected !== false : true} hint="Never suggested to cover purchases or shortfalls unless you explicitly allow it." />
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

export function RuleForm({ rule, accounts, today, defaultKind, onDone }: { rule?: RecurringRule; accounts: Account[]; today: ISODate; defaultKind?: RecurringRule["kind"]; onDone?: () => void }) {
  const [kind, setKind] = useState<RecurringRule["kind"]>(rule?.kind ?? defaultKind ?? "bill");
  const [freq, setFreq] = useState(rule?.schedule.frequency ?? "monthly");
  const all = live(accounts);
  const cash = all.filter((a) => !isLiability(a) && a.isSpendable);
  const transferKind = ["loan_payment", "card_payment", "savings_transfer", "transfer"].includes(kind);
  const fromOptions = kind === "income" ? cash : transferKind ? all.filter((a) => !isLiability(a)) : all.filter((a) => a.isSpendable || a.kind === "credit_card");
  const toOptions =
    kind === "card_payment" ? all.filter((a) => a.kind === "credit_card") : kind === "loan_payment" ? all.filter((a) => a.kind === "loan") : kind === "savings_transfer" ? all.filter((a) => a.kind === "savings") : all;
  return (
    <ActionForm action={saveRule} onSuccess={onDone} className="grid grid-cols-2 gap-3" resetOnSuccess={!rule} aria-label={rule ? `Edit ${rule.name}` : "Add recurring item"}>
      {rule && <input type="hidden" name="id" value={rule.id} />}
      <SelectField name="kind" label="What is it?" value={kind} onChange={(e) => setKind(e.target.value as RecurringRule["kind"])} options={RULE_KINDS} />
      <Field name="name" label="Name" defaultValue={rule?.name} placeholder={kind === "income" ? "Paycheck" : "Rent"} required maxLength={80} />
      <MoneyField name="amount" label="Amount" defaultValue={centsToInput(rule?.amountCents)} required />
      <SelectField
        name="accountId"
        label={kind === "income" ? "Paid into" : transferKind ? "From" : "Paid with"}
        defaultValue={rule?.accountId ?? fromOptions[0]?.id}
        options={opt(fromOptions)}
        hint={!transferKind && kind !== "income" ? "Choose a card if it's charged to a card — it's then paid with the statement, not twice." : undefined}
        wrapperClassName="col-span-2"
      />
      {transferKind && <SelectField name="toAccountId" label="To" defaultValue={rule?.toAccountId ?? toOptions[0]?.id ?? ""} options={[{ value: "", label: "Choose…" }, ...opt(toOptions)]} />}
      <Field name="category" label="Category (optional)" defaultValue={rule?.category ?? ""} maxLength={40} list="rule-categories" />
      <datalist id="rule-categories">
        {["Housing", "Utilities", "Insurance", "Subscriptions", "Debt", "Savings", "Groceries", "Transport", "Salary", ...SPEND_CATEGORIES].map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
      <SelectField
        name="frequency"
        label="How often"
        value={freq}
        onChange={(e) => setFreq(e.target.value as typeof freq)}
        options={[
          { value: "once", label: "Once" },
          { value: "weekly", label: "Every week" },
          { value: "biweekly", label: "Every 2 weeks" },
          { value: "semimonthly", label: "Twice a month" },
          { value: "monthly", label: "Monthly" },
        ]}
      />
      <Field name="startDate" type="date" label={freq === "once" ? "Date" : freq === "weekly" || freq === "biweekly" ? "Next (or a past) date it happens" : "Starts"} defaultValue={rule?.schedule.startDate ?? today} required />
      {(freq === "monthly" || freq === "semimonthly") && (
        <SelectField
          name="dayOfMonth"
          label={freq === "semimonthly" ? "First day" : "Day of month"}
          defaultValue={rule?.schedule.dayOfMonth != null ? String(rule.schedule.dayOfMonth) : freq === "semimonthly" ? "1" : ""}
          options={dayOptions(freq === "monthly" ? "Same day as start date" : "1")}
          hint="Days past the end of a short month land on its last day."
        />
      )}
      {freq === "semimonthly" && (
        <SelectField name="secondDayOfMonth" label="Second day" defaultValue={rule?.schedule.secondDayOfMonth != null ? String(rule.schedule.secondDayOfMonth) : "15"} options={dayOptions("15")} />
      )}
      {freq !== "once" && <Field name="endDate" type="date" label="Ends (optional)" defaultValue={rule?.schedule.endDate ?? ""} />}
      <SelectField
        name="weekendAdjust"
        label="If it falls on a weekend"
        wrapperClassName="col-span-2"
        defaultValue={rule?.schedule.weekendAdjust ?? (kind === "income" ? "before" : "none")}
        options={[
          { value: "none", label: "Keep the date" },
          { value: "before", label: "Move to the Friday before" },
          { value: "after", label: "Move to the Monday after" },
        ]}
      />
      <div className="col-span-2">
        <CheckboxField name="isEstimate" label="Amount is an estimate" defaultChecked={rule?.isEstimate} hint="Shown as an estimate so confirmed facts and guesses stay separate." />
      </div>
      <div className="col-span-2">
        <Submit>{rule ? "Save changes" : "Add"}</Submit>
      </div>
    </ActionForm>
  );
}

/* -------------------------------------------------------------- transaction */

export function TransactionForm({ accounts, today, txn, onDone }: { accounts: Account[]; today: ISODate; txn?: import("@/lib/engine").OneTimeTransaction; onDone?: () => void }) {
  const [direction, setDirection] = useState<"in" | "out">(txn?.direction ?? "out");
  const usable = live(accounts).filter((a) => a.kind !== "loan");
  return (
    <ActionForm action={saveTransaction} onSuccess={onDone} className="grid grid-cols-2 gap-3" resetOnSuccess={!txn} aria-label={txn ? "Edit transaction" : "Add transaction"}>
      {txn && <input type="hidden" name="id" value={txn.id} />}
      <SelectField name="direction" label="Type" value={direction} onChange={(e) => setDirection(e.target.value as "in" | "out")} options={[{ value: "out", label: "Money out" }, { value: "in", label: "Money in" }]} />
      <MoneyField name="amount" label="Amount" defaultValue={centsToInput(txn?.amountCents)} required />
      <Field name="description" label="Description" defaultValue={txn?.description} required maxLength={120} wrapperClassName="col-span-2" />
      <SelectField name="accountId" label="Account" defaultValue={txn?.accountId ?? usable[0]?.id} options={opt(usable)} hint="A purchase on a credit card is paid later with the statement." wrapperClassName="col-span-2" />
      <Field name="category" label="Category" defaultValue={txn?.category ?? ""} list="txn-categories" maxLength={40} />
      <datalist id="txn-categories">{SPEND_CATEGORIES.map((c) => <option key={c} value={c} />)}</datalist>
      <Field name="date" type="date" label="Date" defaultValue={txn?.date ?? today} required />
      <SelectField name="status" label="Status" defaultValue={txn?.status ?? "posted"} options={[{ value: "posted", label: "Happened" }, { value: "planned", label: "Planned / expected" }]} wrapperClassName="col-span-2" />
      <div className="col-span-2 flex flex-col gap-2">
        {direction === "out" && <CheckboxField name="flexible" label="Day-to-day spending" defaultChecked={txn ? txn.flexible !== false : true} hint="Counts against your daily caps and teaches your spending pattern." />}
        <CheckboxField name="cleared" label="Already included in the balance I entered" defaultChecked={txn?.cleared} hint="Tick this if your account balance already reflects it, so it isn't subtracted twice." />
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
    <ActionForm action={saveTransfer} onSuccess={onDone} className="grid gap-3 sm:grid-cols-2" resetOnSuccess aria-label="Add transfer or card payment">
      <SelectField name="fromAccountId" label="From" defaultValue={from[0]?.id} options={opt(from)} />
      <SelectField name="toAccountId" label="To" defaultValue={all.find((a) => a.id !== from[0]?.id)?.id} options={opt(all)} hint="Choose a card here to record a card payment." />
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
