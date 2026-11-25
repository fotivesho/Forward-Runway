export type ThemePref = "system" | "light" | "dark";
export const THEME_COOKIE = "fr-theme";
export const THEMES: ThemePref[] = ["system", "light", "dark"];
export const isThemePref = (v: unknown): v is ThemePref => v === "system" || v === "light" || v === "dark";
export const THEME_COLOR = { light: "#f6f1e4", dark: "#121a15" } as const;
