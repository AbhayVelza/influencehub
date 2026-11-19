import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/backend/db'
import { JobFailure } from '@/backend/jobs'
import { setProfileSource, type ProfileSource } from '@/backend/social'
import type { LookupProfile } from '@/types'
import { fetchInstagram } from '../server/meta'
import { ADMIN, addInfluencer, api, influencer, resetWorkspace, runJob } from './harness'

// Instagram lookup and sync (P3 platform APIs): the rules run against a fake profile source; server/meta.ts's mapping
// of Meta's answers is checked against a stubbed fetch. Nothing here calls Meta.

const profile = (handle: string, followers: number): LookupProfile =>
  ({
    platform: 'instagram',
    handle,
    profile_url: `https://www.instagram.com/${handle}/`,
    display_name: `Real ${handle}`,
    bio: 'Bio',
    links: ['https://example.com'],
    profile_pic_url: 'https://cdn.example.com/p.jpg',
    is_verified: false,
    metrics: { followers, following: 10, posts: 5, engagement_rate: 2.5, avg_likes: 100, avg_comments: 5, account_type: null },
    linked_accounts: [],
  }) as LookupProfile

const fake: ProfileSource = {
  platforms: ['instagram'],
  fetch: async (_p, handle) => {
    if (handle === 'personal') throw new JobFailure('not_found', 'No Business or Creator account has that username.')
    return profile(handle, 12_000)
  },
}

beforeEach(() => {
  resetWorkspace()
  setProfileSource(fake)
})
afterEach(() => setProfileSource(null))

const account = (id: string) => db.influencers.find((i) => i.id === id)!.accounts[0]!

describe('Instagram lookup and sync', () => {
  it('reports which platforms are connected', async () => {
    expect((await api('GET', '/integrations')).body).toEqual({ profile_lookup: ['instagram'] })
    setProfileSource(null)
    expect((await api('GET', '/integrations')).body).toEqual({ profile_lookup: [] })
  })

  it('looks a creator up by handle; a personal profile is not found', async () => {
    const ok = await runJob('POST', '/lookup', { body: { platform: 'instagram', username: '@Riya' } })
    expect(ok.status).toBe('succeeded')
    expect(ok.result).toMatchObject({ handle: 'riya', metrics: { followers: 12_000 } })
    const personal = await runJob('POST', '/lookup', { body: { platform: 'instagram', username: 'personal' } })
    expect(personal.error?.code).toBe('not_found')
  })

  it('without a connection, lookup says not connected', async () => {
    setProfileSource(null)
    const job = await runJob('POST', '/lookup', { body: { platform: 'instagram', username: 'riya' } })
    expect(job.error?.code).toBe('not_connected')
  })

  it('Sync now fills the profile and stats and updates total followers', async () => {
    const res = await addInfluencer('riya', { body: { accounts: [{ platform: 'instagram', handle: 'riya' }] } })
    const acc = res.body.accounts[0]
    expect(acc.sync_method).toBe('lookup')
    const job = await runJob('POST', `/accounts/${acc.id}/sync`)
    expect(job.status).toBe('succeeded')
    const a = account(res.body.id)
    expect(a).toMatchObject({ sync_status: 'synced', display_name: 'Real riya', profile_pic_url: 'https://cdn.example.com/p.jpg' })
    expect(a.metrics).toMatchObject({ followers: 12_000, engagement_rate: 2.5 })
    expect(db.influencers.find((i) => i.id === res.body.id)!.total_reach).toBe(12_000)
  })

  it('a failed sync marks the account and keeps its stats', async () => {
    const res = await addInfluencer('personal')
    const job = await runJob('POST', `/accounts/${res.body.accounts[0].id}/sync`)
    expect(job.error?.code).toBe('not_found')
    expect(account(res.body.id).sync_status).toBe('error')
  })

  it('bulk sync queues connected accounts for the background sync', async () => {
    const id = await influencer('riya')
    const res = await api('POST', '/influencers/bulk', { body: { ids: [id], action: 'sync' } })
    // The job runs on its first poll, as in the app.
    const job = await api('GET', `/jobs/${res.body.job_id}`)
    expect(job.body.result).toMatchObject({ synced: 0, queued: 1, failed: [] })
    expect(account(id).sync_status).toBe('pending')
  })

  it('auto-sync switches typed-in accounts, keeps their numbers until synced, and queues them', async () => {
    const res = await addInfluencer('riya', {
      body: { accounts: [{ platform: 'instagram', handle: 'riya', sync_method: 'manual', metrics: { followers: 500 } }] },
    })
    const bulk = await api('POST', '/influencers/bulk', { body: { ids: [res.body.id], action: 'auto_sync' } })
    expect(bulk.body.succeeded).toEqual([res.body.id])
    expect(account(res.body.id)).toMatchObject({ sync_method: 'lookup', sync_status: 'pending', metrics: { followers: 500 } })
    const again = await api('POST', '/influencers/bulk', { body: { ids: [res.body.id], action: 'auto_sync' } })
    expect(again.body.failed[0].code).toBe('nothing_to_switch')
  })

  it('one account switches to auto-sync, only when its platform is connected', async () => {
    const res = await addInfluencer('riya', { body: { accounts: [{ platform: 'instagram', handle: 'riya', sync_method: 'manual' }] } })
    const accId = res.body.accounts[0].id
    setProfileSource(null)
    expect((await api('PATCH', `/accounts/${accId}`, { body: { sync_method: 'lookup' } })).body.error.code).toBe('not_connected')
    setProfileSource(fake)
    expect((await api('PATCH', `/accounts/${accId}`, { body: { sync_method: 'lookup' } })).status).toBe(200)
    expect(account(res.body.id).sync_method).toBe('lookup')
  })

  it('CSV import with "Fetch public profiles" queues Instagram accounts as auto-sync', async () => {
    const cat = db.categories[0]!.name
    const presign = await api('POST', '/imports/csv/presign', { body: { filename: 'a.csv' } })
    await api('POST', '/imports/csv/upload', { body: { key: presign.body.key, text: `Name,Category,Instagram,Followers\nRiya,${cat},riya,500\n` } })
    const job = await runJob('POST', '/imports/csv', {
      body: { key: presign.body.key, mapping: { name: 'Name', category: 'Category', instagram: 'Instagram', instagram_followers: 'Followers' }, fetch_profiles: true, on_duplicate: 'skip' },
      as: ADMIN,
    })
    expect(job.result.profiles).toMatchObject({ queued: 1 })
    const created = db.influencers.find((i) => i.name === 'Riya')!
    expect(created.accounts[0]).toMatchObject({ sync_method: 'lookup', sync_status: 'pending', metrics: { followers: 500 } })
  })
})

