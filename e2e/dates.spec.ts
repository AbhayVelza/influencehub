import type { Influencer, Paginated } from '../src/types/index.ts'
import { api, expect, signInAs, test, toast } from './fixtures.ts'

const DATE = /^\d{2}\/\d{2}\/\d{4}$/
const DATE_TIME = /^\d{2}\/\d{2}\/\d{4}, \d{2}:\d{2} (AM|PM)$/
const OLD_STYLE = /\b\d{1,2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4}\b/

test('displayed dates are dd/MM/yyyy on the list, detail pages and charts; relative times keep the exact time in a tooltip', async ({ page }) => {
  await signInAs(page, 'admin')

  // Documents list: "Uploaded" is a relative time; its tooltip is the exact date-time.
  await page.goto('/documents')
  const uploaded = page.locator('tbody time').first()
  await expect(uploaded).toBeVisible()
  expect(await uploaded.getAttribute('title')).toMatch(DATE_TIME)
  await expect(page.locator('tbody')).toContainText(/Signed \d{2}\/\d{2}\/\d{4}/)

  // Packages list: plain dates.
  await page.getByRole('navigation').getByRole('link', { name: /^Packages/ }).click()
  const body = page.locator('tbody')
  await expect(body.getByRole('cell', { name: DATE }).first()).toBeVisible()
  await expect(body).not.toContainText(OLD_STYLE)

  // Detail: activity tooltips, the growth chart's axis (dd/MM) and its table view (dd/MM/yyyy).
  await page.goto('/influencers/inf_001?tab=activity')
  const entry = page.locator('time').first()
  await expect(entry).toBeVisible()
  expect(await entry.getAttribute('title')).toMatch(DATE_TIME)

  const tick = page.locator('.recharts-xAxis-tick-labels .recharts-cartesian-axis-tick-value').first()
  await expect(tick).toBeVisible()
  expect((await tick.textContent())?.trim()).toMatch(/^\d{2}\/\d{2}$/)
  await expect(page.locator('main, body').first()).not.toContainText(OLD_STYLE)
})

test('date inputs show and accept dd/MM/yyyy: follow-up date-time and the date-range filter', async ({ page }) => {
  await signInAs(page, 'admin')
  await page.goto('/influencers/inf_003')
  await page.getByRole('button', { name: 'Log call' }).click()
  const dialog = page.getByRole('dialog', { name: 'Log call' })
  const followUp = dialog.getByLabel(/^Follow-up/)
  await expect(followUp).toHaveAttribute('placeholder', 'dd/MM/yyyy, hh:mm a')

  await dialog.getByRole('radio', { name: 'Call back' }).click()
  await followUp.fill('2099-12-31 17:00')
  await dialog.getByRole('button', { name: 'Log call' }).click()
  await expect(dialog.getByText(/Enter a valid date and time/)).toBeVisible()

  // The shortcuts write the same format.
  await dialog.getByRole('button', { name: 'Tomorrow 11 AM' }).click()
  expect(await followUp.inputValue()).toMatch(/^\d{2}\/\d{2}\/\d{4}, 11:00 AM$/)

  await followUp.fill('31/12/2099, 05:00 PM')
  await dialog.getByRole('button', { name: 'Log call' }).click()
  await expect(toast(page, 'Call logged')).toBeVisible()
  const calls = await api<Paginated<{ follow_up_date: string | null }>>(page, '/influencers/inf_003/calls')
  // 05:00 PM IST = 11:30 UTC; the API keeps ISO 8601.
  expect(calls.body.items[0]?.follow_up_date).toBe('2099-12-31T11:30:00.000Z')

  // Date range filter (Packages → Sent).
  await page.goto('/packages')
  await page.getByRole('button', { name: /^Sent/ }).click()
  const from = page.getByRole('textbox', { name: 'From' })
  const to = page.getByRole('textbox', { name: 'To', exact: true })
  await expect(from).toHaveAttribute('placeholder', 'dd/MM/yyyy')
  await from.fill('2026-10-01')
  await expect(page.getByText('Use dd/MM/yyyy')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Apply' })).toBeDisabled()
  await from.fill('01/10/2026')
  await to.fill('31/10/2026')
  await page.getByRole('button', { name: 'Apply' }).click()
  await expect(page).toHaveURL(/sent_from=2026-10-01&sent_to=2026-10-31/)
  await expect(page.getByRole('button', { name: /^Sent.*01\/10\/2026 – 31\/10\/2026/ })).toBeVisible()
})

test('CSV import accepts dd/MM/yyyy and ISO dates; export writes dd/MM/yyyy', async ({ page }) => {
  test.setTimeout(90_000)
  await signInAs(page, 'admin')
  await page.goto('/influencers')
  await page.getByRole('button', { name: 'Import CSV' }).click()
  const dialog = page.getByRole('dialog', { name: 'Add influencers' })
  const csv = [
    'name,category,instagram,created_at',
    'Dated One,Tech,dated.one,15/03/2026',
    'Dated Two,Tech,dated.two,2026-04-20',
    'Dated Bad,Tech,dated.bad,31/02/2026',
  ].join('\n')
  await dialog.getByLabel('CSV file').setInputFiles({ name: 'dated.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) })
  await expect(dialog.getByText(/Use dd\/MM\/yyyy or an ISO date/)).toBeVisible()
  await dialog.getByRole('button', { name: 'Import 2 rows' }).click()
  await expect(dialog.getByText(/Import finished/)).toBeVisible({ timeout: 30_000 })

  const created = await api<Paginated<Influencer>>(page, '/influencers?q=dated.&sort=name')
  expect(created.body.items.map((i) => [i.name, i.created_at])).toEqual([
    ['Dated One', '2026-03-14T18:30:00.000Z'], // 15/03/2026 00:00 IST
    ['Dated Two', '2026-04-19T18:30:00.000Z'], // 2026-04-20 00:00 IST
  ])

  const job = await api<{ job_id: string }>(page, '/exports/influencers', { method: 'POST', body: { ids: [created.body.items[0]!.id] } })
  await expect
    .poll(
      async () => {
        const res = await api<{ status: string; result: { download_url: string } | null }>(page, `/jobs/${job.body.job_id}`)
        return res.body.status === 'succeeded' ? decodeURIComponent(res.body.result!.download_url.split(',')[1]!) : null
      },
      { timeout: 15_000 },
    )
    .toMatch(/Dated One,.*,15\/03\/2026,dated\.one/)
})
