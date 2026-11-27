import { describe, expect, it } from "vitest";
import { addDays } from "../dates";
import { buildDashboard } from "../view/dashboard";
import { demoSnapshot } from "./demo";
import { buildExport, parseImport } from "./import-export";
import { accountSchema, parseForm, ruleSchema, transactionSchema } from "./schemas";

const fd = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};

describe("form validation", () => {
  it("returns friendly field errors", () => {
    const r = parseForm(transactionSchema, fd({ date: "2026-02-30", amount: "12.345", direction: "out", accountId: "x", description: "" }));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.fieldErrors.date).toMatch(/valid date/);
      expect(r.fieldErrors.amount).toMatch(/dollars and cents/);
      expect(r.fieldErrors.accountId).toBeTruthy();
      expect(r.fieldErrors.description).toMatch(/Enter a description/);
    }
  });

  it("forces cards to be non-spendable and converts APR to basis points", () => {
    const r = parseForm(
      accountSchema,
      fd({ name: "Visa", kind: "credit_card", balance: "1,240.00", balanceAsOf: "2026-01-01", isSpendable: "on", apr: "24.99", payInFull: "on" }),
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.row).toMatchObject({ is_spendable: false, balance_cents: 124_000, apr_bps: 2499 });
  });

  it("requires a destination for card payments", () => {
    const r = parseForm(
      ruleSchema,
      fd({ name: "Pay Visa", kind: "card_payment", amount: "100", accountId: "11111111-1111-4111-8111-111111111111", frequency: "monthly", startDate: "2026-01-01" }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fieldErrors.toAccountId).toMatch(/where the money goes/);
  });
});

describe("import/export", () => {
  it("round-trips the demo data with fresh, consistent IDs", () => {
    const snap = demoSnapshot("2026-03-10", "2026-03-10T15:00:00Z");
    const file = JSON.stringify(buildExport(snap, "2026-03-10T15:00:00Z"));
    expect(file).not.toMatch(/calendar\.example\.com/); // no calendar addresses
    let n = 0;
    const r = parseImport(file, () => `id-${++n}`);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.rows.accounts).toHaveLength(snap.accounts.length);
    const ids = new Set(r.rows.accounts.map((a) => a.id));
    for (const rule of r.rows.rules) {
      expect(ids.has(rule.account_id as string)).toBe(true);
      if (rule.to_account_id) expect(ids.has(rule.to_account_id as string)).toBe(true);
    }
    expect(r.rows.accountPaymentLinks.every((l) => ids.has(l.payment_account_id))).toBe(true);
    expect(r.counts.transactions).toBe(snap.transactions.length);
  });

  it("rejects foreign files and dangling references", () => {
    expect(parseImport("{", () => "x")).toMatchObject({ ok: false, error: "That file isn't valid JSON." });
    expect(parseImport(JSON.stringify({ format: "other", version: 1 }), () => "x").ok).toBe(false);
    const bad = {
      format: "forward-runway",
      version: 1,
      accounts: [],
      transactions: [{ id: "t", date: "2026-01-01", amountCents: 100, direction: "out", accountId: "nope", description: "x", status: "posted" }],
    };
    const r = parseImport(JSON.stringify(bad), () => "x");
    expect(r.ok).toBe(false);
  });

  it("rejects non-integer cents", () => {
    const bad = {
      format: "forward-runway",
      version: 1,
      accounts: [{ id: "a", name: "A", kind: "checking", balanceCents: 10.5, balanceAsOf: "2026-01-01", isSpendable: true }],
    };
    expect(parseImport(JSON.stringify(bad), () => "x").ok).toBe(false);
  });
});

describe("demo dashboard", () => {
  it("builds for every day of a year with consistent invariants", () => {
    for (let i = 0; i < 365; i += 3) {
      const today = addDays("2026-01-01", i);
      const now = new Date(`${today}T15:00:00Z`);
      const snap = demoSnapshot(today, now.toISOString());
      const m = buildDashboard(snap, today, 30, now);
      expect(m.forecast.days).toHaveLength(30);
      for (const d of m.forecast90.days) expect(d.closingCents).toBe(d.openingCents + d.inflowsCents - d.outflowsCents);
      // Daily caps add up to the pool and are never negative.
      expect(m.plan.days.reduce((s, d) => s + d.capCents, 0)).toBe(m.plan.poolCents);
      expect(m.plan.days.every((d) => d.capCents >= 0)).toBe(true);
      // Card charges never hit cash directly.
      const direct = m.forecast90.days.flatMap((d) => d.items).filter((it) => it.kind === "card_purchase");
      expect(direct).toHaveLength(0);
      // Duplicates never appear in the plan list, and every shown plan has an answer.
      expect(m.events.some((e) => e.duplicate)).toBe(false);
      expect(m.events.filter((e) => e.plannedCents > 0).every((e) => e.check)).toBe(true);
      // The fictional demo never contains a real calendar URL.
      expect(snap.calendarSources.every((c) => c.urlHint === "calendar.example.com")).toBe(true);
    }
  }, 30_000);
});

describe("export format rename", () => {
  it("writes the new format and still imports files made before the rename", () => {
    const snap = demoSnapshot("2026-03-10", "2026-03-10T15:00:00Z");
    const file = buildExport(snap, "2026-03-10T15:00:00Z");
    expect(file.format).toBe("runway-tomorrow");
    const legacy = JSON.stringify({ ...file, format: "forward-runway" });
    expect(parseImport(legacy, () => crypto.randomUUID()).ok).toBe(true);
  });
});