describe("server/meta.ts: Meta's answers", () => {
  const meta = (body: unknown, status = 200) =>
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(body), { status, headers: { 'x-app-usage': '{"call_count":12,"total_time":3,"total_cputime":1}' } }),
    )

  beforeEach(() => {
    process.env.META_ACCESS_TOKEN = 'test-token'
    process.env.META_IG_USER_ID = '1'
  })
  afterEach(() => vi.restoreAllMocks())

  it('maps a profile and averages its recent posts', async () => {
    meta({
      business_discovery: {
        username: 'Riya.Style',
        name: 'Riya',
        biography: 'Hi',
        website: 'https://riya.example',
        followers_count: 10_000,
        follows_count: 50,
        media_count: 300,
        profile_picture_url: 'https://cdn/p.jpg',
        media: { data: [{ like_count: 400, comments_count: 20 }, { like_count: 200, comments_count: 0 }, { comments_count: 4 }] },
      },
    })
    const p = await fetchInstagram('riya.style')
    expect(p).toMatchObject({ handle: 'riya.style', display_name: 'Riya', links: ['https://riya.example'] })
    // Likes: (400 + 200) / 2 = 300 (a post with hidden likes is left out); comments: 24 / 3 = 8; (300 + 8) / 10,000.
    expect(p.metrics).toMatchObject({ followers: 10_000, following: 50, posts: 300, avg_likes: 300, avg_comments: 8, engagement_rate: 3.08 })
  })

  it('turns Meta errors into the lookup errors the screens explain', async () => {
    meta({ error: { code: 110, error_subcode: 2207013, message: 'cannot be found' } }, 400)
    await expect(fetchInstagram('nobody')).rejects.toMatchObject({ code: 'not_found' })
    meta({ error: { code: 4, message: 'limit' } }, 400)
    await expect(fetchInstagram('riya')).rejects.toMatchObject({ code: 'rate_limited' })
    meta({ error: { code: 190, message: 'expired' } }, 400)
    await expect(fetchInstagram('riya')).rejects.toMatchObject({ code: 'not_connected' })
  })

  it('never sends a request for a handle Instagram cannot have', async () => {
    const spy = meta({})
    await expect(fetchInstagram('bad handle!')).rejects.toMatchObject({ code: 'not_found' })
    expect(spy).not.toHaveBeenCalled()
  })
})
