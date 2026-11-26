import { JobFailure } from '@/backend/jobs'
import type { ProfileSource } from '@/backend/social'
import { findLinkedAccounts, PLATFORM_META, YOUTUBE_CHANNEL_ID, YOUTUBE_VIDEO_HANDLE } from '@/lib/platforms'
import type { LookupProfile, MediaItem } from '@/types'

// YouTube through the YouTube Data API v3, with an API key (YOUTUBE_API_KEY; docs/server.md, "YouTube"). A channel
// costs 3 quota units of the 10,000 a day: channels.list by handle (1), its uploads playlist's latest 10 items (1) and
// those videos' stats (1). The 100-unit search endpoint is never used. The daily quota resets at midnight Pacific time.

const API = 'https://www.googleapis.com/youtube/v3'
/** Videos averaged for "Avg views (last 10)" and shown as recent videos. */
const RECENT_VIDEOS = 10

const apiKey = () => process.env.YOUTUBE_API_KEY?.trim() ?? ''

export const youtubeConfigured = () => !!apiKey()

/** When the daily quota ran out: no calls until then (ms since epoch; 0 = available). */
let quotaResetAt = 0
export const youtubeQuotaResetAt = () => quotaResetAt

/**
 * The background sync stops for the day once this process has spent this many units, so the rest (~660 channels) stays
 * for Look up, Sync now and CSV "Fetch public profiles" instead of every one of them answering "rate limited".
 */
export const YOUTUBE_BACKGROUND_UNITS = 8_000

const pacificDay = (now: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(new Date(now))
/** Units this process spent on YouTube's current quota day (each Data API request costs 1). Starts at 0 on restart. */
let spent = { day: '', units: 0 }

export function youtubeUnitsToday(now = Date.now()): number {
  return spent.day === pacificDay(now) ? spent.units : 0
}

function spendUnit(now = Date.now()) {
  const day = pacificDay(now)
  spent = { day, units: (spent.day === day ? spent.units : 0) + 1 }
}

/** Until when the background sync waits (ms since epoch; 0 = go): the quota is used up, or its share of it is. */
export function youtubeBackgroundHoldUntil(now = Date.now()): number {
  if (quotaResetAt > now) return quotaResetAt
  return youtubeUnitsToday(now) >= YOUTUBE_BACKGROUND_UNITS ? now + untilPacificMidnight(now) : 0
}

/** Milliseconds until the next midnight in America/Los_Angeles (YouTube's quota day), plus a minute's margin. */
export function untilPacificMidnight(now = Date.now()): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    hourCycle: 'h23',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  }).formatToParts(new Date(now))
  const part = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0)
  const elapsed = ((part('hour') * 60 + part('minute')) * 60 + part('second')) * 1000
  return 24 * 3600_000 - elapsed + 60_000
}

interface ApiError {
  code?: number
  message?: string
  errors?: { reason?: string }[]
  details?: { reason?: string }[]
}

interface Thumbnails {
  default?: { url?: string }
  medium?: { url?: string }
  high?: { url?: string }
}

interface Channel {
  id: string
  snippet?: { title?: string; description?: string; customUrl?: string; country?: string; thumbnails?: Thumbnails }
  statistics?: { viewCount?: string; subscriberCount?: string; hiddenSubscriberCount?: boolean; videoCount?: string }
  contentDetails?: { relatedPlaylists?: { uploads?: string } }
}

interface Video {
  id: string
  snippet?: { publishedAt?: string; thumbnails?: Thumbnails; liveBroadcastContent?: string }
  statistics?: { viewCount?: string; likeCount?: string; commentCount?: string }
}

const RATE_LIMITED = ['rateLimitExceeded', 'userRateLimitExceeded', 'RATE_LIMIT_EXCEEDED']
const QUOTA_USED = ['quotaExceeded', 'dailyLimitExceeded']
/** The key is wrong, expired, restricted to other APIs, or the API isn't enabled in its Google Cloud project. */
const KEY_PROBLEMS = [
  'keyInvalid',
  'keyExpired',
  'API_KEY_INVALID',
  'API_KEY_EXPIRED',
  'accessNotConfigured',
  'SERVICE_DISABLED',
  'ipRefererBlocked',
  'API_KEY_SERVICE_BLOCKED',
  'API_KEY_HTTP_REFERRER_BLOCKED',
  'API_KEY_IP_ADDRESS_BLOCKED',
]
const NOT_FOUND = ['channelNotFound', 'playlistNotFound', 'videoNotFound']

