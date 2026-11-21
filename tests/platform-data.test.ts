import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { istDay, memoryPlatformData, setPlatformData, withSnapshot } from '@/backend/platform-data'
import { clearProfileSources, setProfileSource, type ProfileSource } from '@/backend/social'
import type { LookupProfile, MediaItem } from '@/types'
import { fetchInstagram } from '../server/meta'
import { addInfluencer, api, runJob, resetWorkspace } from './harness'

// Follower history and recent posts (P3): a sync records the day's audience and replaces the posts, against a fake
// profile source and the in-memory store; server/meta.ts's mapping of posts against a stubbed fetch. Nothing calls Meta.

const post = (n: number, likes: number | null = 10): MediaItem => ({
  thumbnail: `https://cdn.example.com/${n}.jpg`,
  permalink: `https://www.instagram.com/p/${n}/`,
  likes,
  comments: 1,
  posted_at: '2026-11-01T10:00:00.000Z',
})

let followers = 1_000
let posts: MediaItem[] | undefined = [post(1), post(2)]

const fake: ProfileSource = {
  fetch: async (handle) =>
    ({
      platform: 'instagram',
      handle,
      profile_url: `https://www.instagram.com/${handle}/`,
      display_name: handle,
      bio: null,
      links: [],
      profile_pic_url: null,
      is_verified: false,
      metrics: { followers, following: 1, posts: 2, engagement_rate: null, avg_likes: null, avg_comments: null, account_type: null },
      linked_accounts: [],
      recent_posts: posts,
    }) as LookupProfile,
}

beforeEach(() => {
  resetWorkspace()
  setProfileSource('instagram', fake)
  setPlatformData(memoryPlatformData())
  followers = 1_000
  posts = [post(1), post(2)]
})
afterEach(() => {
  clearProfileSources()
  setPlatformData(null)
  vi.useRealTimers()
})

async function syncedAccount() {
  const res = await addInfluencer('riya', { body: { accounts: [{ platform: 'instagram', handle: 'riya' }] } })
  return res.body.accounts[0].id as string
}

const sync = (id: string) => runJob('POST', `/accounts/${id}/sync`)
const at = (iso: string) => vi.useFakeTimers({ toFake: ['Date'] }).setSystemTime(new Date(iso))

describe('follower history and recent posts', () => {
  it('a sync records a snapshot and the posts; a sync later the same IST day replaces that day', async () => {
    const id = await syncedAccount()
    expect((await api('GET', `/accounts/${id}/snapshots`)).body.items).toEqual([])
    at('2026-11-20T03:00:00Z') // 08:30 IST
    expect((await sync(id)).status).toBe('succeeded')
    expect((await api('GET', `/accounts/${id}/snapshots`)).body.items).toEqual([{ audience: 1_000, captured_at: '2026-11-20T03:00:00.000Z' }])
    expect((await api('GET', `/accounts/${id}/media`)).body.items).toEqual([post(1), post(2)])

    followers = 1_200
    at('2026-11-20T18:00:00Z') // 23:30 IST, same day
    await sync(id)
    expect((await api('GET', `/accounts/${id}/snapshots`)).body.items).toEqual([{ audience: 1_200, captured_at: '2026-11-20T18:00:00.000Z' }])

    followers = 1_300
    at('2026-11-20T19:00:00Z') // 00:30 IST on the 21st: a new day
    await sync(id)
    const items = (await api('GET', `/accounts/${id}/snapshots`)).body.items
    expect(items.map((s: { audience: number }) => s.audience)).toEqual([1_200, 1_300])
  })

  it('posts are replaced wholesale; a profile without posts leaves them', async () => {
    const id = await syncedAccount()
    await sync(id)
    posts = [post(3, null)]
    await sync(id)
    expect((await api('GET', `/accounts/${id}/media`)).body.items).toEqual([post(3, null)])
    posts = undefined
    await sync(id)
    expect((await api('GET', `/accounts/${id}/media`)).body.items).toEqual([post(3, null)])
  })

  it('keeps 365 days: older snapshots are dropped when a new one is recorded', async () => {
    const id = await syncedAccount()
    at('2025-11-01T06:00:00Z')
    await sync(id)
    at('2025-11-25T06:00:00Z')
    await sync(id)
    at('2026-11-20T06:00:00Z')
    await sync(id)
    const items = (await api('GET', `/accounts/${id}/snapshots`)).body.items
    expect(items.map((s: { captured_at: string }) => s.captured_at)).toEqual(['2025-11-25T06:00:00.000Z', '2026-11-20T06:00:00.000Z'])
  })

  it('a failed sync records nothing; an unknown account is 404', async () => {
    const id = await syncedAccount()
    clearProfileSources()
    expect((await sync(id)).error?.code).toBe('not_connected')
    expect((await api('GET', `/accounts/${id}/snapshots`)).body.items).toEqual([])
    expect((await api('GET', '/accounts/acc_missing/media')).status).toBe(404)
  })

  it('an account saved from Look up starts its history and posts with what the lookup fetched', async () => {
    at('2026-11-20T06:00:00Z')
    const looked = await fake.fetch('riya')
    const sent = [
      post(1),
      // Only https links are kept; a post without a usable permalink is dropped.
      { ...post(2), thumbnail: 'http://cdn.example.com/2.jpg', likes: -1 },
      { ...post(3), permalink: 'javascript:alert(1)' },
    ]
    const account = { platform: 'instagram', handle: 'riya', metrics: looked.metrics, display_name: 'riya', recent_posts: sent }
    const res = await addInfluencer('riya', { body: { accounts: [account] } })
    expect(res.status).toBe(201)
    const id = res.body.accounts[0].id as string
    expect(res.body.accounts[0]).toMatchObject({ sync_status: 'synced', last_synced_at: '2026-11-20T06:00:00.000Z' })
    expect((await api('GET', `/accounts/${id}/snapshots`)).body.items).toEqual([{ audience: 1_000, captured_at: '2026-11-20T06:00:00.000Z' }])
    expect((await api('GET', `/accounts/${id}/media`)).body.items).toEqual([post(1), { ...post(2), thumbnail: null, likes: null }])

    // The same on an existing influencer; an account refused (already in the CRM) or typed in records nothing.
    const other = await addInfluencer('neha', { body: { accounts: [{ platform: 'instagram', handle: 'neha', sync_method: 'manual', metrics: { followers: 5 } }] } })
    const typedIn = other.body.accounts[0].id as string
    expect((await api('GET', `/accounts/${typedIn}/snapshots`)).body.items).toEqual([])
    const added = await api('POST', `/influencers/${other.body.id}/accounts`, { body: { platform: 'youtube', handle: 'nehavlogs', metrics: { subscribers: 70 }, recent_posts: [] } })
    expect(added.status).toBe(201)
    expect((await api('GET', `/accounts/${added.body.id}/snapshots`)).body.items).toEqual([{ audience: 70, captured_at: '2026-11-20T06:00:00.000Z' }])
    const refused = await api('POST', `/influencers/${other.body.id}/accounts`, { body: { ...account } })
    expect(refused.status).toBe(409)
    expect((await api('GET', `/accounts/${id}/snapshots`)).body.items).toHaveLength(1)
  })

  it('withSnapshot keeps the list ordered and one entry per IST day', () => {
    const list = withSnapshot([{ audience: 1, captured_at: '2026-11-19T10:00:00.000Z' }], 2, '2026-11-18T10:00:00.000Z')
    expect(list.map((s) => s.audience)).toEqual([2, 1])
    expect(istDay('2026-11-19T18:29:59.000Z')).toBe('2026-11-19')
    expect(istDay('2026-11-19T18:30:00.000Z')).toBe('2026-11-20')
  })
})

