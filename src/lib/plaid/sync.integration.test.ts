/**
 * End-to-end bank sync against a real database API (PostgREST over the real migrations) and the
 * fake bank. Run with `npm run test:bank` (scripts/test-bank-sync.sh sets it up); skipped otherwise.
 */
import { createHmac } from "node:crypto";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";

const REST = process.env.BANK_IT_REST; // e.g. http://127.0.0.1:54331
const SECRET = process.env.BANK_IT_JWT_SECRET ?? "";
const USER = "11111111-1111-1111-1111-111111111111";

const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
function jwt(claims: Record<string, unknown>) {
  const head = b64({ alg: "HS256", typ: "JWT" });
  const body = b64({ ...claims, exp: Math.floor(Date.now() / 1000) + 3600 });
  return `${head}.${body}.${createHmac("sha256", SECRET).update(`${head}.${body}`).digest("base64url")}`;
}

describe.skipIf(!REST)("bank sync, end to end", () => {
  let proxy: http.Server;
  let url = "";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let user: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let admin: any;
  let sync: typeof import("./sync");
  const today = new Date().toISOString().slice(0, 10);

  beforeAll(async () => {
    // supabase-js talks to <url>/rest/v1; PostgREST serves at its root.
    proxy = http.createServer((req, res) => {
      const target = new URL(REST!);
      const up = http.request(
        { host: target.hostname, port: target.port, path: (req.url ?? "/").replace(/^\/rest\/v1/, ""), method: req.method, headers: { ...req.headers, host: target.host } },
        (r) => {
          res.writeHead(r.statusCode ?? 500, r.headers);
          r.pipe(res);
        },
      );
      req.pipe(up);
    });
    await new Promise<void>((done) => proxy.listen(0, "127.0.0.1", done));
    url = `http://127.0.0.1:${(proxy.address() as AddressInfo).port}`;
    const service = jwt({ role: "service_role" });
    Object.assign(process.env, { NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_ANON_KEY: jwt({ role: "anon" }), SUPABASE_SERVICE_ROLE_KEY: service, PLAID_ENV: "mock" });
    user = createClient(url, jwt({ role: "anon" }), { db: { schema: "app" }, global: { headers: { Authorization: `Bearer ${jwt({ role: "authenticated", sub: USER })}` } }, auth: { persistSession: false } });
    admin = createClient(url, service, { db: { schema: "app" }, auth: { persistSession: false } });
    sync = await import("./sync");
  });
  afterAll(() => proxy?.close());

  it("connects, imports balances, statements and history, and keeps the token secret", async () => {
    const r = await sync.connectBank(user, USER, "public-mock-1", "Sample Bank (test)", today);
    expect(r.ok, r.message).toBe(true);
    const { data: accounts } = await user.from("accounts").select("*").order("kind");
    expect(accounts.map((a: { kind: string }) => a.kind).sort()).toEqual(["checking", "credit_card", "savings"]);
    const checking = accounts.find((a: { kind: string }) => a.kind === "checking");
    const card = accounts.find((a: { kind: string }) => a.kind === "credit_card");
    expect(checking).toMatchObject({ balance_cents: 243_118, balance_source: "bank", is_spendable: true, balance_as_of: today });
    expect(card).toMatchObject({ balance_cents: 81_240, payment_account_id: checking.id, statement_close_day: 20, payment_due_day: 15, apr_bps: 2499 });

    const { data: statements } = await user.from("card_statements").select("*");
    expect(statements).toHaveLength(1);
    expect(statements[0]).toMatchObject({ statement_balance_cents: 64_000, account_id: card.id });

    const { data: txns } = await user.from("transactions").select("*");
    expect(txns.length).toBeGreaterThan(50);
    expect(txns.every((t: { cleared: boolean }) => t.cleared)).toBe(true);
    expect(txns.filter((t: { category: string; flexible: boolean }) => t.category === "Card payment").every((t: { flexible: boolean }) => !t.flexible)).toBe(true);

    // The signed-in user can see the connection but never the token; the server's copy is encrypted.
    const { data: mine } = await user.from("bank_connections").select("*");
    expect(mine).toHaveLength(1);
    const blocked = await user.from("bank_secrets").select("*");
    expect(blocked.error).toBeTruthy();
    const { data: secret } = await admin.from("bank_secrets").select("*").single();
    expect(secret.access_token_enc).toMatch(/^v1:/);
    expect(secret.access_token_enc).not.toContain("access-mock");
  });

  it("syncs again without duplicating anything", async () => {
    const before = await user.from("transactions").select("id", { count: "exact", head: true });
    const { data: conn } = await user.from("bank_connections").select("id").single();
    const r = await sync.syncBank(user, USER, conn.id, today);
    expect(r.ok, r.message).toBe(true);
    const after = await user.from("transactions").select("id", { count: "exact", head: true });
    expect(after.count).toBe(before.count);
    const { data: accounts } = await user.from("accounts").select("id");
    expect(accounts).toHaveLength(3);
  });

  it("disconnects: forgets the token, keeps your accounts as manual ones", async () => {
    const { data: conn } = await user.from("bank_connections").select("id").single();
    await sync.disconnectBank(user, USER, conn.id);
    expect((await user.from("bank_connections").select("*")).data).toHaveLength(0);
    expect((await admin.from("bank_secrets").select("*")).data).toHaveLength(0);
    const { data: accounts } = await user.from("accounts").select("balance_source, bank_connection_id");
    expect(accounts).toHaveLength(3);
    expect(accounts.every((a: { balance_source: string; bank_connection_id: string | null }) => a.balance_source === "manual" && a.bank_connection_id === null)).toBe(true);
  });
  it("reconnecting picks the same accounts back up, and removing deletes them", async () => {
    const r = await sync.connectBank(user, USER, "public-mock-2", "Sample Bank (test)", today);
    expect(r.ok, r.message).toBe(true);
    const { data: accounts } = await user.from("accounts").select("balance_source");
    expect(accounts).toHaveLength(3);
    expect(accounts.every((a: { balance_source: string }) => a.balance_source === "bank")).toBe(true);
    const { data: conn } = await user.from("bank_connections").select("id").single();
    await sync.disconnectBank(user, USER, conn.id, true);
    expect((await user.from("accounts").select("id")).data).toHaveLength(0);
    expect((await user.from("transactions").select("id")).data).toHaveLength(0);
    expect((await admin.from("bank_secrets").select("*")).data).toHaveLength(0);
  });
});
