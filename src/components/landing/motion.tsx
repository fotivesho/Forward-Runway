"use client";

import { useEffect, useRef, useState } from "react";

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Turns on scroll-in reveals once JavaScript is running (content stays visible without it). */
export function RevealRoot() {
  useEffect(() => {
    if (reducedMotion()) return;
    document.documentElement.classList.add("reveal-ready");
    const els = document.querySelectorAll<HTMLElement>(".reveal");
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            (e.target as HTMLElement).dataset.shown = "true";
            io.unobserve(e.target);
          }
        }
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.12 },
    );
    els.forEach((el) => io.observe(el));
    return () => {
      io.disconnect();
      document.documentElement.classList.remove("reveal-ready");
    };
  }, []);
  return null;
}

/** True once the element has scrolled into view (immediately with reduced motion). */
export function useInView<T extends Element>(threshold = 0.3) {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    if (reducedMotion() || !ref.current) {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(([e]) => e?.isIntersecting && (setInView(true), io.disconnect()), { threshold });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [threshold]);
  return { ref, inView };
}

/** Animates a number from 0 to `to` once `start` is true. */
export function useCountUp(to: number, start: boolean, ms = 1400) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!start) return;
    if (reducedMotion()) {
      setV(to);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / ms);
      const eased = 1 - Math.pow(1 - p, 3);
      setV(Math.round(to * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, start, ms]);
  return v;
}

export function usePrefersReducedMotion() {
  const [r, setR] = useState(false);
  useEffect(() => setR(reducedMotion()), []);
  return r;
}
