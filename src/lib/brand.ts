/**
 * The app's name lives here and nowhere else.
 * Set NEXT_PUBLIC_APP_NAME / NEXT_PUBLIC_APP_SHORT_NAME at build time to rename it
 * (e.g. "Runway Tomorrow" / "Runway Tmrw" at launch). The defaults are a working title.
 */
export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME?.trim() || "Project Fern";
/** Home-screen label: keep it to about 12 characters or phones cut it off. */
export const APP_SHORT_NAME = process.env.NEXT_PUBLIC_APP_SHORT_NAME?.trim() || "Fern";
/** File-name friendly version, e.g. "project-fern". */
export const APP_SLUG = APP_NAME.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "app";
