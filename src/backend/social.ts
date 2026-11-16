import { emptyMetrics, LOOKUP_PLATFORMS, normalizeHandle, PLATFORM_META } from '@/lib/platforms'
import type { AccountCreate, Influencer, LookupProfile, Platform, PlatformMetrics, SocialAccount, SyncResult } from '@/types'
import { db, findAccount, nextId, nowIso } from './db'
import { JobFailure } from './jobs'

// Social accounts: building them, connect-link expiry, and the (not yet connected) lookup and sync.

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

// No social-platform API is connected yet, so nothing is looked up or synced: the accounts keep the stats people
// type in. These fail the way a real integration would when it isn't available, instead of inventing numbers.

const NOT_CONNECTED = 'Profile lookup isn’t connected yet. Add the account and type in its stats instead.'

/** Public profile lookup. Not available until a platform API is connected. */
export function lookupProfile(platform: Platform, _username: string): LookupProfile {
  if (!LOOKUP_PLATFORMS.includes(platform)) {
    throw new JobFailure('not_supported', `${PLATFORM_META[platform].label} can’t be looked up`)
  }
  throw new JobFailure('not_connected', NOT_CONNECTED)
}

/** Refreshing an account's stats. Not available until a platform API is connected; the account is left as it is. */
export function syncAccount(accountId: string): SyncResult {
  if (!findAccount(accountId)) throw new JobFailure('not_found', 'Account no longer exists')
  throw new JobFailure('not_connected', 'Syncing isn’t connected yet. Edit the account’s stats by hand for now.')
}

/** Connect links lapse after 7 days. Runs before every request (there is no scheduler without a server). */
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
