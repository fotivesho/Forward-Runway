"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const KEY = "fr-demo-nudge-dismissed";

/** After someone has explored the demo for a bit, offer the next step. Dismissible; remembered per browser. */
export function DemoNudge() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    try {
      if (sessionStorage.getItem(KEY)) return;
    } catch {
      /* storage blocked: still fine to show */
    }
    let scrolled = false;
    const onScroll = () => {
      if (window.scrollY > 900) scrolled = true;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    const timer = window.setInterval(() => {
      if (scrolled) {
        setShow(true);
        window.clearInterval(timer);
      }
    }, 1500);
    const fallback = window.setTimeout(() => setShow(true), 45_000);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.clearInterval(timer);
      window.clearTimeout(fallback);
    };
  }, []);
  if (!show) return null;
  const dismiss = () => {
    setShow(false);
    try {
      sessionStorage.setItem(KEY, "1");
    } catch {
      /* ignore */
    }
  };
  return (
    <aside
      aria-label="Create your own runway"
      className="fade-up fixed inset-x-3 bottom-[4.75rem] z-50 mx-auto flex max-w-xl items-center gap-3 rounded-2xl border border-white/10 bg-[#182d26] p-3 pl-4 text-[#f1f6ea] shadow-2xl lg:bottom-6"
    >
      <p className="min-w-0 flex-1 text-sm">
        <strong className="block">Imagine this with your numbers.</strong>
        <span className="text-[#b9cbb4]">About five minutes to set up. No bank login.</span>
      </p>
      <Link href="/login?mode=signup" className="btn btn-sm shrink-0 bg-[#ddefbf] text-[#182d26] hover:bg-white">Create yours</Link>
      <button type="button" onClick={dismiss} className="btn btn-sm btn-ghost shrink-0 text-[#b9cbb4]" aria-label="Dismiss">✕</button>
    </aside>
  );
}
