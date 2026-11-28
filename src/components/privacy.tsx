"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { formatCents } from "@/lib/money";

const HideCtx = createContext(false);

export function PrivacyProvider({ hide, children }: { hide: boolean; children: React.ReactNode }) {
  return <HideCtx.Provider value={hide}>{children}</HideCtx.Provider>;
}

export const useHideAmounts = () => useContext(HideCtx);

/** Renders cents as dollars; masked when the user has "hide amounts" on. */
export function Money({
  cents,
  sign,
  compact,
  className = "",
  tone,
  whole,
}: {
  cents: number;
  sign?: boolean;
  compact?: boolean;
  className?: string;
  tone?: "auto" | "in" | "out";
  /** Whole dollars, rounded toward zero (never overstates a cap). */
  whole?: boolean;
}) {
  const hide = useHideAmounts();
  const color =
    tone === "auto" ? (cents > 0 ? "text-in" : cents < 0 ? "text-out" : "") : tone === "in" ? "text-in" : tone === "out" ? "text-out" : "";
  if (hide) {
    return (
      <span className={`tabular ${className}`} aria-label="Amount hidden">
        $•••
      </span>
    );
  }
  if (whole) {
    const dollars = Math.round(cents / 100);
    const text = (dollars < 0 ? "−$" : "$") + Math.abs(dollars).toLocaleString("en-US");
    return <span className={`tabular ${color} ${className}`}>{text}</span>;
  }
  return <span className={`tabular ${color} ${className}`}>{formatCents(cents, { sign, compact })}</span>;
}

/** A money amount that counts up to its value when it first appears (still when motion is reduced). */
export function CountUpMoney({ cents, duration = 650, ...rest }: React.ComponentProps<typeof Money> & { duration?: number }) {
  const [shown, setShown] = useState(cents);
  useEffect(() => {
    if (typeof window === "undefined" || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setShown(cents);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const from = Math.round(cents * 0.6);
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / duration);
      const ease = 1 - Math.pow(1 - k, 3);
      setShown(Math.round(from + (cents - from) * ease));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [cents, duration]);
  return <Money {...rest} cents={shown} />;
}
