import type { Page } from '@playwright/test'
import type { FilterOption, Influencer, Paginated, Platform } from '../src/types/index.ts'
import { api, expect, openFilters, signInAs, test, toast } from './fixtures.ts'

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
  // The filters start collapsed behind a "Filters" button; its badge counts the active ones.
  await expect(page.getByRole('group', { name: 'Filters' })).toHaveCount(0)
  await openFilters(page)
  await pick(page, 'Country', 'India')
  await pick(page, 'State', 'Maharashtra', /Texas|England|Ontario|Dubai/)
  await pick(page, 'City', 'Pune', /Kochi|Bengaluru|Toronto/)
  const city = page.getByRole('group', { name: 'Filters' }).getByRole('button', { name: /^City/ })
  await city.click()
  await expect(page.getByRole('option')).toHaveCount(3) // Mumbai, Nagpur, Pune
  await page.keyboard.press('Escape')

  await expect(page).toHaveURL(/\/influencers\?country=India&state=Maharashtra&city=Pune$/)
  await expect(page.getByRole('button', { name: /^Filters/ })).toContainText('3')
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

// ---------------------------------------------------------------------------
// Dynamic filter refinement: counts follow every other active filter (logical AND across filters).

type Options = Record<'categories' | 'countries' | 'states' | 'cities' | 'stages' | 'assigned_to' | 'platforms' | 'agreement' | 'insights', FilterOption[]>

const optionsFor = async (page: Page, query: string) => (await api<Options>(page, `/influencers/filter-options?${query}`)).body
const totalFor = async (page: Page, query: string) => (await api<Paginated<Influencer>>(page, `/influencers?page_size=1&${query}`)).body.total

test('filter-options counts equal the list total you would get by ticking that option', async ({ page }) => {
  await signInAs(page, 'admin')
  await page.goto('/influencers')
  // Each facet's counts apply every other filter, but not its own: ticking one more value widens that facet.
  const scenarios: { active: string; facet: keyof Options; param: string }[] = [
    { active: 'stage=data_gathered', facet: 'categories', param: 'category' },
    { active: 'stage=data_gathered', facet: 'countries', param: 'country' },
    { active: 'stage=data_gathered&category=Fashion', facet: 'stages', param: 'stage' },
    { active: 'country=India&platform=instagram', facet: 'states', param: 'state' },
    { active: 'country=India&state=Maharashtra&q=a', facet: 'cities', param: 'city' },
    { active: 'country=India&reach_min=50000', facet: 'platforms', param: 'platform' },
    { active: 'stage=onboarded&country=India', facet: 'agreement', param: 'agreement' },
    { active: 'stage=onboarded&agreement=signed', facet: 'insights', param: 'insights' },
  ]
  for (const { active, facet, param } of scenarios) {
    const options = (await optionsFor(page, active))[facet]
    expect(options.length, `${facet} for ${active}`).toBeGreaterThan(0)
    // Everything but the facet's own filter stays; its own selection is replaced by the one option.
    const others = active
      .split('&')
      .filter((kv) => !kv.startsWith(`${param}=`))
      .join('&')
    for (const option of options) {
      const expected = await totalFor(page, `${others}&${param}=${encodeURIComponent(option.value)}`)
      expect(option.count, `${facet} ${option.value} with ${active}`).toBe(expected)
    }
  }
})

test('options stay listed while counts change; states and cities follow the hierarchy only', async ({ page }) => {
  await signInAs(page, 'admin')
  await page.goto('/influencers')
  const plain = await optionsFor(page, 'country=India')
  const narrowed = await optionsFor(page, 'country=India&stage=on_hold')
  const values = (list: FilterOption[]) => list.map((o) => o.value).sort()
  // Other filters change the counts, never which states / cities / categories are offered.
  expect(values(narrowed.states)).toEqual(values(plain.states))
  expect(values(narrowed.categories)).toEqual(values(plain.categories))
  expect(narrowed.states.every((o) => !['Texas', 'England', 'Ontario'].includes(o.value))).toBe(true)
  expect(narrowed.states.reduce((n, o) => n + o.count, 0)).toBeLessThan(plain.states.reduce((n, o) => n + o.count, 0))
  expect(narrowed.stages).toHaveLength(7)
})

test('filter bar counts update as filters are ticked and cleared', async ({ page }) => {
  await signInAs(page, 'admin')
  await page.goto('/influencers?stage=data_gathered')
  await expect(rows(page).first()).toBeVisible()
  await openFilters(page)

  const optionRow = (name: string | RegExp) => page.getByRole('option', { name })
  // An option's accessible name is its label followed by its count.
  const counted = (label: string, count: number) => new RegExp(`^${label}\\s*${count}$`)
  const filters = page.getByRole('group', { name: 'Filters' })
  const open = (filter: string) => filters.getByRole('button', { name: new RegExp(`^${filter}`) }).click()

  // With Stage = Data gathered, a category's count is its data-gathered total.
  const categories = (await optionsFor(page, 'stage=data_gathered')).categories
  const first = categories[0]!
  await open('Category')
  await expect(optionRow(counted(first.label, first.count))).toBeVisible()
  await optionRow(counted(first.label, first.count)).click()
  await page.keyboard.press('Escape')
  await expect(rows(page)).toHaveCount(Math.min(first.count, 25))

  // The Stage counts now apply the category: each stage shows what ticking it would give.
  const stages = (await optionsFor(page, `category=${encodeURIComponent(first.value)}&stage=data_gathered`)).stages
  const contacted = stages.find((s) => s.value === 'contacted')!
  expect(contacted.count).toBe(await totalFor(page, `category=${encodeURIComponent(first.value)}&stage=contacted`))
  await open('Stage')
  await expect(optionRow(counted('Contacted', contacted.count))).toBeVisible()
  await page.keyboard.press('Escape')

  // Clear one filter: the Category counts widen back to the full data-gathered counts.
  await page.getByRole('button', { name: `Remove filter ${first.value}` }).click()
  await expect(page.getByRole('button', { name: `Remove filter ${first.value}` })).toHaveCount(0)
  await open('Category')
  await expect(optionRow(counted(first.label, first.count))).toBeVisible()
  await page.keyboard.press('Escape')

  // Clear all filters: the counts are the unfiltered ones.
  await page.getByRole('button', { name: 'Clear all' }).click()
  await expect(page).toHaveURL(/\/influencers$/)
  const all = (await optionsFor(page, '')).categories.find((c) => c.value === first.value)!
  await open('Category')
  await expect(optionRow(counted(first.label, all.count))).toBeVisible()
})
