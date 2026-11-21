import { api, expect, test } from './fixtures'

// Live updates in prototype mode (src/lib/live.ts, src/backend/index.ts): two tabs of one browser share a workspace,
// and a change saved in one shows in the other without a reload, well before the 30 s staleTime / 60 s polling.

const LIVE = { timeout: 5_000 }

test('a change in one tab shows in the other tab without a reload', async ({ page, context }) => {
  const errors: string[] = []
  await page.goto('/influencers')
  await expect(page.getByRole('link', { name: 'Dashboard' })).toBeVisible()
  const categories = await api<{ items: { name: string }[] }>(page, 'GET', '/categories')
  const category = categories.body.items[0]!.name
  const add = (tab: typeof page, handle: string) =>
    api(tab, 'POST', '/influencers', { name: `Creator ${handle}`, category, accounts: [{ platform: 'instagram', handle }] })
  await add(page, 'e2e_first')
  await page.reload()
  await expect(page.getByText('Creator e2e_first').first()).toBeVisible()

  const other = await context.newPage()
  other.on('pageerror', (e) => errors.push(e.message))
  await other.goto('/settings')
  await other.getByRole('tab', { name: 'Team & roles' }).click()
  await expect(other.getByText('E2E Live member', { exact: true })).toHaveCount(0)

  // The other tab adds an influencer: this tab's list shows it.
  expect((await add(other, 'e2e_live')).status).toBe(201)
  await expect(page.getByText('Creator e2e_live').first()).toBeVisible(LIVE)

  // This tab adds a team member: the other tab's Team list shows it.
  const member = await api(page, 'POST', '/team', { name: 'E2E Live member', email: 'live@e2e.test', role: 'executive' })
  expect(member.status).toBe(201)
  await expect(other.getByText('E2E Live member', { exact: true })).toBeVisible(LIVE)

  // Each tab loaded the other's save before its own, so nothing was overwritten.
  await page.reload()
  await expect(page.getByText('Creator e2e_first').first()).toBeVisible()
  await expect(page.getByText('Creator e2e_live').first()).toBeVisible()
  await other.reload()
  await other.getByRole('tab', { name: 'Team & roles' }).click()
  await expect(other.getByText('E2E Live member', { exact: true })).toBeVisible()
  expect(errors).toEqual([])
})

test('a save never writes over another tab’s newer save, even before that tab’s message arrives', async ({ page }) => {
  await page.goto('/influencers')
  await expect(page.getByRole('link', { name: 'Dashboard' })).toBeVisible()
  const categories = await api<{ items: { name: string }[] }>(page, 'GET', '/categories')
  const category = categories.body.items[0]!.name
  const add = (handle: string) => api(page, 'POST', '/influencers', { name: `Creator ${handle}`, category, accounts: [{ platform: 'instagram', handle }] })
  expect((await add('e2e_before')).status).toBe(201)

  // "Another tab" saves straight to IndexedDB and sends no message: this tab's working copy is now behind.
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('influencehub-prototype')
        open.onerror = () => reject(open.error)
        open.onsuccess = () => {
          const tx = open.result.transaction('workspace', 'readwrite')
          const store = tx.objectStore('workspace')
          const get = store.get('current')
          get.onsuccess = () => {
            const data = get.result as { team: { id: string; name: string }[] }
            data.team.find((u) => u.id === 'usr_owner')!.name = 'Renamed in another tab'
            store.put(data, 'current')
            store.put('e2e-other-tab', 'rev')
          }
          tx.oncomplete = () => {
            open.result.close()
            resolve()
          }
          tx.onerror = () => reject(tx.error)
        }
      }),
  )

  // This tab's next request loads that save first, then saves on top of it: both changes are kept.
  expect((await add('e2e_after')).status).toBe(201)
  const check = async () => {
    expect((await api<{ name: string }>(page, 'GET', '/me')).body.name).toBe('Renamed in another tab')
    const list = await api<{ items: { name: string }[] }>(page, 'GET', '/influencers')
    expect(list.body.items.map((i) => i.name).sort()).toEqual(['Creator e2e_after', 'Creator e2e_before'])
  }
  await check()
  await page.reload()
  await check()
})
