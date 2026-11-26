"use client";

import { useState, useTransition } from "react";
import { disconnectBankNow, finishBankLink, startBankLink, syncBankNow, type BankResult } from "@/app/app/bank-actions";
import { Badge } from "./ui";

export interface BankConnectionView {
  id: string;
  institutionName: string | null;
  status: "ok" | "needs_reauth" | "error";
  lastSyncedAt: string | null;
  lastError: string | null;
  accountNames: string[];
}

type PlaidHandler = { open: () => void; destroy: () => void };
declare global {
  interface Window {
    Plaid?: {
      create: (config: {
        token: string;
        onSuccess: (publicToken: string, metadata: { institution?: { name?: string } | null }) => void;
        onExit?: (err: unknown) => void;
      }) => PlaidHandler;
    };
  }
}

const PLAID_SCRIPT = "https://cdn.plaid.com/link/v2/stable/link-initialize.js";

function loadPlaid(): Promise<NonNullable<Window["Plaid"]>> {
  if (window.Plaid) return Promise.resolve(window.Plaid);
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = PLAID_SCRIPT;
    s.async = true;
    s.onload = () => (window.Plaid ? resolve(window.Plaid) : reject(new Error("Plaid didn't load")));
    s.onerror = () => reject(new Error("Couldn't load Plaid. Check your connection and try again."));
    document.head.appendChild(s);
  });
}

function ago(iso: string | null): string {
  if (!iso) return "never";
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (mins < 60) return `${Math.max(1, mins)} min ago`;
  const h = Math.round(mins / 60);
  return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} days ago`;
}

/**
 * Connect a bank with Plaid. Your bank sign-in happens in Plaid's own window: it never touches
 * this app. With the fake test bank (PLAID_ENV=mock), the window is skipped.
 */
export function BankConnections({ mode, connections }: { mode: "mock" | "sandbox" | "production"; connections: BankConnectionView[] }) {
  const [pending, start] = useTransition();
  const [note, setNote] = useState<BankResult | null>(null);

  const link = (connectionId?: string) =>
    start(async () => {
      setNote(null);
      const t = await startBankLink(connectionId);
      if (!t.ok || !t.token) return setNote(t);
      if (mode === "mock") {
        setNote(connectionId ? await syncBankNow(connectionId) : await finishBankLink("public-mock-1", "Sample Bank (test)"));
        return;
      }
      try {
        const Plaid = await loadPlaid();
        await new Promise<void>((done) => {
          const handler = Plaid.create({
            token: t.token!,
            onSuccess: (publicToken, metadata) => {
              start(async () => {
                setNote(connectionId ? await syncBankNow(connectionId) : await finishBankLink(publicToken, metadata.institution?.name ?? null));
              });
              handler.destroy();
              done();
            },
            onExit: () => {
              handler.destroy();
              done();
            },
          });
          handler.open();
        });
      } catch (e) {
        setNote({ ok: false, message: e instanceof Error ? e.message : "Couldn't open Plaid." });
      }
    });

  const run = (fn: () => Promise<BankResult>) => start(async () => setNote(await fn()));

  return (
    <section className="card p-4 sm:p-5" aria-labelledby="bank-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="bank-title" className="text-base font-semibold text-ink">Bank connections</h2>
          <p className="mt-1 max-w-xl text-sm text-muted">
            Balances, card statements and transactions update themselves. You sign in to your bank in Plaid's secure window; your login never touches this app.
            {mode !== "production" && <span className="text-warn"> {mode === "mock" ? "Test bank: made-up data." : "Sandbox: Plaid's test banks only."}</span>}
          </p>
        </div>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => link()} disabled={pending}>
          {pending ? "Working…" : connections.length ? "+ Connect another" : "Connect your bank"}
        </button>
      </div>

      {note && (
        <p role="status" className={`mt-3 rounded-lg border px-3 py-2 text-sm ${note.ok ? "border-brand/40 bg-brand/5 text-brand" : "border-danger/50 bg-danger/5 text-danger"}`}>
          {note.message}
        </p>
      )}

      {connections.length > 0 && (
        <ul className="mt-4 space-y-2">
          {connections.map((c) => (
            <li key={c.id} className="rounded-xl border border-line p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium text-ink">🏦 {c.institutionName ?? "Your bank"}</p>
                {c.status === "ok" ? <Badge tone="good">Connected</Badge> : c.status === "needs_reauth" ? <Badge tone="warn">Sign in again</Badge> : <Badge tone="bad">Sync failed</Badge>}
              </div>
              <p className="mt-0.5 text-xs text-muted">
                {c.accountNames.length ? c.accountNames.join(" · ") : "No accounts yet"} · last synced {ago(c.lastSyncedAt)}
              </p>
              {c.lastError && c.status !== "ok" && <p className="mt-1 text-xs text-warn">{c.lastError}</p>}
              <div className="mt-2 flex flex-wrap gap-2">
                {c.status === "needs_reauth" ? (
                  <button type="button" className="btn btn-primary btn-sm" disabled={pending} onClick={() => link(c.id)}>Sign in again</button>
                ) : (
                  <button type="button" className="btn btn-secondary btn-sm" disabled={pending} onClick={() => run(() => syncBankNow(c.id))}>Sync now</button>
                )}
                <button
                  type="button"
                  className="btn btn-ghost btn-sm text-danger"
                  disabled={pending}
                  onClick={() => {
                    if (confirm(`Disconnect ${c.institutionName ?? "this bank"}? Its accounts and history stay; they just stop updating.`)) run(() => disconnectBankNow(c.id));
                  }}
                >
                  Disconnect
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
