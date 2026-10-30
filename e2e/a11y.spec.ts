import AxeBuilder from '@axe-core/playwright'
import { expect, signInAs, test } from './fixtures.ts'

const PAGES = [
  ['Dashboard', '/'],
  ['Influencers', '/influencers'],
  ['Influencer detail', '/influencers/inf_001'],
  ['Unassigned Pool', '/pool'],
  ['Possible duplicates', '/duplicates'],
  ['Pipeline', '/pipeline'],
  ['Calls & Follow-ups', '/calls'],
  ['Packages', '/packages'],
  ['Settings', '/settings'],
] as const

test('accessibility smoke: no serious or critical axe violations on the main pages', async ({ page }) => {
  test.setTimeout(PAGES.length * 20_000)
  await signInAs(page, 'admin')
  for (const [name, path] of PAGES) {
    await test.step(name, async () => {
      await page.goto(path)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      await expect(page.locator('[data-slot="skeleton"]')).toHaveCount(0)
      const { violations } = await new AxeBuilder({ page }).analyze()
      const serious = violations
        .filter((v) => v.impact === 'serious' || v.impact === 'critical')
        .map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`)
      expect.soft(serious, `${name} (${path})`).toEqual([])
    })
  }
})
