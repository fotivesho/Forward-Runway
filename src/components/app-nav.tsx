"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/app", label: "Today", icon: "◎" },
  { href: "/app/forecast", label: "Forecast", icon: "↗" },
  { href: "/app/plans", label: "Bills & pay", icon: "↻" },
  { href: "/app/calendar", label: "Calendar", icon: "▦" },
  { href: "/app/what-if", label: "What if", icon: "?" },
  { href: "/app/accounts", label: "Accounts", icon: "▭" },
  { href: "/app/activity", label: "Activity", icon: "≡" },
  { href: "/app/settings", label: "Settings", icon: "⚙" },
];
const MOBILE = ["/app", "/app/forecast", "/app/plans", "/app/calendar", "/app/what-if"];

export function AppNav({ base = "/app" }: { base?: "/app" | "/demo" }) {
  const path = usePathname();
  const to = (href: string) => base + href.slice(4);
  const active = (href: string) => (href === "/app" ? path === base : path.startsWith(to(href)));
  return (
    <>
      <nav aria-label="Main" className="hidden lg:block">
        <ul className="sticky top-4 space-y-1">
          {LINKS.map((l) => (
            <li key={l.href}>
              <Link
                href={to(l.href)}
                aria-current={active(l.href) ? "page" : undefined}
                className={`flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium ${active(l.href) ? "bg-surface-3 text-ink" : "text-muted hover:bg-surface-2 hover:text-ink"}`}
              >
                <span aria-hidden className="w-4 text-center text-brand">{l.icon}</span>
                {l.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        <ul className="grid grid-cols-5">
          {LINKS.filter((l) => MOBILE.includes(l.href)).map((l) => (
            <li key={l.href}>
              <Link
                href={to(l.href)}
                aria-current={active(l.href) ? "page" : undefined}
                className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${active(l.href) ? "text-brand" : "text-muted"}`}
              >
                <span aria-hidden className="text-base">{l.icon}</span>
                {l.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}
