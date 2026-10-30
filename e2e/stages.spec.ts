import type { Page } from '@playwright/test'
import type { Activity, Influencer, Paginated } from '../src/types/index.ts'
import { api, expect, signInAs, test, toast } from './fixtures.ts'

const stageButton = (page: Page, label: string) => page.getByRole('button', { name: `Stage: ${label}. Change stage` })

test('stage modals: Contacted needs an interested call, On Hold confirms, then Resume', async ({ page }) => {
  await signInAs(page, 'admin')
  await page.goto('/influencers/inf_003') // Priya Nair: data gathered, no calls
  await stageButton(page, 'Data Gathered').click()
  await page.getByRole('menuitem', { name: /Contacted\s*Log call…/ }).click()

  const call = page.getByRole('dialog', { name: 'Log call' })
  await expect(call.getByRole('radio', { name: 'Interested', exact: true })).toHaveAttribute('aria-checked', 'true')
  await expect(call.getByRole('checkbox')).toBeChecked()
  await call.getByLabel('Notes').fill('Keen on the festive range')
  await call.getByRole('button', { name: 'Log call' }).click()
  await expect(toast(page, 'Call logged · Priya Nair moved to Contacted')).toBeVisible()
  await expect(stageButton(page, 'Contacted')).toBeVisible()

  await stageButton(page, 'Contacted').click()
  await page.getByRole('menuitem', { name: /On Hold/ }).click()
  const hold = page.getByRole('dialog', { name: 'Put Priya Nair on hold?' })
  await hold.getByLabel(/Reason/).fill('Travelling until next month')
  await hold.getByRole('button', { name: 'Move to On Hold' }).click()
  await expect(stageButton(page, 'On Hold')).toBeVisible()

  await page.getByRole('button', { name: 'Resume to Contacted' }).click()
  await expect(stageButton(page, 'Contacted')).toBeVisible()
})

test('Package Sent opens the package drawer and needs courier + tracking number', async ({ page }) => {
  await signInAs(page, 'admin')
  await page.goto('/influencers/inf_001') // Riya Shah: onboarded, no package yet
  await stageButton(page, 'Onboarded').click()
  await page.getByRole('menuitem', { name: /Package Sent\s*Create package…/ }).click()

  const drawer = page.getByRole('dialog', { name: 'Ship a package' })
  await drawer.getByRole('button', { name: 'Create & mark sent' }).click()
  await expect(drawer.getByText('Courier is required once shipped')).toBeVisible()
  await expect(drawer.getByText('Tracking number is required once shipped')).toBeVisible()

  await drawer.getByLabel('Item 1 name').fill('Festive Kurta Set')
  await drawer.getByLabel('Courier').fill('Delhivery')
  await drawer.getByRole('textbox', { name: 'Tracking number' }).fill('1234567890123')
  await drawer.getByRole('button', { name: 'Create & mark sent' }).click()
  await expect(toast(page, 'Package created · Riya Shah moved to Package Sent')).toBeVisible()
  await expect(stageButton(page, 'Package Sent')).toBeVisible()
})

test('admin override needs a reason, which is logged with the move', async ({ page }) => {
  await signInAs(page, 'admin')
  await page.goto('/influencers/inf_001')
  await stageButton(page, 'Onboarded').click()
  await expect(page.getByText('Override (admin)')).toBeVisible()
  // Data Gathered is not a standard move from Onboarded, so it is only offered as an override.
  await page.getByRole('menuitem', { name: 'Data Gathered' }).click()

  const dialog = page.getByRole('dialog', { name: 'Override: move to Data Gathered' })
  const reason = dialog.getByLabel(/Reason/)
  await dialog.getByRole('button', { name: 'Override stage' }).click()
  await expect(reason).toHaveAttribute('aria-invalid', 'true')
  await reason.fill('Re-pitching for the winter campaign')
  await dialog.getByRole('button', { name: 'Override stage' }).click()
  await expect(toast(page, 'Riya Shah moved to Data Gathered')).toBeVisible()
  await expect(stageButton(page, 'Data Gathered')).toBeVisible()

  const activity = await api<Paginated<Activity>>(page, '/influencers/inf_001/activity')
  const move = activity.body.items.find((a) => a.type === 'stage_changed')
  expect(move?.payload).toMatchObject({ from: 'onboarded', to: 'data_gathered', override: true, reason: 'Re-pitching for the winter campaign' })
})

test('a returned package moves the influencer back to Onboarded, after confirming', async ({ page }) => {
  await signInAs(page, 'admin')
  await page.goto('/packages')
  await page.getByRole('button', { name: 'Actions for Aarav Mehta’s package' }).click()
  await page.getByRole('menuitem', { name: 'Returned' }).click()

  const confirm = page.getByRole('alertdialog', { name: 'Mark package returned?' })
  await expect(confirm).toContainText('Onboarded')
  await confirm.getByRole('button', { name: 'Mark returned' }).click()
  await expect(toast(page, 'Package marked returned')).toBeVisible()

  const aarav = await api<Influencer>(page, '/influencers/inf_002')
  expect(aarav.body.stage).toBe('onboarded')
})
