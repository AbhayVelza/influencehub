import { api, expect, signInAs, test, toast, USERS, viewAs } from './fixtures.ts'
import type { BulkResult, Influencer } from '../src/types/index.ts'

test('executive claims from the pool, a teammate can’t claim it too, then releases it with a reason', async ({ page }) => {
  await signInAs(page, 'exec1')
  await page.goto('/pool')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Unassigned Pool')

  // Preview only: no contact details before claiming.
  await page.locator('tbody tr').filter({ hasText: 'Arjun Pillai' }).getByRole('button', { name: 'Arjun Pillai', exact: true }).click()
  const preview = page.getByRole('dialog', { name: 'Unassigned influencer' })
  await expect(preview).toContainText('@arjunplays')
  await expect(preview).not.toContainText('+91')
  await preview.getByRole('button', { name: 'Claim', exact: true }).click()
  await expect(toast(page, 'Arjun Pillai is yours')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.locator('tbody tr').filter({ hasText: 'Arjun Pillai' })).toHaveCount(0)

  // Atomic claim: a teammate gets 409 already_claimed.
  await page.evaluate((id) => localStorage.setItem('influencehub-mock-user', id), USERS.exec2)
  const second = await api<{ error: { code: string } }>(page, '/influencers/inf_010/claim', { method: 'POST' })
  await page.evaluate((id) => localStorage.setItem('influencehub-mock-user', id), USERS.exec1)
  expect(second.status).toBe(409)
  expect(second.body.error.code).toBe('already_claimed')

  // Now hers: full profile, then release it back with a reason.
  await page.getByRole('navigation').getByRole('link', { name: /^Influencers/ }).click()
  await page.getByRole('link', { name: 'Arjun Pillai' }).click()
  await expect(page.getByText(/Owner:\s*You/)).toBeVisible()
  await page.getByRole('button', { name: 'More actions' }).click()
  await page.getByRole('menuitem', { name: 'Release to pool…' }).click()
  const release = page.getByRole('dialog', { name: 'Release Arjun Pillai to the pool?' })
  const reason = release.getByLabel(/Reason/)
  await release.getByRole('button', { name: 'Release to pool' }).click()
  await expect(reason).toHaveAttribute('aria-invalid', 'true')
  await reason.fill('Not my category')
  await release.getByRole('button', { name: 'Release to pool' }).click()
  await expect(toast(page, 'Arjun Pillai released to the pool')).toBeVisible()
  await expect(page).toHaveURL(/\/pool$/)
  await expect(page.locator('tbody tr').filter({ hasText: 'Arjun Pillai' })).toHaveCount(1)
  expect((await api(page, '/influencers/inf_010')).status).toBe(404)
})

const total = async (page: Parameters<typeof api>[0], path: string) =>
  (await api<{ total: number }>(page, `${path}${path.includes('?') ? '&' : '?'}page_size=1`)).body.total

