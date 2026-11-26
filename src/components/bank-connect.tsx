"use client";

import { useEffect, useState, useTransition } from "react";
import { disconnectBankNow, finishBankLink, startBankLink, syncBankNow, type BankResult } from "@/app/app/bank-actions";
import { Badge } from "./ui";
import { Glyph } from "@/components/icon";
import { Info } from "./info";

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
        /** Set when coming back from a bank's own sign-in page (OAuth banks like Chase). */
        receivedRedirectUri?: string;
        onSuccess: (publicToken: string, metadata: { institution?: { name?: string } | null }) => void;
        onExit?: (
          err: { error_code?: string; error_type?: string; display_message?: string | null; error_message?: string } | null,
          metadata: { institution?: { name?: string } | null; link_session_id?: string; request_id?: string; status?: string },
        ) => void;
      }) => PlaidHandler;
    };
  }
}

/** Remembers the Link session across an OAuth bank's redirect (this tab only). */
const RESUME_KEY = "fr-plaid-link";

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
export function BankConnections({
  mode,
  connections,
  redirectReady = true,
}: {
  mode: "mock" | "sandbox" | "production";
  connections: BankConnectionView[];
  /** PLAID_REDIRECT_URI is set: banks that sign in on their own site (Chase, Amex…) can send you back. */
  redirectReady?: boolean;
}) {
  const [pending, start] = useTransition();
  const [note, setNote] = useState<BankResult | null>(null);

  const openLink = async (token: string, connectionId: string | undefined, receivedRedirectUri?: string) => {
    try {
      sessionStorage.setItem(RESUME_KEY, JSON.stringify({ token, connectionId: connectionId ?? null }));
    } catch {
      // Without storage an OAuth bank can't resume, but every other bank still works.
    }
    try {
      const Plaid = await loadPlaid();
      await new Promise<void>((done) => {
        const finish = () => {
          try {
            sessionStorage.removeItem(RESUME_KEY);
          } catch {}
          done();
        };
        const handler = Plaid.create({
          token,
          ...(receivedRedirectUri ? { receivedRedirectUri } : {}),
          onSuccess: (publicToken, metadata) => {
            start(async () => {
              setNote(connectionId ? await syncBankNow(connectionId) : await finishBankLink(publicToken, metadata.institution?.name ?? null));
            });
            handler.destroy();
            finish();
          },
          onExit: (err, metadata) => {
            // Leaving on purpose says nothing; a failure says what Plaid reported, so it can be fixed.
            if (err) {
              const bank = metadata.institution?.name ?? "The bank";
              const why = err.display_message || err.error_message || "the connection didn't finish";
              setNote({
                ok: false,
                message: `${bank}: ${why}${err.error_code ? ` (Plaid code ${err.error_code}${metadata.link_session_id ? `, session ${metadata.link_session_id.slice(0, 12)}` : ""})` : ""}`,
              });
            }
            handler.destroy();
            finish();
          },
        });
        handler.open();
      });
    } catch (e) {
      setNote({ ok: false, message: e instanceof Error ? e.message : "Couldn't open Plaid." });
    }
  };

  // Back from a bank's own sign-in page (Chase and other OAuth banks): pick up where Plaid left off.
  useEffect(() => {
    if (mode === "mock" || !new URLSearchParams(window.location.search).has("oauth_state_id")) return;
    let saved: { token: string; connectionId: string | null } | null = null;
    try {
      saved = JSON.parse(sessionStorage.getItem(RESUME_KEY) ?? "null");
    } catch {}
    const here = window.location.href;
    window.history.replaceState(null, "", window.location.pathname);
    if (saved?.token) void openLink(saved.token, saved.connectionId ?? undefined, here);
    else setNote({ ok: false, message: "Your bank sent you back, but the connection had expired. Tap Connect your bank to try again." });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const link = (connectionId?: string) =>
    start(async () => {
      setNote(null);
      const t = await startBankLink(connectionId);
      if (!t.ok || !t.token) return setNote(t);
      if (mode === "mock") {
        setNote(connectionId ? await syncBankNow(connectionId) : await finishBankLink("public-mock-1", "Sample Bank (test)"));
        return;
      }
      await openLink(t.token, connectionId);
    });

  const run = (fn: () => Promise<BankResult>) => start(async () => setNote(await fn()));

  return (
    <section className="card p-4 sm:p-5" aria-labelledby="bank-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="bank-title" className="text-base font-bold text-ink">
            Banks <Info>Balances, statements and transactions update themselves. You sign in with Plaid; your login never reaches this app, and nothing can move your money.</Info>
          </h2>
          {mode !== "production" && <p className="text-xs text-warn">{mode === "mock" ? "Test bank: made-up data." : "Sandbox: test banks only."}</p>}
        </div>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => link()} disabled={pending}>
          {pending ? "Working…" : connections.length ? "+ Connect another" : "Connect your bank"}
        </button>
      </div>

      {mode === "production" && !redirectReady && (
        <p className="mt-3 rounded-lg border border-warn/50 bg-warn/5 px-3 py-2 text-sm text-warn">
          Banks that sign you in on their own website (American Express, Chase, Capital One…) need the server setting PLAID_REDIRECT_URI = https://runwaytomorrow.com/app/accounts in Vercel, then a redeploy.
        </p>
      )}
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
                <p className="font-medium text-ink"><Glyph name="🏦" size="xs" /> {c.institutionName ?? "Your bank"}</p>
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
                <button
                  type="button"
                  className="btn btn-ghost btn-sm text-danger"
                  disabled={pending}
                  onClick={() => {
                    const n = c.accountNames.length;
                    if (confirm(`Remove ${c.institutionName ?? "this bank"} and delete its ${n} account${n === 1 ? "" : "s"} and their history? This can't be undone.`)) run(() => disconnectBankNow(c.id, true));
                  }}
                >
                  Remove bank and its accounts
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
