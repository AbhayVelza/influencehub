import { defineConfig } from '@playwright/test'

// End-to-end tests per role (e2e/), against the dev server in prototype mode: each test gets a fresh browser context,
// so a fresh, empty workspace with one admin. Uses the installed Microsoft Edge; set E2E_CHANNEL=chromium after
// `npx playwright install chromium`. Don't edit src/ while it runs (the dev server reloads the page mid-test).
const PORT = Number(process.env.E2E_PORT ?? 5199)

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  workers: 2,
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    channel: process.env.E2E_CHANNEL ?? 'msedge',
    timezoneId: 'Asia/Kolkata',
    viewport: { width: 1440, height: 1000 },
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    env: { VITE_API_SERVER: 'false' },
  },
})
