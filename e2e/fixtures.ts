import { test as base, expect, type Page } from '@playwright/test'

// Prototype mode: each test's browser context starts an empty workspace with one admin (OWNER_ID). Data is set up
// through window.__ihApi (src/main.tsx, dev only): the same in-browser API the app calls, as the acting member.

export const OWNER_ID = 'usr_owner'
const ACTING_KEY = 'influencehub-acting-as'

export type Role = 'admin' | 'manager' | 'executive' | 'brand_specialist'

export interface Seed {
  ids: Record<Role, string>
  /** Instagram handles: mine (the executive's), other (the manager's), pool (unassigned), rejected (the executive's). */
  influencers: Record<'mine' | 'other' | 'pool' | 'rejected', string>
}

export async function api<T = any>(page: Page, method: string, path: string, body?: unknown): Promise<{ status: number; body: T }> {
  await page.waitForFunction(() => typeof (window as any).__ihApi === 'function')
  return page.evaluate(([m, p, b]) => (window as any).__ihApi(m, p, b), [method, path, body] as const)
}

async function ok<T = any>(page: Page, method: string, path: string, body?: unknown): Promise<T> {
  const res = await api<T>(page, method, path, body)
  if (res.status >= 300) throw new Error(`${method} ${path}: ${res.status} ${JSON.stringify(res.body)}`)
  return res.body
}

/** Acts as `id` from the next page load on (the "Acting as" menu remembers it the same way). */
export async function actAs(page: Page, id: string) {
  await page.evaluate(([key, v]) => localStorage.setItem(key, v), [ACTING_KEY, id] as const)
}

/** One member per role, and influencers owned by the executive, the manager, nobody, plus a rejected one. */
export async function seed(page: Page): Promise<Seed> {
  await page.goto('/')
  const me = await ok<{ id: string }>(page, 'GET', '/me')
  const member = async (role: Role) =>
    (await ok<{ id: string }>(page, 'POST', '/team', { name: `E2E ${role}`, email: `${role}@e2e.test`, role })).id
  const ids: Record<Role, string> = {
    admin: me.id,
    manager: await member('manager'),
    executive: await member('executive'),
    brand_specialist: await member('brand_specialist'),
  }
  const categories = await ok<{ items: { name: string }[] }>(page, 'GET', '/categories')
  const category = categories.items[0]!.name
  const add = async (handle: string, owner: string | null) =>
    (
      await ok<{ id: string }>(page, 'POST', '/influencers', {
        name: `Creator ${handle}`,
        category,
        assigned_to: owner,
        accounts: [{ platform: 'instagram', handle }],
      })
    ).id
  await add('e2e_mine', ids.executive)
  await add('e2e_other', ids.manager)
  await add('e2e_pool', null)
  const rejected = await add('e2e_rejected', ids.executive)
  await ok(page, 'POST', `/influencers/${rejected}/calls`, { outcome: 'not_interested' })
  return { ids, influencers: { mine: 'e2e_mine', other: 'e2e_other', pool: 'e2e_pool', rejected: 'e2e_rejected' } }
}

export const sidebar = (page: Page) => page.getByRole('navigation').first()

/** Every test fails on a console error or uncaught exception. */
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
