import type { MetadataRoute } from "next";
import { APP_NAME, APP_SHORT_NAME, APP_TAGLINE } from "@/lib/brand";

/** Installable-app manifest; the name follows the single brand setting. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: APP_NAME,
    short_name: APP_SHORT_NAME,
    description: `${APP_TAGLINE} See what's coming up and what you can safely spend today.`,
    start_url: "/app",
    scope: "/",
    display: "standalone",
    background_color: "#f6f1e4",
    theme_color: "#f6f1e4",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
