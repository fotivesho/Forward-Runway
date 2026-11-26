"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, Landmark, Settings, Sparkles, Sunrise, TrendingUp, Wallet, type LucideIcon } from "lucide-react";

const LINKS: Array<{ href: string; label: string; Icon: LucideIcon }> = [
  { href: "/app", label: "Today", Icon: Sunrise },
  { href: "/app/spend", label: "Money", Icon: Wallet },
  { href: "/app/calendar", label: "Calendar", Icon: CalendarDays },
  { href: "/app/what-if", label: "What if", Icon: Sparkles },
  { href: "/app/forecast", label: "Forecast", Icon: TrendingUp },
  { href: "/app/accounts", label: "Accounts", Icon: Landmark },
  { href: "/app/settings", label: "Settings", Icon: Settings },
];
const MOBILE = ["/app", "/app/spend", "/app/calendar", "/app/what-if", "/app/forecast", "/app/accounts"];

export function AppNav({ base = "/app" }: { base?: "/app" | "/demo" }) {
  const path = usePathname();
  const to = (href: string) => base + href.slice(4);
  const active = (href: string) => (href === "/app" ? path === base : path.startsWith(to(href)));
  return (
    <>
      <nav aria-label="Main" className="hidden lg:block">
        <ul className="sticky top-4 space-y-1">
          {LINKS.map(({ href, label, Icon }) => (
            <li key={href}>
              <Link
                href={to(href)}
                aria-current={active(href) ? "page" : undefined}
                className={`flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition ${active(href) ? "bg-brand text-brand-ink shadow-sm" : "text-muted hover:bg-surface-2 hover:text-ink"}`}
              >
                <Icon aria-hidden size={18} strokeWidth={2.2} />
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {/* Phones: a calm floating dock. Every tab is equal; the current one sits on a soft tile. */}
      <nav aria-label="Main" className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 lg:hidden">
        <ul className="mx-auto grid max-w-md grid-cols-6 rounded-[28px] border border-line/70 bg-surface/90 p-1.5 shadow-[0_12px_40px_-10px_rgba(0,0,0,0.5)] backdrop-blur-xl">
          {LINKS.filter((l) => MOBILE.includes(l.href)).map(({ href, label, Icon }) => {
            const on = active(href);
            return (
              <li key={href}>
                <Link
                  href={to(href)}
                  aria-current={on ? "page" : undefined}
                  className="group flex flex-col items-center gap-0.5 py-1"
                >
                  <span className={`flex h-9 w-12 items-center justify-center rounded-2xl transition ${on ? "bg-brand/25 text-ink" : "text-muted group-hover:text-ink"}`}>
                    <Icon aria-hidden size={20} strokeWidth={on ? 2.2 : 1.8} />
                  </span>
                  <span className={`text-[10.5px] leading-tight ${on ? "font-semibold text-ink" : "text-muted"}`}>{label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
