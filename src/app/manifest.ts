import type { MetadataRoute } from "next";
import { APP_NAME, APP_SHORT_NAME } from "@/lib/brand";

/** Installable-app manifest; the name follows the single brand setting. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: APP_NAME,
    short_name: APP_SHORT_NAME,
    description: "Personal cash-flow forecast: what's coming up and what you can safely spend today.",
    start_url: "/app",
    scope: "/",
    display: "standalone",
    background_color: "#f6f1e4",
    theme_color: "#f6f1e4",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon-maskable.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
  };
}
