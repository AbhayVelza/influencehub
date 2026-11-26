import { expect, request, test, type APIRequestContext, type Page } from '@playwright/test'
import { ACCOUNTS, type Role } from './accounts'

// Sign-in on, per role, against the real API server and PostgreSQL (playwright.server.config.ts). The admin from
// ADMIN_EMAIL adds the other three; the executive takes a creator from Data gathered to a Welcome Kit through the API
// (call, documents uploaded as real files, stage moves), and each role then checks what it sees in the app.

const API = '/api/v1'
const NAV: Record<Role, string[]> = {
  admin: ['Dashboard', 'Influencers', 'Unassigned Pool', 'Possible duplicates', 'Pipeline', 'Calls & Follow-ups', 'Welcome Kits', 'Documents', 'Rejected', 'Settings'],
  manager: ['Dashboard', 'Influencers', 'Unassigned Pool', 'Possible duplicates', 'Pipeline', 'Calls & Follow-ups', 'Welcome Kits', 'Documents', 'Rejected'],
  executive: ['Dashboard', 'Influencers', 'Pipeline', 'Calls & Follow-ups', 'Welcome Kits', 'Documents', 'Rejected'],
  brand_specialist: ['Dashboard', 'Influencers', 'Onboarded'],
}
const ALL_LINKS = [...new Set(Object.values(NAV).flat())].filter((l) => l !== 'Onboarded')
const CREATOR = 'Creator e2e_onboard'
const PDF = Buffer.from('%PDF-1.4\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF\n')

test.describe.configure({ mode: 'serial' })

const api: Partial<Record<Role, APIRequestContext>> = {}

/** An API session signed in as `role` (its own cookie jar). */
async function session(baseURL: string, role: Role) {
  const ctx = await request.newContext({ baseURL })
  const res = await ctx.post(`${API}/auth/sign-in`, { data: { email: ACCOUNTS[role].email, password: ACCOUNTS[role].password } })
  expect(res.status(), `sign in as ${role}`).toBe(200)
  return ctx
}

async function ok(ctx: APIRequestContext, method: 'get' | 'post', path: string, data?: unknown) {
  const res = await ctx[method](`${API}${path}`, { data })
  expect(res.status(), `${method.toUpperCase()} ${path}: ${await res.text()}`).toBeLessThan(300)
  return res.status() === 204 ? null : res.json()
}

async function signIn(page: Page, role: Role) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(ACCOUNTS[role].email)
  await page.getByLabel('Password').fill(ACCOUNTS[role].password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('link', { name: 'Dashboard' })).toBeVisible()
}

test.beforeAll(async ({ baseURL }) => {
  api.admin = await session(baseURL!, 'admin')
  for (const role of ['manager', 'executive', 'brand_specialist'] as const) {
    const { name, email, password } = ACCOUNTS[role]
    await ok(api.admin, 'post', '/team', { name, email, role, password })
    api[role] = await session(baseURL!, role)
  }
})

test.afterAll(async () => {
  for (const ctx of Object.values(api)) await ctx?.dispose()
})

test('signed out: pages go to sign-in, and a wrong password is refused', async ({ page, baseURL }) => {
  await page.goto('/influencers')
  await expect(page).toHaveURL(/\/login\?next=%2Finfluencers/)
  await page.getByLabel('Email').fill(ACCOUNTS.executive.email)
  await page.getByLabel('Password').fill('not-the-password')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Dashboard' })).toHaveCount(0)
  const anon = await request.newContext({ baseURL })
  expect((await anon.get(`${API}/me`)).status()).toBe(401)
  await anon.dispose()
})

for (const role of Object.keys(NAV) as Role[]) {
  test(`${role}: signs in, sees exactly this role's pages, signs out`, async ({ page }) => {
    await signIn(page, role)
    const nav = page.getByRole('navigation').first()
    for (const label of NAV[role]) await expect(nav.getByRole('link', { name: new RegExp(`^${label}`) }).first()).toBeVisible()
    for (const label of ALL_LINKS.filter((l) => !NAV[role].includes(l))) {
      await expect(nav.getByRole('link', { name: new RegExp(`^${label}`) })).toHaveCount(0)
    }
    await page.getByRole('button', { name: 'Account menu' }).click()
    await page.getByRole('menuitem', { name: 'Sign out' }).click()
    await expect(page).toHaveURL(/\/login/)
    await page.goto('/')
    await expect(page).toHaveURL(/\/login/)
  })
}

