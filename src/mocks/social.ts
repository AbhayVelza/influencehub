import { emptyMetrics, findLinkedAccounts, LOOKUP_PLATFORMS, normalizeHandle, PLATFORM_META } from '@/lib/platforms'
import type { AccountCreate, Influencer, LookupProfile, Platform, PlatformMetrics, SocialAccount, SyncResult } from '@/types'
import { db, findAccount, logActivity, nextId, nowIso, refreshDerived } from './db'
import { JobFailure } from './jobs'

// Social accounts in the mock: building them, the simulated public lookup and syncs, connect-link expiry.

function hash(text: string): number {
  let h = 0
  for (let i = 0; i < text.length; i++) h = (Math.imul(31, h) + text.charCodeAt(i)) | 0
  return Math.abs(h)
}

function titleCase(username: string): string {
  return username
    .replace(/[._\-\d]+/g, ' ')
    .trim()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

/** Only the platform's own metric keys survive (anything else in the body is dropped). */
function cleanMetrics(platform: Platform, metrics: Record<string, unknown> | undefined) {
  const out: Record<string, unknown> = emptyMetrics(platform)
  for (const def of PLATFORM_META[platform].metrics) {
    const v = metrics?.[def.key]
    if (v === undefined) continue
    if (v === null) out[def.key] = null
    else if (def.format === 'count' && typeof v === 'number' && Number.isFinite(v) && v >= 0) out[def.key] = Math.round(v)
    else if (def.format === 'percent' && typeof v === 'number' && Number.isFinite(v)) out[def.key] = v
    else if (def.format !== 'count' && def.format !== 'percent' && typeof v === 'string') out[def.key] = v
  }
  return out
}

export const metricsFor = <P extends Platform>(platform: P, metrics: Record<string, unknown> | undefined) =>
  cleanMetrics(platform, metrics) as unknown as PlatformMetrics[P]

/**
 * A new account. Lookup data passed along (metrics present) is saved as synced; a lookup account without it is
 * `pending` until synced. Connect accounts start `not_connected`; manual ones are never synced.
 */
export function buildAccount(inf: Pick<Influencer, 'id' | 'name'>, body: AccountCreate, isPrimary: boolean): SocialAccount {
  const platform = body.platform
  const handle = normalizeHandle(body.handle, platform)
  const method = body.sync_method === 'manual' ? 'manual' : PLATFORM_META[platform].defaultSyncMethod
  const fromLookup = method === 'lookup' && body.metrics !== undefined
  const now = nowIso()
  return {
    id: nextId('acc'),
    influencer_id: inf.id,
    platform,
    handle,
    profile_url: PLATFORM_META[platform].url(handle),
    is_primary: isPrimary,
    sync_method: method,
    sync_status: method === 'lookup' ? (fromLookup ? 'synced' : 'pending') : 'not_synced',
    last_synced_at: fromLookup ? now : null,
    connect_status: method === 'connect' ? 'not_connected' : null,
    connect_link_expires_at: null,
    display_name: body.display_name ?? inf.name,
    profile_pic_url: body.profile_pic_url ?? null,
    bio: body.bio ?? null,
    links: Array.isArray(body.links) ? body.links.filter((l) => typeof l === 'string') : [],
    is_verified: !!body.is_verified,
    metrics: metricsFor(platform, body.metrics as Record<string, unknown> | undefined),
    created_at: now,
  } as SocialAccount
}

/** Deterministic public profile for any username; "personal", "notfound" and "ratelimit" simulate the failures. */
export function lookupProfile(platform: Platform, username: string): LookupProfile {
  if (!LOOKUP_PLATFORMS.includes(platform)) {
    throw new JobFailure('not_supported', `${PLATFORM_META[platform].label} can’t be looked up`)
  }
  if (username.includes('ratelimit')) {
    throw new JobFailure('rate_limited', `${PLATFORM_META[platform].label} rate limit reached. Try again in a few minutes.`)
  }
  if (username.includes('notfound')) throw new JobFailure('not_found', `No ${PLATFORM_META[platform].label} account found for @${username}`)
  if (username.includes('personal') && (platform === 'instagram' || platform === 'facebook')) {
    throw new JobFailure(
      'personal_account',
      platform === 'facebook'
        ? `@${username} is a personal Facebook profile. Only public Pages can be looked up — add it manually.`
        : `@${username} is a personal account. Instagram only shares data for Business and Creator accounts — add details manually.`,
    )
  }
  const h = hash(`${platform}:${username}`)
  const audience = 4000 + (h % 900_000)
  // Every other profile links its "other" channel in the bio, like most creators do.
  const other: Platform = platform === 'youtube' ? 'instagram' : 'youtube'
  const linksOther = h % 2 === 0 || username.includes('multi')
  const links = linksOther ? [PLATFORM_META[other].url(username)] : []
  const bio = `Creator • Collabs via DM${linksOther ? ` | ${PLATFORM_META[other].label}: ${links[0]!.replace(/^https:\/\/(www\.)?/, '')}` : ''}`
  const metrics: Record<Platform, Record<string, unknown>> = {
    instagram: {
      followers: audience,
      following: 150 + (h % 1500),
      posts: 80 + (h % 2000),
      engagement_rate: Math.round((1 + (h % 700) / 100) * 100) / 100,
      avg_likes: Math.round(audience * 0.03),
      avg_comments: Math.round(audience * 0.001),
      account_type: h % 3 === 0 ? 'business' : 'creator',
    },
    youtube: {
      subscribers: audience,
      total_views: audience * (40 + (h % 80)),
      video_count: 20 + (h % 400),
      avg_views_recent: Math.round(audience * 0.2),
      channel_country: 'IN',
    },
    threads: { followers: audience, avg_likes_recent: Math.round(audience * 0.004), avg_replies_recent: 3 + (h % 40) },
    facebook: { page_followers: audience, page_likes: Math.round(audience * 0.86), page_category: 'Digital creator' },
    tiktok: {},
    pinterest: {},
    linkedin: {},
    snapchat: {},
  }
  return {
    platform,
    handle: username,
    profile_url: PLATFORM_META[platform].url(username),
    display_name: titleCase(username) || username,
    bio,
    links,
    profile_pic_url: `https://i.pravatar.cc/300?u=${platform}-${username}`,
    is_verified: audience > 700_000,
    metrics: metricsFor(platform, metrics[platform]),
    linked_accounts: findLinkedAccounts([bio, ...links], { platform, handle: username }),
  } as LookupProfile
}

/** Applied when an account's sync job finishes. Lookup accounts, and connect accounts once connected. */
export function syncAccount(accountId: string): SyncResult {
  const found = findAccount(accountId)
  if (!found) throw new JobFailure('not_found', 'Account no longer exists')
  const { influencer: inf, account } = found
  const now = nowIso()
  if (account.sync_method === 'connect') {
    // Connected accounts read from the creator's authorised API; nothing else changes in the mock.
    account.sync_status = 'synced'
    account.last_synced_at = now
    return { account_id: account.id, audience: null }
  }
  let profile: LookupProfile
  try {
    profile = lookupProfile(account.platform, account.handle)
  } catch (err) {
    if (err instanceof JobFailure && err.code === 'personal_account') {
      // Can't be looked up: it becomes a manual account.
      account.sync_method = 'manual'
      account.sync_status = 'not_synced'
      if (account.platform === 'instagram') account.metrics.account_type = 'personal'
    } else {
      account.sync_status = 'error'
    }
    inf.updated_at = now
    throw err
  }
  const key = PLATFORM_META[account.platform].audienceKey
  const metrics = account.metrics as Record<string, unknown>
  const previous = metrics[key]
  if (typeof previous === 'number') {
    // Known account: small organic growth since the last sync.
    metrics[key] = Math.round(previous * (1 + Math.random() * 0.01))
  } else {
    account.metrics = profile.metrics as typeof account.metrics
    account.bio = profile.bio
    account.links = profile.links
    account.profile_pic_url = profile.profile_pic_url
    account.is_verified = profile.is_verified
    account.display_name = profile.display_name
  }
  account.sync_status = 'synced'
  account.last_synced_at = now
  inf.updated_at = now
  refreshDerived(inf)
  const audience = (account.metrics as Record<string, unknown>)[key] as number | null
  logActivity(inf.id, 'account_synced', { platform: account.platform, handle: account.handle, audience }, null)
  return { account_id: account.id, audience }
}

/** Connect links lapse after 7 days. The mock runs this before every request, like the backend's scheduled job. */
export function expireConnectLinks(now = Date.now()) {
  for (const inf of db.influencers) {
    for (const a of inf.accounts) {
      if (a.connect_status === 'link_sent' && a.connect_link_expires_at && Date.parse(a.connect_link_expires_at) < now) {
        a.connect_status = 'expired'
      }
    }
  }
}

export const CONNECT_LINK_DAYS = 7
