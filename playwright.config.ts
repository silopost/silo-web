import { defineConfig, devices } from "@playwright/test";
import { e2eEnv } from "./e2e/support/env";

/**
 * End-to-end tests of Faza 3 (plan, roadmap "Definition of done") against the full dev stack:
 * silo-server, Postgres and docker-mailserver from `silo/docker-compose.dev.yml`, checked on the
 * mail server over IMAP. The tests share the dev mailboxes, so they run one at a time.
 *
 * The web app is a production build served by `vite preview` (performance is measured on the
 * real bundle) with /api proxied to the compose silo-server; set SILO_E2E_WEB_URL to test an
 * already running instance instead.
 */
const env = e2eEnv();

export default defineConfig({
  testDir: "e2e",
  testMatch: "**/*.e2e.ts",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: env.webUrl,
    locale: "en-US",
    timezoneId: "Europe/Warsaw",
    trace: "retain-on-failure",
    viewport: { width: 1440, height: 900 },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: process.env.SILO_E2E_WEB_URL
    ? undefined
    : {
        command: `npm run build && npx vite preview --port ${env.webPort} --strictPort`,
        url: env.webUrl,
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
        env: { VITE_API_PROXY: env.apiUrl },
      },
});
