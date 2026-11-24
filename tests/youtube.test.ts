import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/backend/db'
import { memoryPlatformData, setPlatformData } from '@/backend/platform-data'
import { clearProfileSources, setProfileSource, type ProfileSource } from '@/backend/social'
import type { LookupProfile } from '@/types'
import { dueAccount } from '../server/sync-worker'
import { findLinkedAccounts, normalizeHandle, PLATFORM_META, platformOfUrl } from '@/lib/platforms'
import { handleSchema } from '@/lib/schemas'
import {
  checkYouTube,
  fetchYouTube,
  untilPacificMidnight,
  YOUTUBE_BACKGROUND_UNITS,
  youtubeBackgroundHoldUntil,
  youtubeQuotaResetAt,
  youtubeUnitsToday,
} from '../server/youtube'
import { ADMIN, addInfluencer, addMember, api, resetWorkspace, runJob } from './harness'

// YouTube lookup and sync (P3): server/youtube.ts's use of the Data API against a stubbed fetch (3 quota units a
// channel, never search), and the per-platform rules against fake sources. Nothing here calls YouTube.

const ytProfile = (handle: string, subscribers: number | null): LookupProfile => ({
  platform: 'youtube',
  handle,
  profile_url: `https://www.youtube.com/@${handle}`,
  display_name: `Channel ${handle}`,
  bio: null,
  links: [],
  profile_pic_url: null,
  is_verified: false,
  metrics: { subscribers, total_views: 1_000, video_count: 3, avg_views_recent: 50, channel_country: 'IN' },
  linked_accounts: [],
  recent_posts: [],
})

const igProfile = (handle: string): LookupProfile => ({
  platform: 'instagram',
  handle,
  profile_url: `https://www.instagram.com/${handle}/`,
  display_name: handle,
  bio: null,
  links: [],
  profile_pic_url: null,
  is_verified: false,
  metrics: { followers: 10, following: 1, posts: 1, engagement_rate: null, avg_likes: null, avg_comments: null, account_type: null },
  linked_accounts: [],
})

const youtube: ProfileSource = { fetch: async (handle) => ytProfile(handle, 5_000) }
const instagram: ProfileSource = { fetch: async (handle) => igProfile(handle) }

describe('several connected platforms', () => {
  beforeEach(() => {
    resetWorkspace()
    setPlatformData(memoryPlatformData())
  })
  afterEach(() => {
    clearProfileSources()
    setPlatformData(null)
  })

  it('lists each connected platform; Instagram alone answers as before', async () => {
    setProfileSource('instagram', instagram)
    expect((await api('GET', '/integrations')).body).toEqual({ profile_lookup: ['instagram'] })
    setProfileSource('youtube', youtube)
    expect((await api('GET', '/integrations')).body).toEqual({ profile_lookup: ['instagram', 'youtube'] })
    setProfileSource('instagram', null)
    expect((await api('GET', '/integrations')).body).toEqual({ profile_lookup: ['youtube'] })
  })

  it('looks up and syncs through the platform’s own source', async () => {
    setProfileSource('youtube', youtube)
    const job = await runJob('POST', '/lookup', { body: { platform: 'youtube', username: 'youtube.com/@Riya' } })
    expect(job.result).toMatchObject({ platform: 'youtube', handle: 'riya', metrics: { subscribers: 5_000 } })
    const ig = await runJob('POST', '/lookup', { body: { platform: 'instagram', username: 'riya' } })
    expect(ig.error?.code).toBe('not_connected')

    const res = await addInfluencer('riya', { body: { accounts: [{ platform: 'youtube', handle: 'riya' }] } })
    const acc = res.body.accounts[0]
    expect(acc).toMatchObject({ sync_method: 'lookup', sync_status: 'pending' })
    expect((await runJob('POST', `/accounts/${acc.id}/sync`)).status).toBe('succeeded')
    expect(db.influencers.find((i) => i.id === res.body.id)!.total_reach).toBe(5_000)
    expect((await api('GET', `/accounts/${acc.id}/snapshots`)).body.items).toHaveLength(1)
  })

  it('hidden subscribers keep the last known count and record no history', async () => {
    setProfileSource('youtube', { fetch: async (handle) => ytProfile(handle, null) })
    const res = await addInfluencer('riya', {
      body: { accounts: [{ platform: 'youtube', handle: 'riya', sync_method: 'manual', metrics: { subscribers: 700 } }] },
    })
    const id = res.body.accounts[0].id
    expect((await api('PATCH', `/accounts/${id}`, { body: { sync_method: 'lookup' } })).status).toBe(200)
    await runJob('POST', `/accounts/${id}/sync`)
    const a = db.influencers.find((i) => i.id === res.body.id)!.accounts[0]!
    expect(a.metrics).toMatchObject({ subscribers: 700, total_views: 1_000 })
    expect((await api('GET', `/accounts/${id}/snapshots`)).body.items).toEqual([])
  })

  it('admin Sync profiles queues every connected platform’s accounts, and nothing else', async () => {
    setProfileSource('instagram', instagram)
    setProfileSource('youtube', youtube)
    await addInfluencer('riya', {
      body: {
        accounts: [
          { platform: 'instagram', handle: 'riya', sync_method: 'manual' },
          { platform: 'youtube', handle: 'riya', sync_method: 'manual' },
          { platform: 'tiktok', handle: 'riya' },
        ],
      },
    })
    const manager = await addMember('manager')
    expect((await api('POST', '/integrations/sync-all', { as: manager.id })).status).toBe(403)
    const res = await api('POST', '/integrations/sync-all', { as: ADMIN })
    expect(res.body).toEqual({ queued: 2, switched: 2 })
    const byPlatform = Object.fromEntries(db.influencers[0]!.accounts.map((a) => [a.platform, a.sync_status]))
    expect(byPlatform).toEqual({ instagram: 'pending', youtube: 'pending', tiktok: 'not_synced' })
    clearProfileSources()
    expect((await api('POST', '/integrations/sync-all', { as: ADMIN })).status).toBe(409)
    expect((await api('POST', '/settings/instagram/sync-all', { as: ADMIN })).status).toBe(404)
  })

  it('each background loop picks only its own platform’s accounts', async () => {
    await addInfluencer('riya', {
      body: { accounts: [{ platform: 'instagram', handle: 'riya' }, { platform: 'youtube', handle: 'riyatube' }] },
    })
    expect(dueAccount('youtube', Date.now())?.handle).toBe('riyatube')
    expect(dueAccount('instagram', Date.now())?.handle).toBe('riya')
    expect(dueAccount('threads', Date.now())).toBeNull()
  })
})