/** YouTube's errors as the app's lookup errors. Never includes the key. */
function toFailure(status: number, e: ApiError): JobFailure {
  const reasons = [...(e.errors ?? []), ...(e.details ?? [])].flatMap((r) => (r.reason ? [r.reason] : []))
  const has = (list: string[]) => reasons.some((r) => list.includes(r))
  if (has(QUOTA_USED)) {
    quotaResetAt = Date.now() + untilPacificMidnight()
    return new JobFailure('rate_limited', 'YouTube’s lookups for today are used up. They reset at midnight Pacific time (12:30–13:30 IST).')
  }
  if (has(RATE_LIMITED) || status === 429) {
    return new JobFailure('rate_limited', 'Too many lookups right now. Wait a few minutes, then try again.')
  }
  if (has(KEY_PROBLEMS) || status === 401) {
    return new JobFailure('not_connected', 'The YouTube connection isn’t working. An admin needs to check YOUTUBE_API_KEY.')
  }
  if (has(NOT_FOUND) || status === 404) return new JobFailure('not_found', 'No YouTube channel has that handle.')
  console.error('YouTube lookup failed', { status, reasons, message: e.message })
  return new JobFailure('unavailable', 'YouTube couldn’t be reached. Try again later.')
}

/** One Data API GET. The key travels as the documented `key` parameter; the URL is never logged. */
async function call<T>(resource: string, params: Record<string, string>): Promise<T> {
  const query = new URLSearchParams({ ...params, key: apiKey() })
  spendUnit()
  let res: Response
  try {
    res = await fetch(`${API}/${resource}?${query.toString()}`, { signal: AbortSignal.timeout(20_000) })
  } catch {
    throw new JobFailure('unavailable', 'YouTube didn’t answer. Try again in a minute.')
  }
  const body = (await res.json().catch(() => ({}))) as T & { error?: ApiError }
  if (res.ok && !body.error) return body
  throw toFailure(res.status, body.error ?? {})
}

/** YouTube's counts come as strings ("12345"). */
const count = (v: string | undefined) => {
  const n = v === undefined ? NaN : Number(v)
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null
}

/** Links the app shows (as href / img src): https only. */
const https = (url: string | undefined) => (url && url.startsWith('https://') ? url : null)

const picture = (t: Thumbnails | undefined, order: (keyof Thumbnails)[]) =>
  order.map((size) => https(t?.[size]?.url)).find((url) => url !== null) ?? null

/** The latest uploads, newest first (live and upcoming streams left out: they have no settled views yet). */
async function latestVideos(uploads: string): Promise<Video[]> {
  let ids: string[]
  try {
    const page = await call<{ items?: { contentDetails?: { videoId?: string } }[] }>('playlistItems', {
      part: 'contentDetails',
      playlistId: uploads,
      maxResults: String(RECENT_VIDEOS),
    })
    ids = (page.items ?? []).flatMap((i) => (i.contentDetails?.videoId ? [i.contentDetails.videoId] : []))
  } catch (err) {
    // A channel without public uploads has no uploads playlist to read.
    if (err instanceof JobFailure && err.code === 'not_found') return []
    throw err
  }
  if (!ids.length) return []
  const { items = [] } = await call<{ items?: Video[] }>('videos', { part: 'snippet,statistics', id: ids.join(',') })
  return items
    .filter((v) => v.snippet?.liveBroadcastContent !== 'upcoming' && v.snippet?.liveBroadcastContent !== 'live')
    .sort((a, b) => (b.snippet?.publishedAt ?? '').localeCompare(a.snippet?.publishedAt ?? ''))
}

