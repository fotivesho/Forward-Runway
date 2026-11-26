import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      // Next.js's server-only guard; in tests everything runs on the server.
      "server-only": path.resolve(__dirname, "src/test/server-only.ts"),
    },
  },
  test: { include: ["src/**/*.test.ts"], environment: "node" },
});
