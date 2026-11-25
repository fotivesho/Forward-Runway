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
}: {
  cents: number;
  sign?: boolean;
  compact?: boolean;
  className?: string;
  tone?: "auto" | "in" | "out";
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
  return <span className={`tabular ${color} ${className}`}>{formatCents(cents, { sign, compact })}</span>;
}
