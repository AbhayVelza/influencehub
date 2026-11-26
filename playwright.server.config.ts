import { defineConfig } from '@playwright/test'
import { E2E_ADMIN } from './e2e-server/accounts'

// End-to-end tests per role WITH SIGN-IN (e2e-server/): the built API server on a fresh throwaway schema (ih_e2e) of
// the local PostgreSQL in .env.local, and the app in server mode. Platform keys are blanked (no Meta / YouTube calls).
// Run: npm run test:e2e:server (builds the server first). Prototype-mode tests: npm run test:e2e.
const API_PORT = 3101
const APP_PORT = 5196
const NO_PLATFORMS = { META_ACCESS_TOKEN: '', META_IG_USER_ID: '', YOUTUBE_API_KEY: '', FACEBOOK_API_KEY: '' }

export default defineConfig({
  testDir: './e2e-server',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  workers: 1, // one server, one database: tests share it and run in order
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${APP_PORT}`,
    channel: process.env.E2E_CHANNEL ?? 'msedge',
    timezoneId: 'Asia/Kolkata',
    viewport: { width: 1440, height: 1000 },
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'node --env-file-if-exists=.env.local e2e-server/start-server.mjs',
      url: `http://localhost:${API_PORT}/health`,
      reuseExistingServer: false,
      env: { ...NO_PLATFORMS, PORT: String(API_PORT), ADMIN_EMAIL: E2E_ADMIN.email, ADMIN_PASSWORD: E2E_ADMIN.password, ADMIN_NAME: E2E_ADMIN.name },
    },
    {
      command: `npx vite --port ${APP_PORT} --strictPort`,
      url: `http://localhost:${APP_PORT}`,
      reuseExistingServer: false,
      env: { VITE_API_SERVER: 'true', VITE_API_URL: '', PORT: String(API_PORT) },
    },
  ],
})
