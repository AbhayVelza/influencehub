import type { Page } from '@playwright/test'
import type { DuplicateCheckResponse, Influencer, MergeRequest } from '../src/types/index.ts'
import { api, expect, signInAs, test } from './fixtures.ts'

const RIYA_EMAIL = 'riyastyle.collabs@example.com' // Riya Shah (Arjun's) and the planted "Riya S." (Rahul's)

async function openManualAdd(page: Page) {
  await page.getByRole('button', { name: 'Add Influencer' }).first().click()
  const dialog = page.getByRole('dialog', { name: 'Add influencers' })
  await dialog.getByRole('tab', { name: 'Manual' }).click()
  return dialog
}

async function fillManual(page: Page, values: { name: string; platform?: string; handle: string; email?: string; city?: string }) {
  const dialog = page.getByRole('dialog', { name: 'Add influencers' })
  await dialog.getByLabel('Name', { exact: true }).fill(values.name)
  if (values.platform) {
    await dialog.getByRole('combobox', { name: 'Platform' }).click()
    await page.getByRole('option', { name: values.platform }).click()
  }
  await dialog.getByLabel(/handle or link/).fill(values.handle)
  await dialog.getByRole('combobox', { name: 'Category' }).click()
  await page.getByRole('option', { name: 'Fashion' }).click()
  if (values.email) await dialog.getByLabel('Email').fill(values.email)
  if (values.city) await dialog.getByLabel('City').fill(values.city)
  await expect(dialog.getByText('Not in the CRM yet')).toBeVisible()
}

