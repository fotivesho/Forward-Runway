import { describe, expect, it } from "vitest";
import { demoSnapshot } from "../data/demo";
import type { Snapshot } from "../data/snapshot";
import type { OneTimeTransaction } from "../engine";
import { noticed } from "./noticed";

const today = "2026-11-25";
const base = demoSnapshot(today, `${today}T15:00:00Z`);
const acct = base.accounts.find((a) => a.kind === "checking")!.id;
let n = 0;
const tx = (date: string, cents: number, description: string, category: string): OneTimeTransaction => ({
  id: `n${n++}`, date, amountCents: cents, direction: "out", accountId: acct, description, category, status: "posted", cleared: true,
});
const withTx = (extra: OneTimeTransaction[], more: Partial<Snapshot> = {}): Snapshot => ({ ...base, transactions: [...base.transactions, ...extra], ...more });

describe("noticed", () => {
  it("ranks things and gives every one a number and a reason", () => {
    const list = noticed(base, today);
    expect(list.length).toBeGreaterThan(0);
    for (const i of list) {
      expect(i.title.length).toBeGreaterThan(3);
      expect(i.stat).toBeTruthy();
      expect(i.impactCents).toBeGreaterThan(0);
    }
  });

  it("spots a category running hot this month, with bars as evidence", () => {
    const pets = [3, 2, 1].flatMap((k) => [tx(`2026-${String(11 - k).padStart(2, "0")}-10`, 4_000, "Pet store", "Pets")]);
    const now = [tx("2026-11-03", 9_000, "Pet store", "Pets"), tx("2026-11-12", 9_000, "Vet", "Pets")];
    const hot = noticed(withTx([...pets, ...now]), today, 30).find((i) => i.kind === "hot" && i.category === "Pets");
    expect(hot).toBeTruthy();
    expect(hot!.stat.startsWith("+")).toBe(true);
    expect(hot!.bars!.at(-1)!.kind).toBe("now");
  });

  it("flags the same charge twice within two days", () => {
    const dbl = noticed(withTx([tx("2026-11-20", 4_599, "GYMCO MEMBERSHIP", "Fitness"), tx("2026-11-21", 4_599, "GymCo Membership", "Fitness")]), today, 30);
    expect(dbl.some((i) => i.kind === "double")).toBe(true);
  });

  it("keeps a snoozed one away until its time is up", () => {
    const pair = [tx("2026-11-20", 4_599, "GYMCO MEMBERSHIP", "Fitness"), tx("2026-11-21", 4_599, "GymCo Membership", "Fitness")];
    const dbl = noticed(withTx(pair), today, 30).find((i) => i.kind === "double")!;
    expect(dbl).toBeTruthy();
    const s = withTx(pair, {
      corrections: [...base.corrections, { id: "c", kind: "preference", matchKey: `insight_snooze:${dbl.id}`, value: { until: "2026-12-25" }, updatedAt: "2026-11-25T00:00:00Z" } as unknown as Snapshot["corrections"][number]],
    });
    expect(noticed(s, today, 30).some((i) => i.id === dbl.id)).toBe(false);
  });
});
