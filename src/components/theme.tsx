"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Moon, Sun, SunMoon } from "lucide-react";
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

const OPTIONS: Array<{ value: ThemePref; label: string; Icon: typeof Sun }> = [
  { value: "system", label: "Auto", Icon: SunMoon },
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
];

/**
 * Light / Dark / Auto. In the header it's one small round button that cycles through them;
 * in Settings (`showLabels`) it's a labelled three-way switch. `saved` is the signed-in user's
 * stored preference: a device with no cookie yet adopts it, and changes are saved back.
 */
export function ThemeToggle({ saved, persist = false, showLabels = false, inverse = false }: { saved?: ThemePref; persist?: boolean; showLabels?: boolean; inverse?: boolean }) {
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

  if (!showLabels) {
    const i = OPTIONS.findIndex((o) => o.value === pref);
    const cur = OPTIONS[i]!;
    const next = OPTIONS[(i + 1) % OPTIONS.length]!;
    return (
      <button
        type="button"
        onClick={() => choose(next.value)}
        aria-label={`Theme: ${cur.label}. Switch to ${next.label}.`}
        title={`Theme: ${cur.label}`}
        className={`flex h-8 w-8 items-center justify-center rounded-full transition ${inverse ? "text-[#dfe9d8] hover:bg-white/10" : "text-muted hover:bg-surface-2 hover:text-ink"}`}
      >
        <cur.Icon size={16} strokeWidth={2} aria-hidden />
      </button>
    );
  }

  return (
    <div role="radiogroup" aria-label="Color theme" className="flex rounded-full border border-line bg-surface p-0.5">
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={pref === o.value}
          onClick={() => choose(o.value)}
          className={`flex min-h-8 items-center justify-center gap-1.5 rounded-full px-3 text-xs font-semibold transition ${pref === o.value ? "bg-surface-3 text-ink" : "text-muted hover:text-ink"}`}
        >
          <o.Icon size={14} strokeWidth={2} aria-hidden />
          {o.label}
        </button>
      ))}
    </div>
  );
}