test('manager bulk assigns from the pool, shared out between two executives', async ({ page }) => {
  await signInAs(page, 'manager')
  await page.goto('/pool')
  const before = {
    pool: await total(page, '/pool'),
    sneha: await total(page, `/influencers?assigned_to=${USERS.exec1}`),
    arjun: await total(page, `/influencers?assigned_to=${USERS.exec2}`),
  }

  const rows = page.locator('tbody tr')
  for (const i of [0, 1, 2]) await rows.nth(i).getByRole('checkbox').click()
  await page.getByRole('button', { name: 'Assign 3…' }).click()

  // Choose: at least one person, and each one's share is shown.
  const dialog = page.getByRole('dialog', { name: 'Assign 3 influencers' })
  await expect(dialog.getByRole('button', { name: 'Continue' })).toBeDisabled()
  const sneha = dialog.locator('label', { hasText: 'Sneha Patil' })
  await sneha.getByRole('checkbox').click()
  await expect(sneha).toContainText('3 influencers')
  await dialog.getByRole('checkbox', { name: /Arjun Rao/ }).click()
  await expect(sneha).toContainText('2 influencers')

  // Confirm with the counts.
  await dialog.getByRole('button', { name: 'Continue' }).click()
  await expect(dialog).toHaveAccessibleName('Assign 3 influencers to Sneha Patil and Arjun Rao?')
  const split = dialog.getByRole('list', { name: 'How they’re shared out' })
  await expect(split.getByRole('listitem')).toHaveText([/Sneha Patil\s*2 influencers/, /Arjun Rao\s*1 influencer$/])
  await dialog.getByRole('button', { name: 'Assign 3' }).click()

  await expect(toast(page, '3 influencers assigned to Sneha Patil and Arjun Rao')).toContainText('Sneha Patil: 2 · Arjun Rao: 1')
  await expect(dialog).toBeHidden()
  await expect(page.getByText(/\d+ selected/)).toHaveCount(0)
  expect(await total(page, '/pool')).toBe(before.pool - 3)
  expect(await total(page, `/influencers?assigned_to=${USERS.exec1}`)).toBe(before.sneha + 2)
  expect(await total(page, `/influencers?assigned_to=${USERS.exec2}`)).toBe(before.arjun + 1)
})

test('bulk assign skips rows a teammate claimed meanwhile; only managers and admins can bulk assign', async ({ page }) => {
  // Executives get bulk Claim, not Assign, and the API refuses them.
  await signInAs(page, 'exec1')
  await page.goto('/pool')
  await page.locator('tbody tr').first().getByRole('checkbox').click()
  await expect(page.getByRole('button', { name: 'Claim 1' })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Assign/ })).toHaveCount(0)
  const denied = await api(page, '/influencers/bulk', { method: 'POST', body: { ids: ['inf_010'], action: 'pool_assign', value: USERS.exec1 } })
  expect(denied.status).toBe(403)

  await viewAs(page, 'Rahul Menon')
  // Only influencers still in the pool, and only to an active team member.
  const owned = await api<BulkResult>(page, '/influencers/bulk', { method: 'POST', body: { ids: ['inf_001'], action: 'pool_assign', value: USERS.exec1 } })
  expect(owned.body).toMatchObject({ succeeded: [], failed: [{ id: 'inf_001', code: 'not_in_pool' }] })
  expect((await api<Influencer>(page, '/influencers/inf_001')).body.assigned_to).toBe(USERS.exec2)
  const unknown = await api(page, '/influencers/bulk', { method: 'POST', body: { ids: ['inf_010'], action: 'pool_assign', value: 'usr_nope' } })
  expect(unknown.status).toBe(422)

  const rows = page.locator('tbody tr')
  await rows.filter({ hasText: 'Arjun Pillai' }).getByRole('checkbox').click()
  await rows.filter({ hasNotText: 'Arjun Pillai' }).first().getByRole('checkbox').click()
  await page.getByRole('button', { name: 'Assign 2…' }).click()
  const dialog = page.getByRole('dialog', { name: 'Assign 2 influencers' })
  await dialog.getByRole('checkbox', { name: /Sneha Patil/ }).click()
  await dialog.getByRole('button', { name: 'Continue' }).click()

  // A teammate claims one before the manager confirms.
  await page.evaluate((id) => localStorage.setItem('influencehub-mock-user', id), USERS.exec2)
  const claimed = await api(page, '/influencers/inf_010/claim', { method: 'POST' })
  await page.evaluate((id) => localStorage.setItem('influencehub-mock-user', id), USERS.manager)
  expect(claimed.status).toBe(200)

  await dialog.getByRole('button', { name: 'Assign 2' }).click()
  await expect(toast(page, '1 assigned, 1 not')).toContainText('Arjun Pillai: No longer in the pool')
  // The claimed row has left the pool, so it isn't kept selected.
  await expect(page.getByText(/\d+ selected/)).toHaveCount(0)
  expect((await api<Influencer>(page, '/influencers/inf_010')).body.assigned_to).toBe(USERS.exec2)
})
