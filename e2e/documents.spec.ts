import type { Page } from '@playwright/test'
import type { DocumentSummary, DashboardSummary, Influencer, InfluencerDocument, Paginated } from '../src/types/index.ts'
import { api, expect, signInAs, test, toast, USERS, viewAs } from './fixtures.ts'

// Fixtures: inf_043 (Sneha's, onboarded) has no documents; inf_006 (Sneha's) has two agreement versions and an
// insights summary; inf_016 (Sneha's) has an image insights summary; inf_001 (Arjun's) has agreements and insights;
// inf_010 is in the Unassigned Pool.

const pdf = (name: string) => ({ name, mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n% test file\n') })

const asUser = (page: Page, user: keyof typeof USERS) => page.evaluate((id) => localStorage.setItem('influencehub-mock-user', id), USERS[user])

async function fileInput(page: Page, dialogName: string | RegExp) {
  const dialog = page.getByRole('dialog', { name: dialogName })
  await expect(dialog).toBeVisible()
  return { dialog, file: dialog.getByLabel('File', { exact: true }) }
}

test('executive uploads an insights summary and an agreement; the checklist ticks by itself', async ({ page }) => {
  await signInAs(page, 'exec1')
  await page.goto('/influencers/inf_043')
  const checklist = page
  await expect(checklist.getByRole('checkbox', { name: 'Agreement signed' })).not.toBeChecked()
  await expect(checklist.getByRole('checkbox', { name: 'Insights received' })).not.toBeChecked()

  await page.getByRole('tab', { name: 'Documents' }).click()
  await expect(page.getByText('No insights summaries yet.')).toBeVisible()
  await expect(page.getByText('No agreement on file.')).toBeVisible()

  // Insights summary: the title follows the file name, progress shows while uploading.
  await page.getByRole('button', { name: 'Upload insights summary' }).click()
  let { dialog, file } = await fileInput(page, 'Upload insights summary')
  await file.setInputFiles(pdf('sep-insights.pdf'))
  await expect(dialog.getByLabel('Title')).toHaveValue('sep-insights')
  await dialog.getByRole('button', { name: 'Upload', exact: true }).click()
  await expect(dialog.getByText('Period start is required')).toBeVisible()
  await dialog.getByLabel('Period start').fill('01/09/2026')
  await dialog.getByLabel('Period end').fill('30/09/2026')
  await dialog.getByRole('button', { name: 'Upload', exact: true }).click()
  await expect(dialog.getByRole('progressbar', { name: 'Upload progress' })).toBeVisible()
  await expect(toast(page, 'Insights summary uploaded')).toBeVisible()
  const insights = page.getByRole('list', { name: 'Insights summaries' })
  await expect(insights).toContainText('sep-insights')
  await expect(insights).toContainText('01/09/2026 – 30/09/2026')

  // Agreement: the first one is current; a new upload replaces it as current and the old one moves to history.
  await page.getByRole('button', { name: 'Upload agreement' }).click()
  ;({ dialog, file } = await fileInput(page, 'Upload agreement'))
  await file.setInputFiles(pdf('agreement-v1.pdf'))
  await dialog.getByLabel('Title').fill('Agreement v1')
  await dialog.getByLabel('Signed on').fill('15/10/2026')
  await dialog.getByLabel(/^Valid until/).fill('14/10/2027')
  await dialog.getByRole('button', { name: 'Upload', exact: true }).click()
  await expect(toast(page, 'Agreement uploaded')).toBeVisible()
  const current = page.getByRole('list', { name: 'Current agreement' })
  await expect(current).toContainText('Agreement v1')
  await expect(current).toContainText('Signed 15/10/2026 · valid until 14/10/2027')
  await expect(page.getByRole('list', { name: 'Agreement version history' })).toHaveCount(0)

  await page.getByRole('button', { name: 'Upload new version' }).click()
  ;({ dialog, file } = await fileInput(page, 'Upload agreement'))
  await file.setInputFiles(pdf('agreement-v2.pdf'))
  await dialog.getByLabel('Title').fill('Agreement v2')
  await dialog.getByRole('button', { name: 'Upload', exact: true }).click()
  await expect(toast(page, /Agreement uploaded/).last()).toBeVisible()
  await expect(current).toContainText('Agreement v2')
  await expect(page.getByRole('list', { name: 'Agreement version history' })).toContainText('Agreement v1')
  await expect(page.getByText('Current', { exact: true })).toHaveCount(1)

  // Both uploads ticked the checklist, and the list's Docs column sees them.
  await page.getByRole('tab', { name: 'Overview' }).click()
  await expect(checklist.getByRole('checkbox', { name: 'Agreement signed' })).toBeChecked()
  await expect(checklist.getByRole('checkbox', { name: 'Insights received' })).toBeChecked()
  const inf = await api<Influencer>(page, '/influencers/inf_043')
  expect(inf.body.documents).toEqual({ insights_count: 1, has_agreement: true } satisfies DocumentSummary)

  // The activity log records the uploads.
  await page.getByRole('tab', { name: 'Activity' }).click()
  await expect(page.getByText('Uploaded an insights summary')).toBeVisible()
  await expect(page.getByText('Uploaded an agreement').first()).toBeVisible()
})

test('files are checked before upload: type and the 20 MB limit', async ({ page }) => {
  await signInAs(page, 'exec1')
  await page.goto('/influencers/inf_043?tab=documents')
  let presigns = 0
  page.on('request', (request) => {
    if (request.url().includes('/documents/presign')) presigns++
  })

  await page.getByRole('button', { name: 'Upload agreement' }).click()
  const { dialog, file } = await fileInput(page, 'Upload agreement')
  await file.setInputFiles({ name: 'notes.exe', mimeType: 'application/octet-stream', buffer: Buffer.from('MZ') })
  await expect(dialog.getByRole('alert')).toContainText('notes.exe isn’t supported')

  await file.setInputFiles({ name: 'huge.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(21 * 1024 * 1024) })
  await expect(dialog.getByRole('alert')).toContainText('huge.pdf is 21 MB. The limit is 20 MB.')

  // Submitting without a valid file doesn't start anything either.
  await dialog.getByRole('button', { name: 'Upload', exact: true }).click()
  await expect(dialog.getByRole('alert')).toBeVisible()
  expect(presigns).toBe(0)

  // The server enforces the same limits.
  const body = { influencer_id: 'inf_043', type: 'agreement', file_name: 'a.pdf', content_type: 'application/pdf' }
  const big = await api<{ error: { code: string } }>(page, '/documents/presign', { method: 'POST', body: { ...body, size: 21 * 1024 * 1024 } })
  expect([big.status, big.body.error.code]).toEqual([422, 'file_too_large'])
  const bad = await api<{ error: { code: string } }>(page, '/documents/presign', {
    method: 'POST',
    body: { ...body, content_type: 'application/zip', size: 10 },
  })
  expect([bad.status, bad.body.error.code]).toEqual([422, 'unsupported_file_type'])
})

test('preview a PDF and an image, and download', async ({ page }) => {
  await signInAs(page, 'exec1')
  await page.goto('/influencers/inf_006?tab=documents')

  await page.getByRole('button', { name: 'Preview Collaboration agreement 2026' }).click()
  const preview = page.getByRole('dialog', { name: 'Collaboration agreement 2026' })
  await expect(preview.locator('iframe')).toBeVisible()
  await preview.getByRole('button', { name: 'Close', exact: true }).first().click()
  await expect(preview).toBeHidden()

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download Collaboration agreement 2026' }).click(),
  ])
  expect(download.suggestedFilename()).toMatch(/^agreement-.+-v2\.pdf$/)

  // Insights summary stored as an image.
  await page.goto('/influencers/inf_016?tab=documents')
  await page.getByRole('button', { name: /^Preview .* insights/ }).click()
  const image = page.getByRole('dialog').locator('img')
  await expect(image).toBeVisible()
  await expect.poll(() => image.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0)
})

test('an executive can’t delete documents; a manager can, and the previous agreement becomes current', async ({ page }) => {
  await signInAs(page, 'exec1')
  await page.goto('/influencers/inf_006?tab=documents')
  await expect(page.getByRole('button', { name: 'Preview Collaboration agreement 2026' })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Delete / })).toHaveCount(0)

  const docs = await api<Paginated<InfluencerDocument>>(page, '/influencers/inf_006/documents')
  const current = docs.body.items.find((d) => d.type === 'agreement' && d.is_current)!
  const denied = await api<{ error: { code: string } }>(page, `/documents/${current.id}`, { method: 'DELETE' })
  expect([denied.status, denied.body.error.code]).toEqual([403, 'forbidden'])

  await viewAs(page, 'Rahul Menon')
  await page.getByRole('button', { name: 'Delete Collaboration agreement 2026' }).click()
  const confirm = page.getByRole('alertdialog', { name: 'Delete this document?' })
  await expect(confirm).toContainText('The previous version, if there is one, becomes the current agreement.')
  await confirm.getByRole('button', { name: 'Delete document' }).click()
  await expect(toast(page, 'Document deleted')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Preview Collaboration agreement 2026' })).toHaveCount(0)
  await expect(page.getByRole('list', { name: 'Current agreement' })).toContainText('Pilot agreement')

  // Soft delete: it's logged, and no longer served.
  const gone = await api(page, `/documents/${current.id}/download`)
  expect(gone.status).toBe(404)
  await page.getByRole('tab', { name: 'Activity' }).click()
  await expect(page.getByText('Deleted an agreement')).toBeVisible()
})

test('an executive never sees another executive’s documents, nor any for the pool', async ({ page }) => {
  await signInAs(page, 'admin')
  await page.goto('/documents')
  const arjuns = await api<Paginated<InfluencerDocument>>(page, '/influencers/inf_001/documents')
  expect(arjuns.body.total).toBeGreaterThan(0)
  const doc = arjuns.body.items[0]!
  // Even managers get nothing for an unassigned influencer.
  const pool = await api<{ error: { code: string } }>(page, '/influencers/inf_010/documents')
  expect([pool.status, pool.body.error.code]).toEqual([409, 'in_pool'])

  await asUser(page, 'exec1')
  expect((await api(page, '/influencers/inf_001/documents')).status).toBe(404)
  expect((await api(page, `/documents/${doc.id}/download`)).status).toBe(404)
  expect((await api(page, `/documents/${doc.id}`, { method: 'DELETE' })).status).toBe(404)
  expect(
    (await api(page, '/documents/presign', {
      method: 'POST',
      body: { influencer_id: 'inf_001', type: 'agreement', file_name: 'x.pdf', content_type: 'application/pdf', size: 10 },
    })).status,
  ).toBe(404)
  expect((await api(page, '/influencers/inf_010/documents')).status).toBe(404) // pool: not even a hint

  const mine = await api<Paginated<{ influencer: { assigned_to: string | null } }>>(page, '/documents?page_size=100')
  expect(mine.body.total).toBeGreaterThan(0)
  expect(mine.body.items.every((d) => d.influencer.assigned_to === USERS.exec1)).toBe(true)

  // In the app too: Riya Shah (inf_001) is Arjun's. (A page load signs in again, so add Sneha's sign-in after Ananya's.)
  await signInAs(page, 'exec1')
  await page.goto('/influencers/inf_001?tab=documents')
  await expect(page.getByText('Influencer not found')).toBeVisible()
  await page.goto('/documents')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Documents')
  await expect(page.locator('tbody tr').first()).toBeVisible()
  await expect(page.locator('tbody')).not.toContainText('Riya Shah')
})

test('Documents page: list, filters, and upload for a creator you pick', async ({ page }) => {
  await signInAs(page, 'admin')
  await page.goto('/documents')
  const rows = page.locator('tbody tr')
  await expect(rows.first()).toBeVisible()
  await expect(page.getByRole('columnheader', { name: 'Uploaded by' })).toBeVisible()
  const all = await api<Paginated<InfluencerDocument>>(page, '/documents?page_size=100')

  // Type filter, creator search, uploaded-by filter and the date range all narrow the list (and live in the URL).
  await page.getByRole('button', { name: /^Type/ }).click()
  await page.getByRole('option', { name: /^Agreement/ }).click()
  await page.keyboard.press('Escape')
  await expect(page).toHaveURL(/type=agreement/)
  const agreements = await api<Paginated<InfluencerDocument>>(page, '/documents?type=agreement&page_size=100')
  await expect(page.getByRole('heading', { level: 1 })).toContainText(`(${agreements.body.total})`)
  expect(agreements.body.total).toBeLessThan(all.body.total)

  await page.getByRole('searchbox', { name: 'Search creators' }).fill('riya')
  await expect(rows).toHaveCount(1)
  await expect(rows.first()).toContainText('Riya Shah')
  await expect(rows.first()).toContainText('Agreement')
  await expect(rows.first()).toContainText(/Signed \d{2}\/\d{2}\/\d{4}/)
  await page.goto('/documents')

  await page.getByRole('button', { name: /^Uploaded$/ }).click()
  await page.getByRole('textbox', { name: 'From' }).fill('01/01/2099')
  await page.getByRole('textbox', { name: 'To', exact: true }).fill('31/12/2099')
  await page.getByRole('button', { name: 'Apply' }).click()
  await expect(page.getByText('No documents match these filters')).toBeVisible()
  await expect(page).toHaveURL(/uploaded_from=2099-01-01&uploaded_to=2099-12-31/)
  await page.goto('/documents')

  // Upload from here: pick the creator first.
  await page.getByRole('button', { name: 'Upload', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Agreement' }).click()
  const picker = page.getByRole('dialog', { name: 'Upload agreement for…' })
  await picker.getByPlaceholder('Search influencers…').fill('Priya Nair')
  await picker.getByRole('option', { name: /Priya Nair/ }).click()
  const { dialog, file } = await fileInput(page, 'Upload agreement')
  await expect(dialog).toContainText('Priya Nair')
  await file.setInputFiles(pdf('priya-agreement.pdf'))
  await dialog.getByRole('button', { name: 'Upload', exact: true }).click()
  await expect(toast(page, 'Agreement uploaded')).toBeVisible()
  await expect(rows.filter({ hasText: 'Priya Nair' })).toHaveCount(1)
  await expect(rows.filter({ hasText: 'Priya Nair' })).toContainText('priya-agreement.pdf')
})

test('Onboarded needs a current agreement: the stage move asks for one, then completes', async ({ page }) => {
  await signInAs(page, 'manager')
  await page.goto('/influencers/inf_008') // contacted, no agreement
  await page.getByRole('button', { name: 'Stage: Contacted. Change stage' }).click()
  await page.getByRole('menuitem', { name: /Onboarded\s*Upload agreement…/ }).click()
  const { dialog, file } = await fileInput(page, 'Upload agreement')
  await file.setInputFiles(pdf('signed.pdf'))
  await dialog.getByRole('button', { name: 'Upload', exact: true }).click()
  await expect(toast(page, /moved to Onboarded/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Stage: Onboarded. Change stage' })).toBeVisible()

  // The API enforces it: inf_031 (contacted, no agreement) can't enter Onboarded...
  const refused = await api<{ error: { code: string } }>(page, '/influencers/inf_031/stage', { method: 'POST', body: { to: 'onboarded' } })
  expect([refused.status, refused.body.error.code]).toEqual([422, 'requirement_missing'])

  // ...but an admin override (a move outside the standard transitions) still works, with a reason.
  await asUser(page, 'admin')
  const noReason = await api<{ error: { code: string } }>(page, '/influencers/inf_003/stage', { method: 'POST', body: { to: 'onboarded' } })
  expect([noReason.status, noReason.body.error.code]).toEqual([422, 'reason_required'])
  const override = await api<Influencer>(page, '/influencers/inf_003/stage', { method: 'POST', body: { to: 'onboarded', reason: 'Signed offline' } })
  expect([override.status, override.body.stage]).toEqual([200, 'onboarded'])
})

test('Docs column, agreement / insights filters and the “Onboarded without agreement” KPI', async ({ page }) => {
  await signInAs(page, 'admin')
  await page.goto('/')
  const kpi = page.getByRole('link', { name: /Onboarded without agreement/ })
  await expect(kpi).toContainText('3')
  const summary = await api<DashboardSummary>(page, '/dashboard/summary')
  expect(summary.body.kpis.onboarded_without_agreement).toBe(3)

  await kpi.click()
  await expect(page).toHaveURL(/agreement=missing/)
  const rows = page.locator('tbody tr')
  await expect(rows).toHaveCount(3)
  await expect(page.getByRole('button', { name: 'Remove filter Agreement: Missing' })).toBeVisible()
  for (const row of await rows.all()) await expect(row).toContainText(/Agreement\s*missing/)

  // The filter bar drives the same URL params.
  await page.goto('/influencers')
  const filters = page.getByRole('group', { name: 'Filters' })
  await filters.getByRole('button', { name: /^Agreement/ }).click()
  await page.getByRole('option', { name: /^Signed/ }).click()
  await page.getByRole('option', { name: /^Missing/ }).click() // single choice: replaces "Signed"
  await page.keyboard.press('Escape')
  await expect(page).toHaveURL(/agreement=missing/)
  await expect(page).not.toHaveURL(/agreement=signed/)

  await page.goto('/influencers?agreement=signed&insights=received')
  // Rows first: the mock API is up once the page has loaded data through it.
  await expect(rows.first()).toContainText(/Insights\s*on file\s*Agreement\s*on file/)
  const signed = await api<Paginated<Influencer>>(page, '/influencers?agreement=signed&insights=received&page_size=100')
  expect(signed.body.total).toBeGreaterThan(0)
  expect(signed.body.items.every((i) => i.documents?.has_agreement && i.documents.insights_count > 0)).toBe(true)

  // An executive's figure covers only their own influencers (Sneha owns one of the three).
  await asUser(page, 'exec1')
  const mine = await api<DashboardSummary>(page, '/dashboard/summary')
  expect(mine.body.kpis.onboarded_without_agreement).toBe(1)
})
