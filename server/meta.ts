import { JobFailure } from '@/backend/jobs'
import type { ProfileSource } from '@/backend/social'
import { PLATFORM_META } from '@/lib/platforms'
import type { LookupProfile, MediaItem } from '@/types'

// Instagram through Meta's Graph API ("Business Discovery"): a creator's public profile and recent posts, looked up
// by handle through our own Instagram professional account (META_IG_USER_ID, e.g. @velzaglobalin). Needs
// META_ACCESS_TOKEN: a Page token (never expires) or user token with instagram_basic, instagram_manage_insights,
// pages_read_engagement, pages_show_list (+ business_management and ads_read when the Page is in a Business
// portfolio). Only Business and Creator accounts can be looked up; personal ones answer "not found".

const GRAPH = 'https://graph.facebook.com/v21.0'
/** Posts averaged for likes, comments and engagement rate. */
const RECENT_POSTS = 12

const token = () => process.env.META_ACCESS_TOKEN?.trim() ?? ''
const igUserId = () => process.env.META_IG_USER_ID?.trim() ?? ''

export const metaConfigured = () => !!token() && !!igUserId()
/** Facebook Pages need only the token. */
export const metaTokenSet = () => !!token()

/** Share (0–100) of Meta's hourly call allowance used, from the last response's X-App-Usage header. */
let usagePct = 0
export const metaUsagePct = () => usagePct

export interface GraphError {
  message?: string
  code?: number
  error_subcode?: number
}

interface Discovery {
  username: string
  name?: string
  biography?: string
  website?: string
  followers_count?: number
  follows_count?: number
  media_count?: number
  profile_picture_url?: string
  media?: { data?: DiscoveryMedia[] }
}

/** One recent post. Videos carry `thumbnail_url` (no `media_url`); images and carousels `media_url` (verified 20/11/2026). */
interface DiscoveryMedia {
  permalink?: string
  media_type?: string
  media_url?: string
  thumbnail_url?: string
  timestamp?: string
  like_count?: number
  comments_count?: number
}

/**
 * One Graph API GET with META_ACCESS_TOKEN (Instagram and Facebook Pages share the app and its hourly allowance).
 * Returns the body, or throws `toFailure(error)`. The token never appears in errors or logs.
 */
export async function metaGet<T>(path: string, fields: string, label: string, toFailure: (e: GraphError) => JobFailure): Promise<T> {
  const url = `${GRAPH}${path}?fields=${encodeURIComponent(fields)}&access_token=${encodeURIComponent(token())}`
  let res: Response
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(20_000) })
  } catch {
    throw new JobFailure('unavailable', `${label} didn’t answer. Try again in a minute.`)
  }
  const usage = res.headers.get('x-app-usage')
  if (usage) {
    try {
      const u = JSON.parse(usage) as { call_count?: number; total_time?: number; total_cputime?: number }
      usagePct = Math.max(u.call_count ?? 0, u.total_time ?? 0, u.total_cputime ?? 0)
    } catch {
      // Unreadable header: keep the last known value.
    }
  }
  const body = (await res.json().catch(() => ({}))) as T & { error?: GraphError }
  if (res.ok && !body.error) return body
  throw toFailure(body.error ?? {})
}

/** A Meta rate limit (4, 17, 32, 613, 80002: app, user, page, custom, Instagram), as the app's error; else null. */
export function metaRateLimit(e: GraphError): JobFailure | null {
  if (![4, 17, 32, 613, 80002].includes(e.code ?? 0)) return null
  usagePct = Math.max(usagePct, 100)
  return new JobFailure('rate_limited', 'Too many lookups right now. Wait a few minutes, then try again.')
}

const graph = <T>(path: string, fields: string) => metaGet<T>(path, fields, 'Instagram', toFailure)

