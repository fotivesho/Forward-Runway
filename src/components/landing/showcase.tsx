"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

export interface ShowcaseTab {
  id: string;
  label: string;
  kicker: string;
  title: string;
  blurb: React.ReactNode;
  content: React.ReactNode;
}

/**
 * Everything the app does, in one place instead of a long scroll: a sticky row of tabs, one
 * feature at a time, and "Next" to walk through them in order. Swipe left/right on phones.
 */
export function Showcase({ tabs }: { tabs: ShowcaseTab[] }) {
  const [i, setI] = useState(0);
  const top = useRef<HTMLDivElement>(null);
  const touch = useRef<number | null>(null);
  const go = (n: number, scroll = true) => {
    setI(n);
    if (scroll && top.current && top.current.getBoundingClientRect().top < 0) top.current.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const t = tabs[i]!;
  const next = tabs[i + 1];
  return (
    <div ref={top} className="scroll-mt-2">
      <div className="sticky top-2 z-20 -mx-1 px-1">
        <div role="tablist" aria-label="What it does" className="mx-auto flex max-w-xl gap-1 overflow-x-auto rounded-full border border-line/70 bg-surface/90 p-1 shadow-[0_8px_30px_-12px_rgba(0,0,0,0.35)] backdrop-blur-xl">
          {tabs.map((x, n) => (
            <button key={x.id} role="tab" type="button" aria-selected={n === i} aria-controls={`panel-${x.id}`} onClick={() => go(n)}
              className={`min-h-9 flex-1 shrink-0 whitespace-nowrap rounded-full px-3 text-xs font-bold transition sm:text-sm ${n === i ? "bg-brand text-brand-ink shadow" : "text-muted hover:text-ink"}`}>
              {x.label}
            </button>
          ))}
        </div>
      </div>
      <div
        id={`panel-${t.id}`}
        role="tabpanel"
        key={t.id}
        className="fade-up pt-8"
        onTouchStart={(e) => (touch.current = e.touches[0]!.clientX)}
        onTouchEnd={(e) => {
          if (touch.current == null) return;
          const dx = e.changedTouches[0]!.clientX - touch.current;
          touch.current = null;
          // Only a clear horizontal swipe on the text area (not inside interactive pieces).
          if ((e.target as HTMLElement).closest("button,a,input,[role=button],svg")) return;
          if (dx < -70 && i < tabs.length - 1) go(i + 1, false);
          if (dx > 70 && i > 0) go(i - 1, false);
        }}
      >
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand sm:text-sm">{t.kicker}</p>
        <h2 className="font-display mt-1 max-w-3xl text-4xl leading-tight text-display sm:text-5xl">{t.title}</h2>
        <p className="mt-3 max-w-2xl text-base text-muted sm:text-lg">{t.blurb}</p>
        <div className="mt-8">{t.content}</div>
        <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
          <span className="flex gap-1.5" aria-hidden>
            {tabs.map((x, n) => <span key={x.id} className={`h-1.5 rounded-full transition-all ${n === i ? "w-6 bg-brand" : "w-1.5 bg-line"}`} />)}
          </span>
          {next ? (
            <button type="button" onClick={() => go(i + 1)} className="btn btn-secondary">Next: {next.label} →</button>
          ) : (
            <Link href="/demo/calendar?add=1" className="btn btn-primary">Try it all in the demo →</Link>
          )}
        </div>
      </div>
    </div>
  );
}

/** On phones, once the hero is gone: a small floating "Try the demo" until the final call to action. */
export function StickyDemo() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const hero = document.getElementById("main");
    const end = document.getElementById("cta-title");
    if (!hero) return;
    let heroGone = false;
    let atEnd = false;
    const update = () => setShow(heroGone && !atEnd);
    const a = new IntersectionObserver(([e]) => { heroGone = !e!.isIntersecting; update(); });
    const b = new IntersectionObserver(([e]) => { atEnd = e!.isIntersecting; update(); });
    a.observe(hero);
    if (end) b.observe(end);
    return () => { a.disconnect(); b.disconnect(); };
  }, []);
  return (
    <div className={`fixed inset-x-0 bottom-[max(1rem,env(safe-area-inset-bottom))] z-40 flex justify-center transition-all duration-300 sm:hidden ${show ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-6 opacity-0"}`}>
      <Link href="/demo/calendar?add=1" className="rounded-full bg-[#182d26] px-5 py-3 text-sm font-semibold text-[#ddefbf] shadow-[0_12px_30px_-8px_rgba(0,0,0,0.5)] ring-1 ring-white/10">
        Try the demo →
      </Link>
    </div>
  );
}
