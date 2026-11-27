"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { autoSyncBanks } from "@/app/app/bank-actions";

const KEY = "runway:last-auto-sync";

/** When the app opens (and when you come back to it), pull in anything new from your banks. */
export function BankAutoSync() {
  const router = useRouter();
  useEffect(() => {
    let busy = false;
    const run = async () => {
      if (busy || document.visibilityState !== "visible") return;
      // At most once every 10 minutes from this device; the server also skips banks synced in the last 30.
      try {
        const last = Number(localStorage.getItem(KEY) ?? 0);
        if (Date.now() - last < 10 * 60_000) return;
        localStorage.setItem(KEY, String(Date.now()));
      } catch {}
      busy = true;
      try {
        const r = await autoSyncBanks();
        if (r.synced > 0) router.refresh();
      } finally {
        busy = false;
      }
    };
    run();
    document.addEventListener("visibilitychange", run);
    return () => document.removeEventListener("visibilitychange", run);
  }, [router]);
  return null;
}
