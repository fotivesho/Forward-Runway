"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export const PLAN_SECTIONS = [
  { href: "/plan", label: "Days" },
  { href: "/plan/month", label: "Month" },
  { href: "/plan/what-if", label: "What if" },
];

/** Plan's three views, as a bar on larger screens (on phones they sit above the tabs). */
export function PlanTabs({ base }: { base: "/app" | "/demo" }) {
  const path = usePathname();
  return (
    <nav aria-label="Plan" className="mb-4 hidden rounded-xl border border-line bg-surface p-1 lg:flex">
      {PLAN_SECTIONS.map((t) => {
        const href = base + t.href;
        const active = path === href;
        return (
          <Link key={t.href} href={href} aria-current={active ? "page" : undefined}
            className={`flex min-h-10 flex-auto items-center justify-center whitespace-nowrap rounded-lg px-1.5 text-sm font-medium transition ${active ? "bg-brand text-brand-ink" : "text-muted hover:text-ink"}`}>
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
