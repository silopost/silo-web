import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import pkg from "./package.json" with { type: "json" };

export default defineConfig({
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    globals: false,
    // e2e/ holds the Playwright tests (npm run e2e).
    include: ["src/**/*.test.{ts,tsx}"],
    // Several component tests drive whole screens through msw; the 5 s default
    // times out randomly on a loaded machine (3-6 failures per run), 20 s is calm.
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
});