/** Meta's error codes as the app's lookup errors (the Add influencer screen explains each). */
function toFailure(e: GraphError): JobFailure {
  const limited = metaRateLimit(e)
  if (limited) return limited
  // 110 / 2207013: no professional account with that username (missing, or a personal profile).
  if (e.code === 110 || e.error_subcode === 2207013) {
    return new JobFailure('not_found', 'No Business or Creator account has that username. Personal profiles can’t be looked up.')
  }
  if (e.code === 190) return new JobFailure('not_connected', 'The Instagram connection has expired. An admin needs to renew META_ACCESS_TOKEN.')
  if (e.code === 10 || e.code === 200) {
    return new JobFailure('not_connected', 'The Instagram connection is missing a permission. An admin needs to renew META_ACCESS_TOKEN.')
  }
  console.error('Instagram lookup failed', { code: e.code, subcode: e.error_subcode, message: e.message })
  return new JobFailure('unavailable', 'Instagram couldn’t be reached. Try again later.')
}

const mean = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null)

const count = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v) : null)

/** Links the app shows (as href / img src): https only. */
const https = (url: string | undefined) => (url && url.startsWith('https://') ? url : null)

/** Recent posts as the app keeps them, newest first. A post without a link or date is left out. */
function toMediaItems(posts: DiscoveryMedia[]): MediaItem[] {
  return posts.flatMap((p) => {
    const at = p.timestamp ? Date.parse(p.timestamp) : NaN
    const permalink = https(p.permalink)
    if (!permalink || Number.isNaN(at)) return []
    return [
      {
        thumbnail: https(p.thumbnail_url) ?? (p.media_type === 'VIDEO' ? null : https(p.media_url)),
        permalink,
        // Hidden like counts leave like_count out.
        likes: count(p.like_count),
        comments: count(p.comments_count),
        posted_at: new Date(at).toISOString(),
      },
    ]
  })
}

/** A creator's public profile and the stats the CRM keeps for Instagram. */
export async function fetchInstagram(handle: string): Promise<LookupProfile> {
  if (!/^[a-z0-9._]{1,30}$/.test(handle)) throw new JobFailure('not_found', 'That isn’t a valid Instagram username.')
  const fields = `business_discovery.username(${handle}){username,name,biography,website,followers_count,follows_count,media_count,profile_picture_url,media.limit(${RECENT_POSTS}){permalink,media_type,media_url,thumbnail_url,timestamp,like_count,comments_count}}`
  const { business_discovery: d } = await graph<{ business_discovery?: Discovery }>(`/${igUserId()}`, fields)
  if (!d) throw new JobFailure('not_found', 'No Business or Creator account has that username.')
  // Posts with hidden like counts leave like_count out; they don't count towards the averages.
  const posts = d.media?.data ?? []
  const likes = mean(posts.flatMap((p) => (typeof p.like_count === 'number' ? [p.like_count] : [])))
  const comments = mean(posts.flatMap((p) => (typeof p.comments_count === 'number' ? [p.comments_count] : [])))
  const followers = d.followers_count ?? null
  const engagement = followers && likes !== null ? Math.round((((likes + (comments ?? 0)) / followers) * 100) * 100) / 100 : null
  const username = d.username.toLowerCase()
  return {
    platform: 'instagram',
    handle: username,
    profile_url: PLATFORM_META.instagram.url(username),
    display_name: d.name?.trim() || username,
    bio: d.biography?.trim() || null,
    links: d.website ? [d.website] : [],
    profile_pic_url: d.profile_picture_url ?? null,
    // Not in Business Discovery's public fields.
    is_verified: false,
    metrics: {
      followers,
      following: d.follows_count ?? null,
      posts: d.media_count ?? null,
      engagement_rate: engagement,
      avg_likes: likes === null ? null : Math.round(likes),
      avg_comments: comments === null ? null : Math.round(comments),
      account_type: null,
    },
    linked_accounts: [],
    recent_posts: toMediaItems(posts),
  } as LookupProfile
}

/** Our own Instagram account (Settings → Instagram shows it). */
export async function fetchBusinessAccount(): Promise<{ username: string; ig_user_id: string }> {
  const me = await graph<{ id: string; username: string }>(`/${igUserId()}`, 'id,username')
  return { username: me.username, ig_user_id: me.id }
}

export const instagramSource: ProfileSource = { fetch: fetchInstagram }
