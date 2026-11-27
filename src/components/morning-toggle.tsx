"use client";

import { useEffect, useState, useTransition } from "react";
import { Bell, BellOff } from "lucide-react";
import { removePush, savePush } from "@/app/app/push-actions";

const KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

function toBytes(base64: string) {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

/** "Morning note": a notification each morning with today's limit. One switch per device. */
export function MorningToggle({ demo = false }: { demo?: boolean }) {
  const [state, setState] = useState<"loading" | "on" | "off" | "unsupported" | "blocked" | "ios">("loading");
  const [note, setNote] = useState<string | null>(null);
  const [busy, start] = useTransition();

  useEffect(() => {
    const ios = /iPhone|iPad/.test(navigator.userAgent) && !(window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone);
    if (ios) return setState("ios");
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !KEY) return setState("unsupported");
    if (Notification.permission === "denied") return setState("blocked");
    navigator.serviceWorker.ready.then((r) => r.pushManager.getSubscription()).then((s) => setState(s ? "on" : "off"));
  }, []);

  const turnOn = () =>
    start(async () => {
      setNote(null);
      if (demo) return setNote("Demo: create your own account to get the morning note.");
      const perm = await Notification.requestPermission();
      if (perm !== "granted") return setState(perm === "denied" ? "blocked" : "off");
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toBytes(KEY) });
      const r = await savePush(sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } });
      if (!r.ok) {
        await sub.unsubscribe();
        return setNote(r.message ?? "Couldn't turn it on.");
      }
      setState("on");
      setNote("On. You'll get today's limit each morning around 7am.");
    });
  const turnOff = () =>
    start(async () => {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await removePush(sub.endpoint);
        await sub.unsubscribe();
      }
      setState("off");
      setNote("Off for this device.");
    });

  return (
    <div className="space-y-2">
      {state === "ios" ? (
        <p className="text-sm text-muted">On iPhone, first add Runway to your Home Screen (Share → Add to Home Screen), open it from there, then turn this on.</p>
      ) : state === "unsupported" ? (
        <p className="text-sm text-muted">This browser can&apos;t show notifications from websites.</p>
      ) : state === "blocked" ? (
        <p className="text-sm text-muted">Notifications are blocked for this site. Allow them in your browser&apos;s settings, then come back.</p>
      ) : (
        <button type="button" disabled={busy || state === "loading"} onClick={state === "on" ? turnOff : turnOn} className={`btn btn-sm ${state === "on" ? "btn-secondary" : "btn-primary"}`}>
          {state === "on" ? <><BellOff size={14} aria-hidden /> Turn off on this device</> : <><Bell size={14} aria-hidden /> Turn on morning note</>}
        </button>
      )}
      {note && <p className="text-xs text-muted" aria-live="polite">{note}</p>}
    </div>
  );
}
