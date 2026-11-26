/**
 * The app's name lives here and nowhere else.
 * Override with NEXT_PUBLIC_APP_NAME / NEXT_PUBLIC_APP_SHORT_NAME at build time if needed.
 */
export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME?.trim() || "Runway Tomorrow";
/** Home-screen label: keep it to about 12 characters or phones cut it off. */
export const APP_SHORT_NAME = process.env.NEXT_PUBLIC_APP_SHORT_NAME?.trim() || "Runway";
export const APP_TAGLINE = "Your money, looking forward.";
/** File-name friendly version, e.g. "runway-tomorrow". */
export const APP_SLUG = APP_NAME.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "app";
/** Where people can reach you (shown on Terms and Privacy). Set NEXT_PUBLIC_SUPPORT_EMAIL to a real inbox. */
export const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() || null;