function toMediaItems(videos: Video[]): MediaItem[] {
  return videos.flatMap((v) => {
    const at = v.snippet?.publishedAt ? Date.parse(v.snippet.publishedAt) : NaN
    if (!/^[\w-]{6,20}$/.test(v.id) || Number.isNaN(at)) return []
    return [
      {
        thumbnail: picture(v.snippet?.thumbnails, ['medium', 'high', 'default']),
        permalink: `https://www.youtube.com/watch?v=${v.id}`,
        // Hidden likes and turned-off comments leave the count out.
        likes: count(v.statistics?.likeCount),
        comments: count(v.statistics?.commentCount),
        posted_at: new Date(at).toISOString(),
      },
    ]
  })
}

/** A channel's public profile and the stats the CRM keeps for YouTube, by handle (without @). */
export async function fetchYouTube(handle: string): Promise<LookupProfile> {
  // A video link (`video:<id>`, platforms.ts): one extra unit finds the video's channel, then the channel as below.
  const fromVideo = YOUTUBE_VIDEO_HANDLE.test(handle)
  if (fromVideo) {
    const { items } = await call<{ items?: { snippet?: { channelId?: string } }[] }>('videos', { part: 'snippet', id: handle.slice(6) })
    const channelId = items?.[0]?.snippet?.channelId
    if (!channelId || !YOUTUBE_CHANNEL_ID.test(channelId)) throw new JobFailure('not_found', 'No public YouTube video has that link.')
    handle = channelId
  }
  // YouTube handles: 3–30 letters, numbers, dots, dashes or underscores.
  const byId = YOUTUBE_CHANNEL_ID.test(handle)
  if (!byId && !/^[a-z0-9._-]{3,30}$/.test(handle)) throw new JobFailure('not_found', 'That isn’t a valid YouTube handle.')
  const { items } = await call<{ items?: Channel[] }>('channels', {
    part: 'snippet,statistics,contentDetails',
    ...(byId ? { id: handle } : { forHandle: `@${handle}` }),
  })
  const channel = items?.[0]
  if (!channel) throw new JobFailure('not_found', 'No YouTube channel has that handle.')
  // Found from a video link: the channel's own @handle (else its id) becomes the account's handle (social.ts applyProfile).
  const own = channel.snippet?.customUrl?.trim().replace(/^@/, '').toLowerCase()
  if (fromVideo && own && /^[a-z0-9._-]{3,30}$/.test(own)) handle = own
  const stats = channel.statistics ?? {}
  const uploads = channel.contentDetails?.relatedPlaylists?.uploads
  const videoCount = count(stats.videoCount)
  const videos = uploads && videoCount !== 0 ? await latestVideos(uploads) : []
  const views = videos.flatMap((v) => {
    const n = count(v.statistics?.viewCount)
    return n === null ? [] : [n]
  })
  const country = channel.snippet?.country?.trim().toUpperCase()
  const bio = channel.snippet?.description?.trim() || null
  const customUrl = channel.snippet?.customUrl?.trim()
  return {
    platform: 'youtube',
    handle,
    profile_url: PLATFORM_META.youtube.url(handle),
    display_name: channel.snippet?.title?.trim() || handle,
    bio,
    links: customUrl ? [`https://www.youtube.com/${customUrl}`] : [],
    profile_pic_url: picture(channel.snippet?.thumbnails, ['high', 'medium', 'default']),
    // Not in the Data API.
    is_verified: false,
    metrics: {
      subscribers: stats.hiddenSubscriberCount ? null : count(stats.subscriberCount),
      total_views: count(stats.viewCount),
      video_count: videoCount,
      avg_views_recent: views.length ? Math.round(views.reduce((a, b) => a + b, 0) / views.length) : null,
      channel_country: country && /^[A-Z]{2}$/.test(country) ? country : null,
    },
    // e.g. an Instagram link in the channel description.
    linked_accounts: findLinkedAccounts([bio], { platform: 'youtube', handle }),
    recent_posts: toMediaItems(videos),
  }
}

/**
 * Start-up check (1 quota unit): the key works and the API is enabled. Throws the lookup error (`not_connected` for a
 * bad key; `rate_limited` / `unavailable` mean the key may be fine).
 */
export async function checkYouTube(): Promise<void> {
  await call('channels', { part: 'id', forHandle: '@youtube' })
}

export const youtubeSource: ProfileSource = { fetch: fetchYouTube }
