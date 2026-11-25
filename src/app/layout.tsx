import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import "./globals.css";
import { ServiceWorker } from "@/components/service-worker";
import { isThemePref, THEME_COLOR, THEME_COOKIE } from "@/lib/theme";
import { APP_NAME, APP_SHORT_NAME } from "@/lib/brand";

export const metadata: Metadata = {
  title: { default: APP_NAME, template: `%s · ${APP_NAME}` },
  description: "See what's coming up, what you can safely spend today, and keep bills, cards and savings on track.",
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
  appleWebApp: { capable: true, title: APP_SHORT_NAME, statusBarStyle: "default" },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: THEME_COLOR.light },
    { media: "(prefers-color-scheme: dark)", color: THEME_COLOR.dark },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // The saved choice is applied on the server, so the page never flashes the wrong theme.
  // "Auto" (no attribute) follows the device setting via CSS.
  const pref = (await cookies()).get(THEME_COOKIE)?.value;
  const theme = isThemePref(pref) && pref !== "system" ? pref : undefined;
  return (
    <html lang="en" data-theme={theme}>
      <body>
        <a href="#main" className="sr-only-focusable fixed left-2 top-2 z-50 rounded bg-brand px-3 py-2 font-semibold text-brand-ink">
          Skip to content
        </a>
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
