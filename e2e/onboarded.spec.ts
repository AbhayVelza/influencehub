import type { Page } from '@playwright/test'
import type { Influencer, Paginated } from '../src/types/index.ts'
import { api, expect, openFilters, signInAs, test, toast, viewAs } from './fixtures.ts'

// Fixtures: onboarded with an agreement and insights: inf_001 Riya (Arjun's; Instagram, YouTube), inf_006 Ishaan
// (Sneha's; Instagram), inf_015 Diya (Arjun's; Instagram). Onboarded but missing a document: inf_021 Aisha, inf_037
// Liam (TikTok; agreement only). inf_008 Rohan (Rahul's; Instagram) is contacted with no documents.

const pdf = (name: string) => ({ name, mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n% test file\n') })

const rows = (page: Page) => page.locator('tbody tr')

/** Opens a platform's tab from the sidebar group (in-app, so the mock data is kept). */
async function openFromSidebar(page: Page, label: string) {
  const nav = page.getByRole('navigation', { name: 'Main' })
  const toggle = nav.getByRole('button', { name: /onboarded platforms/ })
  if ((await toggle.getAttribute('aria-expanded')) === 'false') await toggle.click()
  await nav.getByRole('list', { name: 'Onboarded by platform' }).getByRole('link', { name: label }).click()
  await expect(page.getByRole('heading', { level: 1, name: new RegExp(`Onboarded on ${label}`) })).toBeVisible()
  await expect(page.locator('[data-slot="skeleton"]')).toHaveCount(0)
}

test('Onboarded tabs: overview counts, per-platform lists, search and filters', async ({ page }) => {
  await signInAs(page, 'admin')
  await page.goto('/')

  // The sidebar group opens to one link per platform; "Onboarded" itself is the overview.
  const nav = page.getByRole('navigation', { name: 'Main' })
  await expect(nav.getByRole('list', { name: 'Onboarded by platform' })).toHaveCount(0)
  await nav.getByRole('button', { name: 'Show onboarded platforms' }).click()
  await expect(nav.getByRole('link', { name: 'Instagram' })).toBeVisible()
  await nav.getByRole('link', { name: 'Onboarded', exact: true }).click()

  const platforms = page.getByRole('list', { name: 'Platforms' })
  await expect(platforms.getByRole('link', { name: /Instagram/ })).toContainText('3 onboarded')
  await expect(platforms.getByRole('link', { name: /YouTube/ })).toContainText('1 onboarded')
  await expect(platforms.getByRole('link', { name: /TikTok/ })).toContainText('0 onboarded')

  // Instagram: onboarded + account there + agreement + insights. Aisha (no documents) and Liam (no insights) stay out.
  await platforms.getByRole('link', { name: /Instagram/ }).click()
  await expect(page).toHaveURL(/\/onboarded\/instagram$/)
  await expect(page.getByRole('heading', { level: 1, name: /Onboarded on Instagram \(3\)/ })).toBeVisible()
  await expect(rows(page)).toHaveCount(3)
  for (const name of ['Riya Shah', 'Ishaan Kapoor', 'Diya Menon']) await expect(rows(page).filter({ hasText: name })).toHaveCount(1)
  await expect(page.locator('thead')).toContainText('Instagram account')
  await expect(page.locator('thead')).toContainText('Followers')

  // The onboarded rule is fixed: no Stage / Platform / Agreement / Insights filters, and the URL can't loosen it.
  await openFilters(page)
  const filters = page.getByRole('group', { name: 'Filters' })
  await expect(filters.getByRole('button', { name: /^Category/ })).toBeVisible()
  for (const name of [/^Platform/, /^Stage/, /^Agreement/, /^Insights/]) await expect(filters.getByRole('button', { name })).toHaveCount(0)

  // Search narrows the list and lives in the URL.
  await page.getByLabel('Search influencers in this list').fill('riya')
  await expect(page).toHaveURL(/q=riya/)
  await expect(rows(page)).toHaveCount(1)
  await expect(rows(page)).toContainText('Riya Shah')
  await page.getByRole('button', { name: 'Remove filter “riya”' }).click()
  await expect(rows(page)).toHaveCount(3)

  // YouTube holds only Riya; TikTok is empty and says why.
  await openFromSidebar(page, 'YouTube')
  await expect(rows(page)).toHaveCount(1)
  await expect(rows(page)).toContainText('Riya Shah')
  await expect(page.locator('thead')).toContainText('Subscribers')
  await openFromSidebar(page, 'TikTok')
  await expect(page.getByText('No onboarded creators on TikTok yet')).toBeVisible()

  // Back to the overview; a row opens the influencer.
  await page.getByRole('link', { name: 'All platforms' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Onboarded' })).toBeVisible()
  await openFromSidebar(page, 'Instagram')
  await rows(page).filter({ hasText: 'Ishaan Kapoor' }).getByRole('cell').nth(3).click()
  await expect(page).toHaveURL(/\/influencers\/inf_006$/)
})

test('Onboarded tabs: executives see only their own creators', async ({ page }) => {
  await signInAs(page, 'exec1')
  // URL filters can't loosen the onboarded rule.
  await page.goto('/onboarded/instagram?stage=contacted&agreement=missing&platform=tiktok')
  await expect(page.getByRole('heading', { level: 1, name: /Onboarded on Instagram \(1\)/ })).toBeVisible()
  await expect(rows(page)).toHaveCount(1)
  await expect(rows(page)).toContainText('Ishaan Kapoor')
  // No owner filter for executives.
  await openFilters(page)
  await expect(page.getByRole('group', { name: 'Filters' }).getByRole('button', { name: /^Assigned/ })).toHaveCount(0)

  // The API scopes the same request: Sneha gets her one, Arjun his two.
  const path = '/influencers?stage=onboarded&platform=instagram&agreement=signed&insights=received'
  const sneha = await api<Paginated<Influencer>>(page, path)
  expect(sneha.body.items.map((i) => i.id)).toEqual(['inf_006'])
  await viewAs(page, 'Arjun Rao')
  await expect(page.getByRole('heading', { level: 1, name: /Onboarded on Instagram \(2\)/ })).toBeVisible()
  const arjun = await api<Paginated<Influencer>>(page, path)
  expect(arjun.body.items.map((i) => i.id).sort()).toEqual(['inf_001', 'inf_015'])
})

test('Onboarded tabs: a creator appears once onboarded with an agreement and an insights summary', async ({ page }) => {
  await signInAs(page, 'manager')
  await page.goto('/influencers/inf_008')

  // Contacted → Onboarded (uploading the agreement the move needs).
  await page.getByRole('button', { name: 'Stage: Contacted. Change stage' }).click()
  await page.getByRole('menuitem', { name: /Onboarded\s*Upload agreement…/ }).click()
  let dialog = page.getByRole('dialog', { name: 'Upload agreement' })
  await dialog.getByLabel('File', { exact: true }).setInputFiles(pdf('signed.pdf'))
  await dialog.getByRole('button', { name: 'Upload', exact: true }).click()
  await expect(toast(page, /moved to Onboarded/)).toBeVisible()

  // Still no insights summary, so not listed yet.
  await openFromSidebar(page, 'Instagram')
  await expect(rows(page)).toHaveCount(3)
  await expect(rows(page).filter({ hasText: 'Rohan Desai' })).toHaveCount(0)

  // Upload one; now Rohan shows under Instagram.
  await page.goBack()
  await page.getByRole('tab', { name: 'Documents' }).click()
  await page.getByRole('button', { name: 'Upload insights summary' }).click()
  dialog = page.getByRole('dialog', { name: 'Upload insights summary' })
  await dialog.getByLabel('File', { exact: true }).setInputFiles(pdf('insights.pdf'))
  await dialog.getByLabel('Period start').fill('01/09/2026')
  await dialog.getByLabel('Period end').fill('30/09/2026')
  await dialog.getByRole('button', { name: 'Upload', exact: true }).click()
  await expect(toast(page, 'Insights summary uploaded')).toBeVisible()

  await openFromSidebar(page, 'Instagram')
  await expect(rows(page)).toHaveCount(4)
  await expect(rows(page).filter({ hasText: 'Rohan Desai' })).toHaveCount(1)
})

test('Onboarded tabs: a Followers filter on the platform’s own account, with chips, URL and counts', async ({ page }) => {
  await signInAs(page, 'admin')
  await page.goto('/onboarded/instagram')
  await expect(rows(page)).toHaveCount(3)

  // Instagram followers of the three creators, from the API: filter at the middle one.
  const onboarded = 'stage=onboarded&agreement=signed&insights=received'
  const list = await api<Paginated<Influencer>>(page, `/influencers?${onboarded}&platform=instagram&page_size=100`)
  const followers = list.body.items
    .map((inf) => ({ name: inf.name, n: (inf.accounts.find((a) => a.platform === 'instagram')!.metrics as { followers: number }).followers }))
    .sort((a, b) => a.n - b.n)
  expect(followers).toHaveLength(3)
  const [low, mid, high] = followers as [(typeof followers)[number], (typeof followers)[number], (typeof followers)[number]]
  expect(new Set(followers.map((f) => f.n)).size).toBe(3)

  await openFilters(page)
  const filters = page.getByRole('group', { name: 'Filters' })
  await filters.getByRole('button', { name: /^Followers/ }).click()
  await page.getByLabel('Min').fill(String(mid.n))
  await page.getByRole('button', { name: 'Apply' }).click()
  await expect(page).toHaveURL(new RegExp(`followers_min=${mid.n}`))
  await expect(rows(page)).toHaveCount(2)
  await expect(rows(page).filter({ hasText: low.name })).toHaveCount(0)
  await expect(rows(page).filter({ hasText: high.name })).toHaveCount(1)
  await expect(page.getByRole('heading', { level: 1, name: /Onboarded on Instagram \(2\)/ })).toBeVisible()

  // It combines (AND) with the other filters, and the other filters' counts follow it.
  await filters.getByRole('button', { name: /^Followers/ }).click()
  await page.getByLabel('Max').fill(String(mid.n))
  await page.getByRole('button', { name: 'Apply' }).click()
  await expect(rows(page)).toHaveCount(1)
  await expect(rows(page)).toContainText(mid.name)
  const counts = await api<{ categories: { count: number }[] }>(
    page,
    `/influencers/filter-options?${onboarded}&platform=instagram&followers_min=${mid.n}&followers_max=${mid.n}`,
  )
  expect(counts.body.categories.reduce((n, c) => n + c.count, 0)).toBe(1)

  // Chip removal clears the range; so does Clear all.
  await page.getByRole('button', { name: /^Remove filter Followers/ }).click()
  await expect(rows(page)).toHaveCount(3)
  await expect(page).not.toHaveURL(/followers_/)

  // A fresh load of the URL restores it, and it applies to the tab's own platform: Riya's YouTube
  // subscribers, not her Instagram followers.
  const youtube = await api<Paginated<Influencer>>(page, `/influencers?${onboarded}&platform=youtube&page_size=100`)
  const subscribers = (youtube.body.items[0]!.accounts.find((a) => a.platform === 'youtube')!.metrics as { subscribers: number }).subscribers
  await page.goto(`/onboarded/youtube?followers_min=${subscribers + 1}`)
  await expect(page.getByRole('button', { name: /^Remove filter Followers/ })).toBeVisible()
  await expect(page.getByText('No onboarded creators match these filters')).toBeVisible()
  await page.getByRole('button', { name: 'Clear all' }).click()
  await expect(rows(page)).toHaveCount(1)

  // Other lists don't offer it.
  await page.goto('/influencers')
  await openFilters(page)
  await expect(page.getByRole('group', { name: 'Filters' }).getByRole('button', { name: /^Followers/ })).toHaveCount(0)
})

test('Onboarded tabs: the Followers column sorts like Total reach (highest first, then lowest)', async ({ page }) => {
  await signInAs(page, 'admin')
  await page.goto('/onboarded/instagram')
  await expect(rows(page)).toHaveCount(3)

  const list = await api<Paginated<Influencer>>(page, '/influencers?stage=onboarded&agreement=signed&insights=received&platform=instagram&page_size=100')
  const byFollowers = list.body.items
    .map((inf) => ({ name: inf.name, n: (inf.accounts.find((a) => a.platform === 'instagram')!.metrics as { followers: number }).followers }))
    .sort((a, b) => b.n - a.n)
    .map((f) => f.name)

  const header = page.getByRole('columnheader', { name: 'Followers' })
  await header.getByRole('button', { name: 'Followers' }).click()
  await expect(page).toHaveURL(/sort=-followers/)
  await expect(header).toHaveAttribute('aria-sort', 'descending')
  for (const [i, name] of byFollowers.entries()) await expect(rows(page).nth(i)).toContainText(name)

  await header.getByRole('button', { name: 'Followers' }).click()
  await expect(page).toHaveURL(/sort=followers(&|$)/)
  await expect(header).toHaveAttribute('aria-sort', 'ascending')
  for (const [i, name] of [...byFollowers].reverse().entries()) await expect(rows(page).nth(i)).toContainText(name)
})
