import type { Influencer } from '../src/types/index.ts'
import { api, expect, signInAs, test } from './fixtures.ts'

test('Facebook Page stats have their own labels, and the platform filter includes Facebook', async ({ page }) => {
  await signInAs(page, 'admin')
  await page.goto('/influencers/inf_010')
  await page.getByRole('tab', { name: /Facebook/ }).click()
  const panel = page.getByRole('tabpanel')
  for (const label of ['Page followers', 'Page likes', 'Page category']) await expect(panel.getByText(label, { exact: true })).toBeVisible()
  await expect(panel.getByText('Public lookup')).toBeVisible()

  await page.goto('/influencers')
  await page.getByRole('button', { name: /^Platform/ }).click()
  await page.getByRole('option', { name: /Facebook/ }).click()
  await page.keyboard.press('Escape')
  await expect(page).toHaveURL(/platform=facebook/)
  const list = await api<{ items: Influencer[]; total: number }>(page, '/influencers?platform=facebook&page_size=100')
  expect(list.body.total).toBeGreaterThan(0)
  expect(list.body.items.every((i) => i.accounts.some((a) => a.platform === 'facebook'))).toBe(true)
  await expect(page.getByRole('columnheader', { name: /Total reach/ })).toBeVisible()
})

test('connect link: copy it, and the status shows the link was sent', async ({ page }) => {
  await signInAs(page, 'admin')
  await page.goto('/influencers/inf_017') // TikTok not connected yet
  await page.getByRole('tab', { name: /TikTok/ }).click()
  const panel = page.getByRole('tabpanel')
  await expect(panel.getByText('Not connected')).toBeVisible()
  await panel.getByRole('button', { name: 'Send connect link' }).click()
  const sent = page.waitForResponse((r) => /\/accounts\/[^/]+\/connect-link$/.test(r.url()))
  await page.getByRole('menuitem', { name: 'Copy link' }).click()
  const body = (await (await sent).json()) as { url: string; expires_at: string }
  expect(body.url).toMatch(/^https:\/\//)
  await expect(page.getByText('Connect link copied')).toBeVisible()
  await expect(panel.getByText(/Link sent · expires in 7 days/)).toBeVisible()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(body.url)
})

test('an expired connect link reads as expired and can be resent', async ({ page }) => {
  await signInAs(page, 'admin')
  await page.goto('/influencers/inf_012')
  await page.getByRole('tab', { name: /TikTok/ }).click()
  const panel = page.getByRole('tabpanel')
  await expect(panel.getByText('Link expired', { exact: true })).toBeVisible()
  await expect(panel.getByRole('button', { name: 'Resend connect link' })).toBeVisible()
})
