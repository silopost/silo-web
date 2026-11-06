import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import { version } from "./package.json";

export default defineConfig({
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(version) },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    globals: false,
    // e2e/ holds the Playwright tests (npm run e2e).
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
