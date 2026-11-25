"use client";
import { createContext, useContext } from "react";
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
    const dollars = Math.trunc(cents / 100);
    const text = (dollars < 0 ? "−$" : "$") + Math.abs(dollars).toLocaleString("en-US");
    return <span className={`tabular ${color} ${className}`}>{text}</span>;
  }
  return <span className={`tabular ${color} ${className}`}>{formatCents(cents, { sign, compact })}</span>;
}
