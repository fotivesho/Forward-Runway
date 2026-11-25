"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { saveTheme } from "@/app/app/actions";
import { THEME_COLOR, THEME_COOKIE, type ThemePref } from "@/lib/theme";

function readCookie(): ThemePref | null {
  const m = document.cookie.match(new RegExp(`(?:^|; )${THEME_COOKIE}=(system|light|dark)`));
  return (m?.[1] as ThemePref) ?? null;
}

function apply(pref: ThemePref) {
  const root = document.documentElement;
  if (pref === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", pref);
  document.cookie = `${THEME_COOKIE}=${pref}; path=/; max-age=31536000; samesite=lax`;
  const dark = pref === "dark" || (pref === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute("content", dark ? THEME_COLOR.dark : THEME_COLOR.light));
  window.dispatchEvent(new Event("fr-theme"));
}

/** "light" or "dark" as currently shown (resolves "Auto" against the device setting). */
export function useResolvedTheme(): "light" | "dark" {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      mq.addEventListener("change", cb);
      window.addEventListener("fr-theme", cb);
      return () => {
        mq.removeEventListener("change", cb);
        window.removeEventListener("fr-theme", cb);
      };
    },
    () => {
      const attr = document.documentElement.getAttribute("data-theme");
      if (attr === "dark" || attr === "light") return attr;
      return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    },
    () => "light",
  );
}

const OPTIONS: Array<{ value: ThemePref; label: string; icon: string }> = [
  { value: "light", label: "Light", icon: "☀" },
  { value: "dark", label: "Dark", icon: "☾" },
  { value: "system", label: "Auto", icon: "A" },
];

/**
 * Light / Dark / Auto switch. `saved` is the signed-in user's stored preference:
 * a device with no cookie yet adopts it, and changes are saved back to the profile.
 */
export function ThemeToggle({ saved, persist = false, showLabels = false }: { saved?: ThemePref; persist?: boolean; showLabels?: boolean }) {
  const [pref, setPref] = useState<ThemePref>("system");
  useEffect(() => {
    const cookie = readCookie();
    if (!cookie && saved && saved !== "system") {
      apply(saved);
      setPref(saved);
    } else setPref(cookie ?? "system");
  }, [saved]);

  function choose(next: ThemePref) {
    setPref(next);
    apply(next);
    if (persist) {
      const f = new FormData();
      f.set("theme", next);
      void saveTheme(f);
    }
  }

  return (
    <div role="radiogroup" aria-label="Color theme" className="flex rounded-lg border border-line bg-surface p-0.5">
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={pref === o.value}
          aria-label={showLabels ? undefined : `${o.label} theme`}
          title={`${o.label} theme`}
          onClick={() => choose(o.value)}
          className={`flex min-h-9 min-w-9 items-center justify-center gap-1 rounded-md px-2 text-sm font-medium ${
            pref === o.value ? "bg-brand text-brand-ink" : "text-muted hover:text-ink"
          }`}
        >
          <span aria-hidden>{o.icon}</span>
          {showLabels && <span>{o.label}</span>}
        </button>
      ))}
    </div>
  );
}
