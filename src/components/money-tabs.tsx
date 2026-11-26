"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Money's sub-tabs: Overview · Budget · Reports. */
export function MoneyTabs({ base }: { base: "/app" | "/demo" }) {
  const path = usePathname();
  const tabs = [
    { href: `${base}/spend`, label: "Overview" },
    { href: `${base}/spend/budget`, label: "Budget" },
    { href: `${base}/spend/reports`, label: "Reports" },
  ];
  return (
    <nav aria-label="Money" className="mb-4 flex rounded-xl border border-line bg-surface p-1">
      {tabs.map((t) => {
        const active = path === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={`flex min-h-10 flex-1 items-center justify-center rounded-lg text-sm font-medium transition ${active ? "bg-brand text-brand-ink" : "text-muted hover:text-ink"}`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
