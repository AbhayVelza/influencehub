import type { Influencer, Paginated } from '../src/types/index.ts'
import { api, expect, signInAs, test, USERS, viewAs } from './fixtures.ts'

type Role = 'admin' | 'manager' | 'exec1'

/** What each role sees and may do (CLAUDE.md "Permissions"). */
const MATRIX: Record<Role, {
  nav: { settings: boolean; duplicates: boolean }
  importExport: boolean
  bulk: { assign: boolean; export: boolean; delete: boolean }
  detail: { override: boolean; changeOwner: boolean; delete: boolean }
  api: { settings: number; duplicates: number; export: number; othersInfluencer: number; bulkDelete: number }
}> = {
  admin: {
    nav: { settings: true, duplicates: true },
    importExport: true,
    bulk: { assign: true, export: true, delete: true },
    detail: { override: true, changeOwner: true, delete: true },
    api: { settings: 200, duplicates: 200, export: 202, othersInfluencer: 200, bulkDelete: 200 },
  },
  manager: {
    nav: { settings: false, duplicates: true },
    importExport: true,
    bulk: { assign: true, export: true, delete: true },
    detail: { override: false, changeOwner: true, delete: true },
    api: { settings: 403, duplicates: 200, export: 202, othersInfluencer: 200, bulkDelete: 200 },
  },
  exec1: {
    nav: { settings: false, duplicates: false },
    importExport: false,
    bulk: { assign: false, export: false, delete: false },
    detail: { override: false, changeOwner: false, delete: false },
    api: { settings: 403, duplicates: 403, export: 403, othersInfluencer: 404, bulkDelete: 403 },
  },
}

for (const [role, can] of Object.entries(MATRIX) as [Role, (typeof MATRIX)[Role]][]) {
  test(`permissions matrix: ${role}`, async ({ page }) => {
    await signInAs(page, role)
    await page.goto('/influencers')
    const nav = page.getByRole('navigation')
    await expect(nav.getByRole('link', { name: /^Dashboard/ })).toBeVisible()
    await expect(nav.getByRole('link', { name: /^Settings/ })).toHaveCount(can.nav.settings ? 1 : 0)
    await expect(nav.getByRole('link', { name: /^Possible duplicates/ })).toHaveCount(can.nav.duplicates ? 1 : 0)
    await expect(page.getByRole('button', { name: 'Import CSV' })).toHaveCount(can.importExport ? 1 : 0)

    // Bulk bar
    await page.locator('tbody tr').first().getByRole('checkbox').click()
    const bar = page.getByText('1 selected').locator('..')
    await expect(bar.getByRole('button', { name: 'Change stage' })).toBeVisible()
    await expect(bar.getByRole('button', { name: 'Assign' })).toHaveCount(can.bulk.assign ? 1 : 0)
    await expect(bar.getByRole('button', { name: 'Export' })).toHaveCount(can.bulk.export ? 1 : 0)
    await expect(bar.getByRole('button', { name: 'Delete' })).toHaveCount(can.bulk.delete ? 1 : 0)

    // Detail page (inf_006 belongs to Sneha, so every role can open it)
    await page.goto('/influencers/inf_006')
    await page.getByRole('button', { name: /^Stage: Onboarded/ }).click()
    await expect(page.getByRole('menuitem', { name: /Package Sent/ })).toBeVisible()
    await expect(page.getByText('Override (admin)')).toHaveCount(can.detail.override ? 1 : 0)
    await page.keyboard.press('Escape')
    await expect(page.getByRole('button', { name: /Change owner/ })).toHaveCount(can.detail.changeOwner ? 1 : 0)
    await page.getByRole('button', { name: 'More actions' }).click()
    await expect(page.getByRole('menuitem', { name: 'Release to pool…' })).toBeVisible()
    await expect(page.getByRole('menuitem', { name: 'Delete influencer' })).toHaveCount(can.detail.delete ? 1 : 0)
    await page.keyboard.press('Escape')

    // The API enforces the same rules (executives get 404 for what they don't own).
    expect((await api(page, '/settings/instagram')).status).toBe(can.api.settings)
    expect((await api(page, '/duplicates')).status).toBe(can.api.duplicates)
    expect((await api(page, '/exports/influencers', { method: 'POST', body: {} })).status).toBe(can.api.export)
    expect((await api(page, '/influencers/inf_001')).status).toBe(can.api.othersInfluencer)
    const bulkDelete = await api(page, '/influencers/bulk', { method: 'POST', body: { ids: ['inf_026'], action: 'delete' } })
    expect(bulkDelete.status).toBe(can.api.bulkDelete)
    if (role === 'exec1') {
      const mine = await api<Paginated<Influencer>>(page, '/influencers?page_size=100')
      expect(mine.body.items.every((i) => i.assigned_to === USERS.exec1)).toBe(true)
    }
  })
}

test('switching user drops the cached data: nothing of the previous user’s shows', async ({ page }) => {
  await signInAs(page, 'admin')
  await page.goto('/influencers/inf_001') // Arjun's influencer
  await expect(page.getByRole('heading', { level: 1, name: 'Riya Shah' })).toBeVisible()

  await viewAs(page, 'Sneha Patil')
  await expect(page.getByText('Influencer not found')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Riya Shah' })).toHaveCount(0)

  await page.getByRole('navigation').getByRole('link', { name: /^Influencers/ }).click()
  const mine = await api<Paginated<Influencer>>(page, '/influencers?page_size=100')
  await expect(page.getByRole('heading', { level: 1 })).toContainText(`(${mine.body.total})`)
  await expect(page.locator('tbody tr').filter({ hasText: 'Riya Shah' })).toHaveCount(0)

  await viewAs(page, 'Ananya Iyer')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('(54)')
})
