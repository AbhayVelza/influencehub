import { actAs, expect, seed, sidebar, test, type Role, type Seed } from './fixtures'

// What each role sees and can open (src/lib/permissions.ts, src/components/layout/sidebar.tsx, src/router.tsx), and
// which influencers each list shows them (scoping in src/backend). One fresh workspace per test.

const NAV: Record<Role, string[]> = {
  admin: ['Dashboard', 'Influencers', 'Unassigned Pool', 'Possible duplicates', 'Pipeline', 'Calls & Follow-ups', 'Welcome Kits', 'Documents', 'Rejected', 'Settings'],
  manager: ['Dashboard', 'Influencers', 'Unassigned Pool', 'Possible duplicates', 'Pipeline', 'Calls & Follow-ups', 'Welcome Kits', 'Documents', 'Rejected'],
  executive: ['Dashboard', 'Influencers', 'Unassigned Pool', 'Pipeline', 'Calls & Follow-ups', 'Welcome Kits', 'Documents', 'Rejected'],
  brand_specialist: ['Dashboard', 'Influencers', 'Onboarded'],
}
const ALL_LINKS = [...new Set(Object.values(NAV).flat())].filter((l) => l !== 'Onboarded')
const DENIED = 'You don’t have access to this page'
const creator = (handle: string) => `Creator ${handle}`

let data: Seed

async function as(page: import('@playwright/test').Page, role: Role, path = '/') {
  await actAs(page, data.ids[role])
  await page.goto(path)
  // The shell renders once the acting member is loaded.
  await expect(page.getByRole('link', { name: 'Dashboard' })).toBeVisible()
}

test.beforeEach(async ({ page }) => {
  data = await seed(page)
})

for (const role of Object.keys(NAV) as Role[]) {
  test(`${role}: the sidebar shows exactly this role's pages`, async ({ page }) => {
    await as(page, role)
    const nav = sidebar(page)
    for (const label of NAV[role]) await expect(nav.getByRole('link', { name: new RegExp(`^${label}`) }).first()).toBeVisible()
    for (const label of ALL_LINKS.filter((l) => !NAV[role].includes(l))) {
      await expect(nav.getByRole('link', { name: new RegExp(`^${label}`) })).toHaveCount(0)
    }
  })
}

test('admin: Settings, every active influencer, and the Rejected tab with its Excel download', async ({ page }) => {
  await as(page, 'admin', '/settings')
  await expect(page.getByText('Instagram integration')).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Team' })).toBeVisible()

  await page.goto('/influencers')
  await expect(page.getByText(creator(data.influencers.mine)).first()).toBeVisible()
  await expect(page.getByText(creator(data.influencers.other)).first()).toBeVisible()
  // Rejected influencers live in the Rejected tab only.
  await expect(page.getByText(creator(data.influencers.rejected))).toHaveCount(0)

  await page.goto('/rejected')
  await expect(page.getByRole('link', { name: creator(data.influencers.rejected) })).toBeVisible()
  await expect(page.getByRole('link', { name: `@${data.influencers.rejected}` })).toBeVisible()
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download Excel' }).click()])
  expect(download.suggestedFilename()).toMatch(/^rejected-influencers-\d{4}-\d{2}-\d{2}\.xlsx$/)
  // Read the file before the context closes (an unfinished download can crash Edge's next context).
  expect((await download.path()).length).toBeGreaterThan(0)
})

test('manager: sees everyone’s influencers, but not Settings', async ({ page }) => {
  await as(page, 'manager', '/influencers')
  await expect(page.getByText(creator(data.influencers.mine)).first()).toBeVisible()
  await expect(page.getByText(creator(data.influencers.other)).first()).toBeVisible()
  await page.goto('/settings')
  await expect(page.getByText(DENIED)).toBeVisible()
})

test('executive: only their own influencers, the pool, their rejected ones; no Settings or duplicates', async ({ page }) => {
  await as(page, 'executive', '/influencers')
  await expect(page.getByText(creator(data.influencers.mine)).first()).toBeVisible()
  await expect(page.getByText(creator(data.influencers.other))).toHaveCount(0)

  await page.goto('/pool')
  await expect(page.getByText(creator(data.influencers.pool)).first()).toBeVisible()

  await page.goto('/rejected')
  await expect(page.getByRole('link', { name: creator(data.influencers.rejected) })).toBeVisible()

  for (const path of ['/settings', '/duplicates']) {
    await page.goto(path)
    await expect(page.getByText(DENIED)).toBeVisible()
  }
})

test('brand specialist: onboarded creators only; no pool, rejected, pipeline or settings', async ({ page }) => {
  await as(page, 'brand_specialist', '/influencers')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  for (const handle of Object.values(data.influencers)) await expect(page.getByText(creator(handle))).toHaveCount(0)
  for (const path of ['/pool', '/rejected', '/pipeline', '/settings']) {
    await page.goto(path)
    await expect(page.getByText(DENIED)).toBeVisible()
  }
})
