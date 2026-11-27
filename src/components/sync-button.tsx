"use client";

import { useState, useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { syncBankNow, type BankResult } from "@/app/app/bank-actions";

/**
 * A small "Sync" pill: asks the bank for its newest activity, pulls it in, and looks again a little
 * later (the bank takes a moment to answer). Says what happened in one quiet line.
 */
export function SyncButton({ connectionId }: { connectionId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [note, setNote] = useState<BankResult | null>(null);
  const go = () =>
    start(async () => {
      setNote(null);
      const first = await syncBankNow(connectionId);
      setNote(first);
      router.refresh();
      if (first.ok && first.refreshed) {
        setNote({ ok: true, message: `${first.message} Checking again in a moment…` });
        await new Promise((r) => setTimeout(r, 20_000));
        setNote(await syncBankNow(connectionId, false));
        router.refresh();
      }
    });
  return (
    <span className="inline-flex flex-col">
      <button type="button" onClick={go} disabled={pending} className="inline-flex items-center gap-1.5 self-start rounded-full border border-line px-3 py-1 text-xs font-semibold text-ink transition hover:border-brand/60 disabled:opacity-70">
        <RefreshCw size={13} strokeWidth={2.4} className={pending ? "animate-spin" : ""} aria-hidden />
        {pending ? "Syncing…" : "Sync now"}
      </button>
      {note && <span className={`mt-1 text-xs ${note.ok ? "text-muted" : "text-warn"}`} aria-live="polite">{note.message}</span>}
    </span>
  );
}
