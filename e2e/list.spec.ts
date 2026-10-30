import type { Page } from '@playwright/test'
import type { Influencer, Paginated, Platform } from '../src/types/index.ts'
import { api, expect, signInAs, test, toast } from './fixtures.ts'

const rows = (page: Page) => page.locator('tbody tr')

/** Picks one option of a filter-bar filter (scoped: the table has sort buttons with the same names). */
async function pick(page: Page, filter: string, option: string, absent?: RegExp) {
  const trigger = page.getByRole('group', { name: 'Filters' }).getByRole('button', { name: new RegExp(`^${filter}`) })
  await trigger.click()
  await expect(page.getByRole('option', { name: new RegExp(`^${option}`) })).toBeVisible()
  if (absent) await expect(page.getByRole('option', { name: absent })).toHaveCount(0)
  await page.getByRole('option', { name: new RegExp(`^${option}`) }).click()
  await page.keyboard.press('Escape')
  // Escape hands focus back to the trigger; opening the next popover before that would get it closed again.
  await expect(trigger).toBeFocused()
}

test('cascading Country → State → City filters live in the URL and restore from it', async ({ page }) => {
  await signInAs(page, 'admin')
  await page.goto('/influencers')
  await pick(page, 'Country', 'India')
  await pick(page, 'State', 'Maharashtra', /Texas|England|Ontario|Dubai/)
  await pick(page, 'City', 'Pune', /Kochi|Bengaluru|Toronto/)
  const city = page.getByRole('group', { name: 'Filters' }).getByRole('button', { name: /^City/ })
  await city.click()
  await expect(page.getByRole('option')).toHaveCount(3) // Mumbai, Nagpur, Pune
  await page.keyboard.press('Escape')

  await expect(page).toHaveURL(/\/influencers\?country=India&state=Maharashtra&city=Pune$/)
  await expect(rows(page)).toHaveCount(3)
  await expect(rows(page).filter({ hasText: 'Pune' })).toHaveCount(3)

  // A fresh load of the URL restores the same filters, chips and rows.
  await page.goto('/influencers?country=India&state=Maharashtra&city=Pune')
  for (const chip of ['India', 'Maharashtra', 'Pune']) {
    await expect(page.getByRole('button', { name: `Remove filter ${chip}` })).toBeVisible()
  }
  await expect(rows(page)).toHaveCount(3)
  await page.getByRole('button', { name: 'Remove filter Pune' }).click()
  await expect(page).toHaveURL(/\/influencers\?country=India&state=Maharashtra$/)
})

const AUDIENCE_KEY: Record<Platform, string> = {
  instagram: 'followers',
  youtube: 'subscribers',
  tiktok: 'followers',
  facebook: 'page_followers',
  threads: 'followers',
  pinterest: 'followers',
  linkedin: 'followers',
  snapchat: 'subscribers',
}

test('sort by primary followers: descending first, nulls last, matching the API', async ({ page }) => {
  await signInAs(page, 'admin')
  await page.goto('/influencers?page_size=100')
  await page.getByRole('button', { name: 'Primary followers' }).click()
  await expect(page).toHaveURL(/sort=-primary_followers/)
  await expect(page.getByRole('columnheader', { name: 'Primary followers' })).toHaveAttribute('aria-sort', 'descending')

  const list = await api<Paginated<Influencer>>(page, '/influencers?sort=-primary_followers&page_size=100')
  const audiences = list.body.items.map((inf) => {
    const primary = inf.accounts.find((a) => a.is_primary) ?? inf.accounts[0]
    const value = primary ? (primary.metrics as Record<string, unknown>)[AUDIENCE_KEY[primary.platform]] : null
    return typeof value === 'number' ? value : null
  })
  const known = audiences.filter((n): n is number => n !== null)
  expect(known.length).toBeGreaterThan(10)
  expect(known).toEqual([...known].sort((a, b) => b - a))
  expect(audiences.slice(known.length).every((n) => n === null)).toBe(true)
  await expect(rows(page).first()).toContainText(list.body.items[0]!.name)
})

test('bulk change stage: server and client skips are reported per row and stay selected', async ({ page }) => {
  await signInAs(page, 'admin')
  await page.goto('/influencers?stage=data_gathered&stage=on_hold')
  await expect(rows(page)).toHaveCount(20) // 16 data gathered + 4 on hold
  await page.getByRole('checkbox', { name: 'Select all on this page' }).click()
  await expect(page.getByText('20 selected')).toBeVisible()

  // Contacted needs an interested call: the server refuses every eligible row; on-hold rows are skipped here.
  await page.getByRole('button', { name: 'Change stage' }).click()
  await page.getByRole('menuitem', { name: /Contacted\s*16 of 20/ }).click()
  const refused = toast(page, 'No influencers moved to Contacted')
  await expect(refused).toContainText('Interested')
  await expect(refused).toContainText('can’t move from On Hold to Contacted')
  await expect(page.getByText('20 selected')).toBeVisible()

  await page.getByRole('button', { name: 'Change stage' }).click()
  await page.getByRole('menuitem', { name: /On Hold\s*16 of 20/ }).click()
  const partial = toast(page, '16 moved, 4 skipped')
  await expect(partial).toContainText('can’t move from On Hold to On Hold')
  await expect(page.getByText('4 selected')).toBeVisible()
  const onHold = await api<Paginated<Influencer>>(page, '/influencers?stage=on_hold&page_size=100')
  expect(onHold.body.total).toBe(20)
})