describe('YouTube links', () => {
  beforeEach(() => resetWorkspace())
  afterEach(() => clearProfileSources())

  it('channel ids keep their case and link to /channel/; legacy /c/ and /user/ names become handles', async () => {
    expect(normalizeHandle('https://www.youtube.com/@RiyaVlogs/videos', 'youtube')).toBe('riyavlogs')
    const id = 'UClvPVnx6LN8l0XNtO2gnwMQ'
    expect(normalizeHandle(`https://www.youtube.com/channel/${id} `, 'youtube')).toBe(id)
    expect(PLATFORM_META.youtube.url(id)).toBe(`https://www.youtube.com/channel/${id}`)
    expect(normalizeHandle('youtube.com/c/RiyaVlogs', 'youtube')).toBe('riyavlogs')
    expect(normalizeHandle('https://www.youtube.com/user/riya', 'youtube')).toBe('riya')
    // Still never offered as linked accounts, and video links aren't profiles.
    for (const link of [`https://www.youtube.com/channel/${id}`, 'youtube.com/c/RiyaVlogs', 'https://www.youtube.com/watch?v=abc123']) {
      expect(platformOfUrl(link)).toBeNull()
    }
    // Facebook profile links keep their numeric id, so two creators never share the handle "people".
    expect(normalizeHandle('https://www.facebook.com/people/Arti-Sharma/100063723456789/', 'facebook')).toBe('100063723456789')
    expect(normalizeHandle('https://m.facebook.com/profile.php?id=1000123', 'facebook')).toBe('1000123')
    expect(platformOfUrl('https://www.facebook.com/people/Arti-Sharma/100063723456789/')).toBeNull()
    // A short link is saved as typed: handles have no format rule.
    expect(handleSchema('youtube').safeParse('yt.openinapp.co/0ru6h').success).toBe(true)
    setProfileSource('youtube', youtube)
    expect((await api('POST', '/lookup', { body: { platform: 'youtube', username: 'https://www.youtube.com/watch?v=abc123' } })).status).toBe(422)
  })

  it('video, post and reel links in a description are not offered as linked accounts', () => {
    const text = 'New: https://www.youtube.com/watch?v=abc123 https://www.instagram.com/p/Cxyz/ instagram.com/reel/Cabc IG: instagram.com/riya.style YT: youtube.com/@riyavlogs'
    expect(findLinkedAccounts([text])).toEqual([
      { platform: 'instagram', handle: 'riya.style', profile_url: 'https://www.instagram.com/riya.style/' },
      { platform: 'youtube', handle: 'riyavlogs', profile_url: 'https://www.youtube.com/@riyavlogs' },
    ])
  })
})

