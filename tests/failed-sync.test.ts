import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/backend/db'
import { JobFailure } from '@/backend/jobs'
import { clearProfileSources, setProfileSource } from '@/backend/social'
import type { LookupProfile, SocialAccount } from '@/types'
import { syncNext, type LoopState, type PlatformSync } from '../server/sync-worker'
import { addInfluencer, api, resetWorkspace, runJob } from './harness'

// A failed sync keeps the account's last known numbers (Sync now and the background sync). Failures are forced with a
// fake profile source that succeeds once, then throws the error under test. Nothing here calls a platform.

const profile = (handle: string): LookupProfile =>
  ({
    platform: 'instagram',
    handle,
    profile_url: `https://www.instagram.com/${handle}/`,
    display_name: 'Riya Style',
    bio: 'Fashion',
    links: [],
    profile_pic_url: 'https://cdn.example.com/p.jpg',
    is_verified: false,
    metrics: { followers: 12_000, following: 10, posts: 5, engagement_rate: 2.5, avg_likes: 100, avg_comments: 5, account_type: null },
    linked_accounts: [],
  }) as LookupProfile

/** What the fake source does next: answer, or throw this error. */
let next: JobFailure | null = null
const fetchProfile = async (handle: string) => {
  if (next) throw next
  return profile(handle)
}

const fail = (code: string) => new JobFailure(code, `forced ${code}`)

const accountOf = (influencerId: string): SocialAccount => db.influencers.find((i) => i.id === influencerId)!.accounts[0]!
/** The parts a failure must leave alone. */
const kept = (a: SocialAccount) => ({
  metrics: a.metrics,
  display_name: a.display_name,
  profile_pic_url: a.profile_pic_url,
  bio: a.bio,
  last_synced_at: a.last_synced_at,
})

/** An Instagram account synced once (12,000 followers). */
async function syncedInfluencer() {
  const res = await addInfluencer('riya', { body: { accounts: [{ platform: 'instagram', handle: 'riya' }] } })
  expect((await runJob('POST', `/accounts/${res.body.accounts[0].id}/sync`)).status).toBe('succeeded')
  const id: string = res.body.id
  expect(accountOf(id)).toMatchObject({ sync_status: 'synced', metrics: { followers: 12_000 } })
  return id
}

beforeEach(() => {
  resetWorkspace()
  next = null
  setProfileSource('instagram', { fetch: fetchProfile })
})
afterEach(() => {
  clearProfileSources()
  vi.restoreAllMocks()
})

describe('Sync now: a failed sync keeps the old data', () => {
  it.each([
    ['not_found', 'error'],
    ['unavailable', 'error'],
    ['rate_limited', 'synced'],
    ['not_connected', 'synced'],
  ])('%s keeps the stats; status becomes %s', async (code, status) => {
    const id = await syncedInfluencer()
    const before = kept(accountOf(id))
    const totalBefore = db.influencers.find((i) => i.id === id)!.total_reach

    next = fail(code)
    const job = await runJob('POST', `/accounts/${accountOf(id).id}/sync`)

    expect(job.error?.code).toBe(code)
    expect(accountOf(id).sync_status).toBe(status)
    expect(kept(accountOf(id))).toEqual(before)
    expect(db.influencers.find((i) => i.id === id)!.total_reach).toBe(totalBefore)
  })

  it('a later successful sync clears the error', async () => {
    const id = await syncedInfluencer()
    next = fail('not_found')
    await runJob('POST', `/accounts/${accountOf(id).id}/sync`)
    expect(accountOf(id).sync_status).toBe('error')
    next = null
    expect((await runJob('POST', `/accounts/${accountOf(id).id}/sync`)).status).toBe('succeeded')
    expect(accountOf(id).sync_status).toBe('synced')
  })
})

describe('Background sync: a failed sync keeps the old data', () => {
  const inTurn = <T>(task: () => Promise<T>) => task()
  const save = vi.fn(async () => {})
  const onNotConnected = vi.fn(async () => {})
  const sync: PlatformSync = { platform: 'instagram', label: 'Instagram', tickMs: 1, fetch: fetchProfile, onNotConnected }

  /** A synced account queued again (Sync profiles / bulk sync). */
  async function queued() {
    const id = await syncedInfluencer()
    await api('POST', '/influencers/bulk', { body: { ids: [id], action: 'sync' } }).then((r) => api('GET', `/jobs/${r.body.job_id}`))
    expect(accountOf(id).sync_status).toBe('pending')
    return id
  }

  it('not found marks the account error and keeps its stats; the loop carries on', async () => {
    const id = await queued()
    const before = kept(accountOf(id))
    const state: LoopState = { pausedUntil: 0 }
    next = fail('not_found')
    await syncNext(sync, inTurn, save, state)
    expect(accountOf(id).sync_status).toBe('error')
    expect(kept(accountOf(id))).toEqual(before)
    expect(state.pausedUntil).toBe(0)
  })

  it.each(['unavailable', 'rate_limited'])('%s keeps the stats, leaves the account queued and pauses 15 minutes', async (code) => {
    const id = await queued()
    const before = kept(accountOf(id))
    const state: LoopState = { pausedUntil: 0 }
    next = fail(code)
    const start = Date.now()
    await syncNext(sync, inTurn, save, state)
    expect(accountOf(id).sync_status).toBe('pending')
    expect(kept(accountOf(id))).toEqual(before)
    expect(state.pausedUntil).toBeGreaterThanOrEqual(start + 15 * 60_000)
    // Still paused: the next step doesn't call the platform.
    const spy = vi.fn(fetchProfile)
    await syncNext({ ...sync, fetch: spy }, inTurn, save, state)
    expect(spy).not.toHaveBeenCalled()
  })

  it('a lost connection keeps the stats, leaves the account queued and pauses 6 hours', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const id = await queued()
    const before = kept(accountOf(id))
    const state: LoopState = { pausedUntil: 0 }
    next = fail('not_connected')
    const start = Date.now()
    await syncNext(sync, inTurn, save, state)
    expect(accountOf(id).sync_status).toBe('pending')
    expect(kept(accountOf(id))).toEqual(before)
    expect(state.pausedUntil).toBeGreaterThanOrEqual(start + 6 * 3600_000)
    expect(onNotConnected).toHaveBeenCalled()
  })

  it('an error for a handle renamed while the platform answered is dropped', async () => {
    const id = await queued()
    const renaming: PlatformSync = {
      ...sync,
      fetch: async () => {
        accountOf(id).handle = 'riya.new'
        throw fail('not_found')
      },
    }
    await syncNext(renaming, inTurn, save, { pausedUntil: 0 })
    expect(accountOf(id)).toMatchObject({ handle: 'riya.new', sync_status: 'pending' })
  })
})
