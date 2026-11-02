import { test as base, expect, type Page } from '@playwright/test'

/** Fixture team members (src/mocks/fixtures.json). */
export const USERS = {
  admin: 'usr_01', // Ananya Iyer
  manager: 'usr_02', // Rahul Menon
  exec1: 'usr_03', // Sneha Patil
  exec2: 'usr_04', // Arjun Rao
} as const

/** Signs the mock API in as a team member for every page load (the dev "View as" setting). */
export async function signInAs(page: Page, user: keyof typeof USERS) {
  await page.addInitScript((id) => localStorage.setItem('influencehub-mock-user', id), USERS[user])
}

/** Switches user in the running app through the "View as" menu (keeps the in-memory mock data). */
export async function viewAs(page: Page, name: string) {
  await page.getByRole('button', { name: 'Account menu' }).click()
  await page.getByRole('menuitemradio', { name: new RegExp(name) }).click()
  await expect(toast(page, `Viewing as ${name}`)).toBeVisible()
}

export const toast = (page: Page, text: string | RegExp) => page.locator('[data-sonner-toast]', { hasText: text }).first()

/** Calls the API from the page, so it goes through the mock with the page's identity and data. */
export async function api<T = unknown>(page: Page, path: string, init?: { method?: string; body?: unknown }) {
  // Right after a navigation the mock service worker may not be in control yet (the dev server would answer).
  // The app renders only once the mock API has started, so wait for that too.
  await page.waitForFunction(() => navigator.serviceWorker?.controller != null && (document.getElementById('root')?.childElementCount ?? 0) > 0)
  return page.evaluate(
    async ([p, i]) => {
      const res = await fetch(`/api/v1${p}`, {
        method: i?.method ?? 'GET',
        headers: i?.body === undefined ? undefined : { 'Content-Type': 'application/json' },
        body: i?.body === undefined ? undefined : JSON.stringify(i.body),
      })
      const text = await res.text()
      return { status: res.status, body: (text ? JSON.parse(text) : null) as unknown }
    },
    [path, init] as const,
  ) as Promise<{ status: number; body: T }>
}

/** Every test fails on a console error or uncaught exception. 4xx responses the UI handles are expected. */
export const test = base.extend<{ consoleErrors: string[] }>({
  consoleErrors: [
    async ({ page }, use) => {
      const errors: string[] = []
      page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
      page.on('console', (m) => {
        if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) errors.push(m.text())
      })
      await use(errors)
      expect(errors).toEqual([])
    },
    { auto: true },
  ],
})

export { expect }