describe("server/youtube.ts: YouTube's answers", () => {
  const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 })
  const fail = (status: number, reason: string, details = false) =>
    new Response(
      JSON.stringify({
        error: details
          ? { code: status, message: 'API key not valid.', errors: [{ reason: 'badRequest' }], details: [{ reason }] }
          : { code: status, message: 'nope', errors: [{ reason }] },
      }),
      { status },
    )

  const channel = {
    items: [
      {
        id: 'UC123',
        snippet: {
          title: ' Riya Vlogs ',
          description: 'Travel vlogs. Insta: instagram.com/riya.style',
          customUrl: '@riyavlogs',
          country: 'in',
          thumbnails: { default: { url: 'https://yt3.ggpht.com/d.jpg' }, high: { url: 'https://yt3.ggpht.com/h.jpg' } },
        },
        statistics: { viewCount: '123456', subscriberCount: '45600', hiddenSubscriberCount: false, videoCount: '87' },
        contentDetails: { relatedPlaylists: { uploads: 'UU123' } },
      },
    ],
  }
  const playlist = { items: [{ contentDetails: { videoId: 'vid_aaaaaa1' } }, { contentDetails: { videoId: 'vid_bbbbbb2' } }, { contentDetails: { videoId: 'vid_cccccc3' } }] }
  const videos = {
    items: [
      // Out of order on purpose; shown newest first.
      { id: 'vid_bbbbbb2', snippet: { publishedAt: '2026-11-10T10:00:00Z', thumbnails: { medium: { url: 'https://i.ytimg.com/b.jpg' } } }, statistics: { viewCount: '300', commentCount: '4' } },
      { id: 'vid_aaaaaa1', snippet: { publishedAt: '2026-11-18T10:00:00Z', thumbnails: { high: { url: 'https://i.ytimg.com/a.jpg' } } }, statistics: { viewCount: '100', likeCount: '20', commentCount: '2' } },
      { id: 'vid_cccccc3', snippet: { publishedAt: '2026-11-25T10:00:00Z', liveBroadcastContent: 'upcoming' }, statistics: { viewCount: '0' } },
    ],
  }

  const stub = (...responses: Response[]) => {
    const spy = vi.spyOn(globalThis, 'fetch')
    for (const r of responses) spy.mockResolvedValueOnce(r)
    return spy
  }
  const url = (spy: ReturnType<typeof stub>, call: number) => new URL(String(spy.mock.calls[call]![0]))

  beforeEach(() => {
    process.env.YOUTUBE_API_KEY = 'test-key'
  })
  afterEach(() => {
    vi.restoreAllMocks()
    delete process.env.YOUTUBE_API_KEY
  })

  it('maps a channel in 3 calls (1 quota unit each), never the search endpoint', async () => {
    const spy = stub(ok(channel), ok(playlist), ok(videos))
    const p = await fetchYouTube('riyavlogs')
    expect(spy).toHaveBeenCalledTimes(3)
    const [c, pl, v] = [url(spy, 0), url(spy, 1), url(spy, 2)]
    expect(c.pathname).toBe('/youtube/v3/channels')
    expect(c.searchParams.get('forHandle')).toBe('@riyavlogs')
    expect(c.searchParams.get('part')).toBe('snippet,statistics,contentDetails')
    expect(c.searchParams.get('key')).toBe('test-key')
    expect(pl.pathname).toBe('/youtube/v3/playlistItems')
    expect(pl.searchParams.get('playlistId')).toBe('UU123')
    expect(pl.searchParams.get('maxResults')).toBe('10')
    expect(v.pathname).toBe('/youtube/v3/videos')
    expect(v.searchParams.get('id')).toBe('vid_aaaaaa1,vid_bbbbbb2,vid_cccccc3')
    expect(spy.mock.calls.some(([u]) => String(u).includes('/search'))).toBe(false)

    expect(p).toMatchObject({
      platform: 'youtube',
      handle: 'riyavlogs',
      profile_url: 'https://www.youtube.com/@riyavlogs',
      display_name: 'Riya Vlogs',
      bio: 'Travel vlogs. Insta: instagram.com/riya.style',
      links: ['https://www.youtube.com/@riyavlogs'],
      profile_pic_url: 'https://yt3.ggpht.com/h.jpg',
      linked_accounts: [{ platform: 'instagram', handle: 'riya.style' }],
    })
    // Average of the two published videos (the upcoming stream is left out): (100 + 300) / 2.
    expect(p.metrics).toEqual({ subscribers: 45_600, total_views: 123_456, video_count: 87, avg_views_recent: 200, channel_country: 'IN' })
    expect(p.recent_posts).toEqual([
      { thumbnail: 'https://i.ytimg.com/a.jpg', permalink: 'https://www.youtube.com/watch?v=vid_aaaaaa1', likes: 20, comments: 2, posted_at: '2026-11-18T10:00:00.000Z' },
      // Hidden likes: null.
      { thumbnail: 'https://i.ytimg.com/b.jpg', permalink: 'https://www.youtube.com/watch?v=vid_bbbbbb2', likes: null, comments: 4, posted_at: '2026-11-10T10:00:00.000Z' },
    ])
  })

  it('hidden subscriber counts come back as null; a channel without videos costs one call', async () => {
    const hidden = structuredClone(channel)
    Object.assign(hidden.items[0]!.statistics, { hiddenSubscriberCount: true, subscriberCount: '0', videoCount: '0' })
    const spy = stub(ok(hidden))
    const p = await fetchYouTube('riyavlogs')
    expect(spy).toHaveBeenCalledTimes(1)
    expect(p.metrics).toMatchObject({ subscribers: null, avg_views_recent: null })
    expect(p.recent_posts).toEqual([])
  })

  it('turns YouTube errors into the lookup errors the screens explain', async () => {
    stub(ok({ items: [] }))
    await expect(fetchYouTube('nobody')).rejects.toMatchObject({ code: 'not_found' })
    stub(fail(403, 'rateLimitExceeded'))
    await expect(fetchYouTube('riya')).rejects.toMatchObject({ code: 'rate_limited' })
    expect(youtubeQuotaResetAt()).toBe(0)
    stub(fail(400, 'keyInvalid'))
    await expect(fetchYouTube('riya')).rejects.toMatchObject({ code: 'not_connected' })
    stub(fail(400, 'API_KEY_INVALID', true))
    await expect(fetchYouTube('riya')).rejects.toMatchObject({ code: 'not_connected' })
    stub(fail(403, 'accessNotConfigured'))
    await expect(fetchYouTube('riya')).rejects.toMatchObject({ code: 'not_connected' })
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    stub(fail(500, 'backendError'))
    await expect(fetchYouTube('riya')).rejects.toMatchObject({ code: 'unavailable' })
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new TypeError('network'))
    await expect(fetchYouTube('riya')).rejects.toMatchObject({ code: 'unavailable' })
  })

  it('a used-up daily quota is rate limited until midnight Pacific time', async () => {
    stub(fail(403, 'quotaExceeded'))
    const before = Date.now()
    await expect(fetchYouTube('riya')).rejects.toMatchObject({ code: 'rate_limited' })
    expect(youtubeQuotaResetAt()).toBeGreaterThan(before)
    expect(youtubeQuotaResetAt()).toBeLessThanOrEqual(before + 25 * 3600_000 + 60_000)
    // 23:00 PST on 19/11 (07:00 UTC on 20/11): one hour to go, plus a minute's margin.
    expect(untilPacificMidnight(Date.parse('2026-11-20T07:00:00Z'))).toBe(3600_000 + 60_000)
    // 00:00 PDT on 01/07 (07:00 UTC): a full day.
    expect(untilPacificMidnight(Date.parse('2026-07-01T07:00:00Z'))).toBe(24 * 3600_000 + 60_000)
  })

  it('the background sync stops for the day at 8,000 units, keeping the rest for Look up and Sync now', async () => {
    // 12:00 PST on 15/01/2030: a quota day no other test spent units on.
    vi.useFakeTimers({ toFake: ['Date'] }).setSystemTime(new Date('2030-01-15T20:00:00Z'))
    try {
      vi.spyOn(globalThis, 'fetch').mockImplementation(async () => ok({ items: [{ id: 'UC1' }] }))
      const now = Date.now()
      expect(youtubeUnitsToday()).toBe(0)
      for (let i = 0; i < YOUTUBE_BACKGROUND_UNITS - 1; i++) await checkYouTube()
      expect(youtubeUnitsToday()).toBe(7_999)
      expect(youtubeBackgroundHoldUntil(now)).toBe(0)
      await checkYouTube()
      // Until midnight Pacific (12 h), plus a minute's margin.
      expect(youtubeBackgroundHoldUntil(now)).toBe(now + 12 * 3600_000 + 60_000)
      // Lookups still run: the quota itself isn't used up.
      await expect(checkYouTube()).resolves.toBeUndefined()
      // 00:30 PST the next day: a new quota day.
      vi.setSystemTime(new Date('2030-01-16T08:30:00Z'))
      expect(youtubeUnitsToday()).toBe(0)
      expect(youtubeBackgroundHoldUntil()).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('never sends a request for a handle YouTube cannot have; a failed playlist read is fatal only when not "not found"', async () => {
    const spy = stub()
    await expect(fetchYouTube('a')).rejects.toMatchObject({ code: 'not_found' })
    await expect(fetchYouTube('bad handle!')).rejects.toMatchObject({ code: 'not_found' })
    expect(spy).not.toHaveBeenCalled()
    stub(ok(channel), fail(404, 'playlistNotFound'))
    const p = await fetchYouTube('riyavlogs')
    expect(p.recent_posts).toEqual([])
    expect(p.metrics).toMatchObject({ subscribers: 45_600 })
  })
})
