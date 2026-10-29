import { defineConfig } from '@playwright/test'

// End-to-end tests against the dev server with the mock API (each page gets fresh mock data).
// Uses the installed Microsoft Edge by default; set E2E_CHANNEL=chromium after `npx playwright install chromium`.
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
    permissions: ['clipboard-read', 'clipboard-write'],
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    env: { VITE_USE_MOCKS: 'true' },
  },
})
