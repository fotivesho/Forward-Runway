"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

type Place = { top?: number; bottom?: number; originX: number; maxHeight?: number };

/**
 * Under the ⓘ if it fits, otherwise above it; if neither fits, the roomier side with its own scroll.
 * The animation grows from the ⓘ.
 */
function placeFor(el: HTMLElement, height = 160): Place {
  const r = el.getBoundingClientRect();
  const h = window.innerHeight;
  const w = Math.min(320, window.innerWidth - 40);
  const left = (window.innerWidth - w) / 2;
  const originX = Math.max(12, Math.min(w - 12, r.left + r.width / 2 - left));
  const below = h - r.bottom - 22;
  const above = r.top - 22;
  if (height <= below) return { top: r.bottom + 10, originX };
  if (height <= above) return { bottom: h - r.top + 10, originX };
  return below >= above ? { top: r.bottom + 10, originX, maxHeight: below } : { bottom: h - r.top + 10, originX, maxHeight: above };
}

/**
 * The bubble: frosted glass, rendered on top of the page (a portal), so nothing can clip it or
 * push it off screen. Grows softly from the ⓘ; fades out on close.
 */
export function InfoBubble({ id, label, place, closing, onClose, children, bubbleRef, container }: {
  id?: string;
  label: string;
  place: Place;
  closing?: boolean;
  onClose: () => void;
  children: React.ReactNode;
  bubbleRef?: React.Ref<HTMLDivElement>;
  /** Where to render it. Inside a pop-up it must be the pop-up itself: an open <dialog> sits above
   *  everything else on the page and makes the rest untappable, so a bubble on the page would be hidden. */
  container?: Element | null;
}) {
  return createPortal(
    <div
      ref={bubbleRef}
      id={id}
      role="dialog"
      aria-label={label}
      data-state={closing ? "closed" : "open"}
      style={{ top: place.top, bottom: place.bottom, maxHeight: place.maxHeight, overflowY: place.maxHeight ? "auto" : undefined, transformOrigin: `${place.originX}px ${place.top != null ? "0%" : "100%"}`, ["--info-dy" as string]: place.top != null ? "-6px" : "6px" }}
      className="info-bubble fixed inset-x-0 z-[70] mx-auto w-[min(320px,calc(100vw-40px))] rounded-[22px] px-4 py-3 pr-10 text-left text-[13px] font-normal normal-case leading-relaxed tracking-normal"
    >
      <span className="info-bubble-title mb-0.5 block text-[10px] font-semibold">{label}</span>
      <span className="block">{children}</span>
      <button type="button" onClick={onClose} aria-label="Close" className="info-bubble-x absolute right-2.5 top-2.5 flex h-6 w-6 items-center justify-center rounded-full transition">
        <X size={12} strokeWidth={2.2} aria-hidden />
      </button>
    </div>,
    container ?? document.body,
  );
}

/**
 * A thin ⓘ that opens the bubble. It's a span with role="button", not a <button>: it works inside
 * labels and read-only (disabled) forms without toggling or submitting anything.
 * `color` sets the ⓘ color where the theme doesn't apply (the always-cream landing card).
 */
export function Info({ children, label = "More info", className = "", color }: { children: React.ReactNode; label?: string; className?: string; color?: string }) {
  const [place, setPlace] = useState<Place | null>(null);
  const [closing, setClosing] = useState(false);
  const id = useId();
  const trigger = useRef<HTMLSpanElement>(null);
  const bubble = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    setClosing(true);
    window.setTimeout(() => {
      setPlace(null);
      setClosing(false);
    }, 140);
  }, []);
  const toggle = () => {
    if (place && !closing) return close();
    if (trigger.current) {
      setClosing(false);
      setPlace(placeFor(trigger.current));
    }
  };

  useEffect(() => {
    if (!place || closing) return;
    const outside = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!bubble.current?.contains(t) && !trigger.current?.contains(t)) close();
    };
    const key = (e: KeyboardEvent) => e.key === "Escape" && close();
    // Only a real scroll closes it (phones nudge the page a few pixels on tap).
    const y0 = window.scrollY;
    const scroll = () => Math.abs(window.scrollY - y0) > 80 && close();
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("keydown", key);
    window.addEventListener("scroll", scroll, { passive: true });
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("keydown", key);
      window.removeEventListener("scroll", scroll);
    };
  }, [place, closing, close]);

  // Once it's on screen, measure it and settle on the side where it fits (before the first paint).
  useLayoutEffect(() => {
    if (place && !closing && trigger.current && bubble.current) {
      const p = placeFor(trigger.current, bubble.current.scrollHeight);
      if (p.top !== place.top || p.bottom !== place.bottom || p.maxHeight !== place.maxHeight) setPlace(p);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [place != null]);

  return (
    <span className={`relative inline-flex align-middle ${className}`}>
      <span
        ref={trigger}
        role="button"
        tabIndex={0}
        aria-label={label}
        aria-expanded={!!place && !closing}
        aria-controls={place ? id : undefined}
        onClick={(e) => {
          // Don't let a surrounding label, link or card act on this tap.
          e.preventDefault();
          e.stopPropagation();
          toggle();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            e.stopPropagation();
            toggle();
          }
        }}
        className={`info-dot relative ml-1 inline-flex h-[14px] w-[14px] cursor-pointer select-none items-center justify-center rounded-full font-serif text-[9px] italic leading-none transition-[transform,opacity] duration-150 active:scale-90 before:absolute before:-inset-2.5 before:content-[''] ${place && !closing ? "opacity-100" : "opacity-75 hover:opacity-100"} ${color ? "" : "text-faint"}`}
        style={color ? { color } : undefined}
      >
        i
      </span>
      {place && (
        <InfoBubble bubbleRef={bubble} id={id} label={label} place={place} closing={closing} onClose={close} container={trigger.current?.closest("dialog[open]")}>
          {children}
        </InfoBubble>
      )}
    </span>
  );
}
