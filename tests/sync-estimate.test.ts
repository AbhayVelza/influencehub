import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/backend/db'
import type { SocialAccount } from '@/types'
import { dueCount, recordInstagramRun } from '../server/sync-worker'
import { addInfluencer, resetWorkspace } from './harness'

// The expected finish time of the Instagram background sync, stored on each run in sync_runs (Settings → Instagram):
// accounts still due × 40 s.

const NOW = '2026-11-26T05:10:00.000Z' // 10:40 IST
const at = (iso: string) => vi.useFakeTimers({ toFake: ['Date'] }).setSystemTime(new Date(iso))
const accounts = (): SocialAccount[] => db.influencers.flatMap((i) => i.accounts)
const markSynced = (a: SocialAccount, when = NOW) => Object.assign(a, { sync_status: 'synced', last_synced_at: when })

beforeEach(async () => {
  resetWorkspace()
  at(NOW)
  // Three Instagram accounts waiting for their first sync, one typed in, one YouTube channel.
  for (const h of ['riya', 'neha', 'aman']) await addInfluencer(h, { body: { accounts: [{ platform: 'instagram', handle: h }] } })
  await addInfluencer('typed', { body: { accounts: [{ platform: 'instagram', handle: 'typed', sync_method: 'manual', metrics: { followers: 5 } }] } })
  await addInfluencer('vlogs', { body: { accounts: [{ platform: 'youtube', handle: 'vlogs' }] } })
})
afterEach(() => vi.useRealTimers())

describe('Instagram sync: expected finish time', () => {
  it('counts only accounts the sync still has to fetch', () => {
    expect(dueCount('instagram', Date.now())).toBe(3)
    const [riya, neha] = accounts().filter((a) => a.platform === 'instagram' && a.sync_method === 'lookup')
    markSynced(riya!)
    // Synced 8 days ago: due again (auto-sync every 7 days).
    markSynced(neha!, '2026-11-18T05:00:00.000Z')
    expect(dueCount('instagram', Date.now())).toBe(2)
    expect(dueCount('youtube', Date.now())).toBe(1)
  })

  it('each sync stores what is left and when it should be done; a new run logs the estimate once', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const ig = accounts().filter((a) => a.platform === 'instagram' && a.sync_method === 'lookup')

    markSynced(ig[0]!)
    recordInstagramRun(true)
    const run = db.instagramSettings.last_runs[0]!
    expect(run).toMatchObject({ started_at: '2026-11-26T05:00:00.000Z', synced: 1, queued: 2, expected_finish_at: '2026-11-26T05:11:20.000Z' })
    expect(log).toHaveBeenCalledTimes(1)
    expect(log.mock.calls[0]![0]).toContain('2 account(s) queued')

    markSynced(ig[1]!)
    recordInstagramRun(true)
    expect(db.instagramSettings.last_runs[0]).toMatchObject({ synced: 2, queued: 1, expected_finish_at: '2026-11-26T05:10:40.000Z' })

    markSynced(ig[2]!)
    recordInstagramRun(true)
    expect(db.instagramSettings.last_runs[0]).toMatchObject({ synced: 3, queued: 0, expected_finish_at: null })
    expect(db.instagramSettings.last_runs).toHaveLength(1)
    expect(log).toHaveBeenCalledTimes(1)
  })
})
