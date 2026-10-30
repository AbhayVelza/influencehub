import { api, expect, signInAs, test, toast, USERS } from './fixtures.ts'

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
