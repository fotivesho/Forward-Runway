"use client";

import { useEffect, useId, useRef, useState } from "react";
import { X } from "lucide-react";

type Place = { top?: number; bottom?: number };

/** Where the bubble goes: just under the ⓘ, or just above it when that's near the bottom of the screen. */
function placeFor(el: HTMLElement): Place {
  const r = el.getBoundingClientRect();
  const h = window.innerHeight;
  return r.bottom + 220 > h ? { bottom: Math.max(12, h - r.top + 8) } : { top: r.bottom + 8 };
}

/**
 * The bubble itself: a soft grey card, on screen, with a title and a small ×. Tap outside, press
 * Escape or tap × to close. The same look on every screen (and on the landing page).
 */
export function InfoBubble({ id, label, place, onClose, children }: { id?: string; label: string; place: Place; onClose: () => void; children: React.ReactNode }) {
  return (
    <span
      id={id}
      role="dialog"
      aria-label={label}
      style={place}
      onClick={(e) => e.stopPropagation()}
      className="info-bubble fixed inset-x-4 z-[60] mx-auto block max-w-sm rounded-2xl p-3.5 pr-10 text-left text-[13px] font-normal normal-case leading-relaxed tracking-normal shadow-[0_12px_40px_-12px_rgba(0,0,0,0.45)]"
    >
      <span className="mb-1 block text-xs font-bold">{label}</span>
      {children}
      <button type="button" onClick={onClose} aria-label="Close" className="info-bubble-x absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full">
        <X size={14} strokeWidth={2.4} aria-hidden />
      </button>
    </span>
  );
}

/** A thin ⓘ that opens the bubble. `color` overrides the ring/letter color (e.g. on the always-cream landing card). */
export function Info({ children, label = "More info", className = "", color }: { children: React.ReactNode; label?: string; className?: string; color?: string }) {
  const [place, setPlace] = useState<Place | null>(null);
  const id = useId();
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!place) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setPlace(null);
    };
    const away = () => setPlace(null);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    window.addEventListener("scroll", away, { passive: true });
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
      window.removeEventListener("scroll", away);
    };
  }, [place]);
  return (
    <span ref={ref} className={`relative inline-flex align-middle ${className}`}>
      <button
        type="button"
        aria-label={label}
        aria-expanded={!!place}
        aria-controls={id}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setPlace((p) => (p ? null : placeFor(e.currentTarget as HTMLElement)));
        }}
        className={`relative ml-1 inline-flex h-[15px] w-[15px] items-center justify-center rounded-full border font-serif text-[10px] italic leading-none transition before:absolute before:-inset-2 before:content-[''] ${color ? "" : "border-faint/50 text-faint hover:border-brand hover:text-brand"}`}
        style={color ? { borderColor: `${color}80`, color } : undefined}
      >
        i
      </button>
      {place && (
        <InfoBubble id={id} label={label} place={place} onClose={() => setPlace(null)}>
          {children}
        </InfoBubble>
      )}
    </span>
  );
}