test.describe('duplicate warning on add', () => {
  test('same email: warns, then adds the new account to the existing creator', async ({ page }) => {
    await signInAs(page, 'admin')
    await page.goto('/influencers')
    const dialog = await openManualAdd(page)
    await fillManual(page, { name: 'Riya Shah', platform: 'TikTok', handle: '@riyashah.tt', email: RIYA_EMAIL })

    const check = page.waitForResponse((r) => r.url().endsWith('/api/v1/duplicates/check'))
    await dialog.getByRole('button', { name: 'Add influencer' }).click()
    const body = (await (await check).json()) as DuplicateCheckResponse
    expect(body.matches.map((m) => m.influencer_id).sort()).toEqual(['inf_001', 'inf_051'])
    expect(body.matches.every((m) => m.access === 'full' && m.confidence === 'high' && m.reasons.includes('Same email'))).toBe(true)

    const warning = dialog.getByRole('alert').filter({ hasText: 'Possible same creator' })
    await expect(warning).toBeVisible()
    await expect(warning.getByRole('link', { name: 'Riya Shah' })).toBeVisible()
    await expect(warning.getByText('Same email').first()).toBeVisible()

    const riyaRow = warning.getByRole('listitem').filter({ has: page.getByRole('link', { name: 'Riya Shah' }) })
    await riyaRow.getByRole('button', { name: 'Add account to existing' }).click()
    await expect(page).toHaveURL(/\/influencers\/inf_001$/)
    await expect(page.getByRole('tab', { name: /@riyashah\.tt/ })).toBeVisible()
    const riya = await api<Influencer>(page, '/influencers/inf_001')
    expect(riya.body.accounts.map((a) => `${a.platform}:${a.handle}`)).toContain('tiktok:riyashah.tt')
  })

  test('similar name in the same city: low-confidence warning, then Create anyway', async ({ page }) => {
    await signInAs(page, 'admin')
    await page.goto('/influencers')
    const dialog = await openManualAdd(page)
    await fillManual(page, { name: 'Kabir Malhotraa', handle: 'kabir.lifts', city: 'New Delhi' })
    await dialog.getByRole('button', { name: 'Add influencer' }).click()
    const warning = dialog.getByRole('alert').filter({ hasText: 'Possible same creator' })
    await expect(warning.getByText('Low confidence').first()).toBeVisible()
    await expect(warning.getByText('Similar name in the same city (New Delhi)').first()).toBeVisible()
    await warning.getByRole('button', { name: 'Create anyway' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Kabir Malhotraa' })).toBeVisible()
  })

  test('lookup offers accounts linked in the bio', async ({ page }) => {
    await signInAs(page, 'admin')
    await page.goto('/influencers')
    await page.getByRole('button', { name: 'Add Influencer' }).first().click()
    const dialog = page.getByRole('dialog', { name: 'Add influencers' })
    await dialog.getByLabel('Username or profile link').fill('instagram.com/creator.multi')
    await dialog.getByRole('button', { name: 'Fetch' }).click()
    const linked = dialog.getByText('Also found: YouTube @creator.multi. Add it?')
    await expect(linked).toBeVisible()
    await linked.click()
    await dialog.getByRole('combobox', { name: 'Category' }).click()
    await page.getByRole('option', { name: 'Tech' }).click()
    await dialog.getByRole('button', { name: 'Save influencer' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Creator Multi' })).toBeVisible()
    await expect(page.getByRole('tab', { name: /YouTube @creator\.multi/ })).toBeVisible()
  })
})

test.describe('possible duplicates', () => {
  test('merge: pick the survivor and values; accounts, history and the advanced stage are kept', async ({ page }) => {
    await signInAs(page, 'manager')
    await page.goto('/duplicates')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Possible duplicates (4)')
    await expect(page.getByRole('link', { name: /Possible duplicates.*4 to review/ })).toBeVisible()

    const pair = page.getByRole('article', { name: 'Riya Shah and Riya S.' })
    await expect(pair.getByText('Same email')).toBeVisible()
    await pair.getByRole('button', { name: 'Merge…' }).click()
    const dialog = page.getByRole('dialog', { name: 'Merge duplicates' })
    // Keep Riya Shah (the default), but take the planted record's owner.
    await expect(dialog.getByRole('group', { name: 'Keep which record?' }).getByRole('radio', { name: /^Riya Shah/ })).toBeChecked()
    await dialog.getByRole('radiogroup', { name: 'Owner' }).getByRole('radio', { name: 'Rahul Menon' }).check()
    await expect(dialog.getByText('3 social accounts')).toBeVisible()

    const merged = page.waitForResponse((r) => r.url().endsWith('/api/v1/influencers/merge'))
    await dialog.getByRole('button', { name: 'Merge into Riya Shah' }).click()
    const res = await merged
    const sent = res.request().postDataJSON() as MergeRequest
    expect(sent).toMatchObject({ keep_id: 'inf_001', merge_id: 'inf_051', field_choices: { assigned_to: 'merge', name: 'keep', notes: 'keep' } })
    const kept = (await res.json()) as Influencer
    expect(kept.accounts.map((a) => a.handle)).toEqual(expect.arrayContaining(['riyastyle', 'riyashahvlogs']))
    expect(kept.stage).toBe('onboarded') // more advanced than the duplicate's Data Gathered
    expect(kept.assigned_to).toBe('usr_02')
    expect(kept.notes).toBe('Speaks Hindi and Marathi; open to regional reels.') // both had notes: the survivor's by default

    await expect(page.getByText('Merged into Riya Shah')).toBeVisible()
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Possible duplicates (3)')
    expect((await api(page, '/influencers/inf_051')).status).toBe(404)

    // In-app navigation: a reload would reset the mock data.
    await page.getByRole('button', { name: 'Open profile' }).click()
    await expect(page).toHaveURL(/\/influencers\/inf_001$/)
    await expect(page.getByRole('button', { name: /Owner: You/ })).toBeVisible() // the manager is Rahul
    await page.getByRole('tab', { name: 'Activity' }).click()
    await expect(page.getByText('Merged Riya S. into this profile')).toBeVisible()
    await expect(page.getByRole('tab', { name: /@riyashahvlogs/ })).toBeVisible()
  })

  test('dismiss removes a pair for good', async ({ page }) => {
    await signInAs(page, 'admin')
    await page.goto('/duplicates')
    const pair = page.getByRole('article', { name: 'Kabir Malhotra and Kabir Malhothra' })
    await expect(pair.getByText('Similar name in the same city (New Delhi)')).toBeVisible()
    await pair.getByRole('button', { name: 'Dismiss' }).click()
    await expect(pair).toHaveCount(0)
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Possible duplicates (3)')
  })
})

test.describe('executive privacy', () => {
  test('a teammate’s matching creator is never revealed', async ({ page }) => {
    await signInAs(page, 'exec1')
    await page.goto('/influencers')
    await expect(page.getByRole('link', { name: /Possible duplicates/ })).toHaveCount(0)
    expect((await api(page, '/duplicates')).status).toBe(403)

    const dialog = await openManualAdd(page)
    await fillManual(page, { name: 'R Shah', handle: 'rshah.new', email: RIYA_EMAIL })
    const check = page.waitForResponse((r) => r.url().endsWith('/api/v1/duplicates/check'))
    await dialog.getByRole('button', { name: 'Add influencer' }).click()
    const body = (await (await check).json()) as DuplicateCheckResponse
    expect(body.matches).toHaveLength(2)
    for (const m of body.matches) {
      expect(m).toMatchObject({ access: 'restricted', influencer_id: null, influencer: null, reasons: [] })
    }

    const warning = dialog.getByRole('alert').filter({ hasText: 'Possible same creator' })
    await expect(warning.getByText('Matches 2 creators assigned to teammates.')).toBeVisible()
    await expect(warning).not.toContainText('Riya')
    await expect(warning).not.toContainText('Same email')
    await expect(warning.getByRole('button', { name: 'Add account to existing' })).toHaveCount(0)
    await warning.getByRole('button', { name: 'Create anyway' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'R Shah' })).toBeVisible()
  })

  test('their own matching creator is shown in full', async ({ page }) => {
    await signInAs(page, 'exec1')
    await page.goto('/influencers')
    const dialog = await openManualAdd(page)
    await fillManual(page, { name: 'Ishaan K', handle: 'ishaan.k.new', email: 'ishaankapoor.collabs@example.com' })
    await dialog.getByRole('button', { name: 'Add influencer' }).click()
    const warning = dialog.getByRole('alert').filter({ hasText: 'Possible same creator' })
    await expect(warning.getByRole('link', { name: 'Ishaan Kapoor' })).toBeVisible()
    await expect(warning.getByRole('button', { name: 'Add account to existing' })).toBeVisible()
  })

  test('adding a teammate’s account to your creator says only that a teammate has it', async ({ page }) => {
    await signInAs(page, 'exec1')
    await page.goto('/influencers/inf_006')
    await page.getByRole('button', { name: 'Add account' }).click()
    const dialog = page.getByRole('dialog', { name: 'Add a social account' })
    await dialog.getByRole('combobox', { name: 'Platform' }).click()
    await page.getByRole('option', { name: 'YouTube' }).click()
    await dialog.getByLabel(/handle or link/).fill('youtube.com/@ishaantalks') // Arjun's planted channel
    await expect(dialog.getByText('YouTube @ishaantalks is already owned by a teammate')).toBeVisible()
    await expect(dialog.getByRole('link', { name: 'Open profile' })).toHaveCount(0)
    const check = await api<{ influencer_id: string | null; conflict: string }>(page, '/influencers/check-handle?platform=youtube&handle=ishaantalks')
    expect(check.body).toMatchObject({ influencer_id: null, conflict: 'assigned_to_other' })
  })
})

test('CSV import preview flags rows that match existing creators', async ({ page }) => {
  await signInAs(page, 'admin')
  await page.goto('/influencers')
  await page.getByRole('button', { name: 'Import CSV' }).click()
  const dialog = page.getByRole('dialog', { name: 'Add influencers' })
  const csv = [
    'name,category,email,city,instagram,youtube',
    `Riya Shah,Fashion,${RIYA_EMAIL},Pune,riya.new.handle,`,
    'Brand New Creator,Tech,new.creator@example.com,Goa,brand.new.creator,brandnewcreator',
  ].join('\n')
  await dialog.getByLabel('CSV file').setInputFiles({ name: 'creators.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) })
  await expect(dialog.getByRole('columnheader', { name: 'Possible duplicate' })).toBeVisible()
  const rows = dialog.locator('tbody tr')
  await expect(rows.nth(0)).toContainText('High confidence')
  await expect(rows.nth(1)).not.toContainText('confidence')
  await expect(dialog.getByText('1 may match existing creators')).toBeVisible()
})
