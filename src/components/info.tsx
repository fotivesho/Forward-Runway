"use client";

import { useEffect, useId, useRef, useState } from "react";

/** A small ⓘ that opens a bubble of context. Keeps screens light; the explanation is one tap away. */
export function Info({ children, label = "More info", className = "" }: { children: React.ReactNode; label?: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const [top, setTop] = useState(0);
  const id = useId();
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);
  return (
    <span ref={ref} className={`relative inline-flex align-middle ${className}`}>
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={id}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setTop((e.currentTarget as HTMLElement).getBoundingClientRect().bottom + 6);
          setOpen((o) => !o);
        }}
        className="relative ml-1 inline-flex h-[15px] w-[15px] items-center justify-center rounded-full border border-faint/50 font-serif text-[10px] italic leading-none text-faint transition before:absolute before:-inset-2 before:content-[''] hover:border-brand hover:text-brand"
      >
        i
      </button>
      {open && (
        <span
          id={id}
          role="note"
          style={{ top }}
          className="fixed inset-x-4 z-50 mx-auto max-w-sm rounded-xl border border-line bg-surface-2 p-3 text-left text-xs font-normal normal-case leading-snug tracking-normal text-ink shadow-xl"
        >
          {children}
        </span>
      )}
    </span>
  );
}