test('executive: onboards a creator (call, documents, stages), sends a Welcome Kit and syncs', async ({ page }) => {
  const exec = api.executive!
  const categories = await ok(exec, 'get', '/categories')
  const inf = await ok(exec, 'post', '/influencers', {
    name: CREATOR,
    category: categories.items[0].name,
    accounts: [{ platform: 'instagram', handle: 'e2e_onboard' }],
  })
  expect(inf.assigned_to).not.toBeNull()
  await ok(exec, 'post', `/influencers/${inf.id}/calls`, { outcome: 'interested' })
  await ok(exec, 'post', `/influencers/${inf.id}/stage`, { to: 'contacted' })
  for (const doc of [
    { type: 'agreement', signed_on: '2026-11-20' },
    { type: 'insights_summary', period_start: '2026-10-01', period_end: '2026-10-31' },
  ]) {
    const presign = await ok(exec, 'post', '/documents/presign', {
      influencer_id: inf.id,
      type: doc.type,
      file_name: `${doc.type}.pdf`,
      content_type: 'application/pdf',
      size: PDF.length,
    })
    const put = await exec.put(new URL(presign.upload_url, 'http://localhost').pathname, { data: PDF, headers: { 'Content-Type': 'application/pdf' } })
    expect(put.status(), 'file upload').toBeLessThan(300)
    await ok(exec, 'post', `/influencers/${inf.id}/documents`, { key: presign.key, title: doc.type, ...doc })
  }
  await ok(exec, 'post', `/influencers/${inf.id}/stage`, { to: 'onboarded' })
  await ok(exec, 'post', '/packages', {
    influencer_id: inf.id,
    items: [{ name: 'Welcome hamper', qty: 1 }],
    address: { line1: '1 MG Road', line2: null, city: 'Pune', state: 'Maharashtra', postal_code: '411001', country: 'India' },
  })
  // Sync now on an own account starts a job (no platform keys here, so the job fails and keeps the old data).
  expect((await exec.post(`${API}/accounts/${inf.accounts[0].id}/sync`)).status()).toBe(202)

  await signIn(page, 'executive')
  const nav = page.getByRole('navigation').first()
  await nav.getByRole('link', { name: /^Welcome Kits/ }).click()
  await expect(page.getByText(CREATOR).first()).toBeVisible()
  await nav.getByRole('link', { name: /^Documents/ }).click()
  await expect(page.getByText(CREATOR).first()).toBeVisible()
})

test('brand specialist: sees the onboarded creator; no pool, no team', async ({ page }) => {
  const brand = api.brand_specialist!
  expect((await brand.get(`${API}/pool`)).status()).toBe(403)
  expect((await brand.post(`${API}/team`, { data: { name: 'x', email: 'x@e2e.test', role: 'admin', password: 'e2e-x-pass-12' } })).status()).toBe(403)
  await signIn(page, 'brand_specialist')
  await page.getByRole('navigation').first().getByRole('link', { name: /^Onboarded/ }).click()
  await page.goto('/onboarded/instagram') // the Onboarded page shows platform tiles; the list is per platform
  await expect(page.getByText(CREATOR).first()).toBeVisible()
})

test('manager: sees the executive’s creator and the pool; the executive cannot open the pool', async ({ page }) => {
  expect((await api.manager!.get(`${API}/pool`)).status()).toBe(200)
  expect((await api.executive!.get(`${API}/pool`)).status()).toBe(403)
  await signIn(page, 'manager')
  await page.goto('/influencers')
  await expect(page.getByText(CREATOR).first()).toBeVisible()
})

test('admin: Team & roles lists all four members; executives cannot add members', async ({ page }) => {
  const res = await api.executive!.post(`${API}/team`, { data: { name: 'x', email: 'x@e2e.test', role: 'admin', password: 'e2e-x-pass-12' } })
  expect(res.status()).toBe(403)
  await signIn(page, 'admin')
  await page.goto('/settings')
  await page.getByRole('tab', { name: 'Team & roles' }).click()
  for (const role of Object.keys(ACCOUNTS) as Role[]) {
    await expect(page.getByText(ACCOUNTS[role].name).first()).toBeVisible()
  }
})