describe("server/meta.ts: recent posts from Meta's answer", () => {
  beforeEach(() => {
    process.env.META_ACCESS_TOKEN = 'test-token'
    process.env.META_IG_USER_ID = '1'
  })
  afterEach(() => vi.restoreAllMocks())

  it('asks for the post fields in the same call and maps images, videos and hidden likes', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          business_discovery: {
            username: 'riya',
            followers_count: 1_000,
            media: {
              data: [
                { media_type: 'VIDEO', permalink: 'https://www.instagram.com/reel/A/', thumbnail_url: 'https://cdn/a.jpg', timestamp: '2026-11-19T23:05:07+0000', like_count: 50, comments_count: 2 },
                { media_type: 'IMAGE', permalink: 'https://www.instagram.com/p/B/', media_url: 'https://cdn/b.jpg', timestamp: '2026-11-18T10:00:00+0000', comments_count: 4 },
                { media_type: 'VIDEO', permalink: 'https://www.instagram.com/reel/C/', timestamp: '2026-11-17T10:00:00+0000', like_count: 5, comments_count: 0 },
                { media_type: 'IMAGE', media_url: 'https://cdn/d.jpg', timestamp: '2026-11-16T10:00:00+0000' },
              ],
            },
          },
        }),
        { status: 200 },
      ),
    )
    const p = await fetchInstagram('riya')
    expect(spy).toHaveBeenCalledTimes(1)
    const url = decodeURIComponent(String(spy.mock.calls[0]![0]))
    expect(url).toContain('media.limit(12){permalink,media_type,media_url,thumbnail_url,timestamp,like_count,comments_count}')
    expect(p.recent_posts).toEqual([
      { thumbnail: 'https://cdn/a.jpg', permalink: 'https://www.instagram.com/reel/A/', likes: 50, comments: 2, posted_at: '2026-11-19T23:05:07.000Z' },
      { thumbnail: 'https://cdn/b.jpg', permalink: 'https://www.instagram.com/p/B/', likes: null, comments: 4, posted_at: '2026-11-18T10:00:00.000Z' },
      // A video without a cover image (e.g. copyrighted audio): no thumbnail, never the video file.
      { thumbnail: null, permalink: 'https://www.instagram.com/reel/C/', likes: 5, comments: 0, posted_at: '2026-11-17T10:00:00.000Z' },
      // The fourth has no permalink: left out.
    ])
    // The averages still use every post with a count (hidden likes left out).
    expect(p.metrics).toMatchObject({ avg_likes: 28, avg_comments: 2 })
  })
})
