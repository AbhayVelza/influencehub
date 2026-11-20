import { audienceOf, emptyMetrics, LOOKUP_PLATFORMS, normalizeHandle, PLATFORM_META } from '@/lib/platforms'
import type { AccountCreate, Influencer, LookupProfile, Platform, PlatformMetrics, SocialAccount, SyncResult } from '@/types'
import { db, findAccount, nextId, nowIso, refreshDerived } from './db'
import { JobFailure } from './jobs'

// Social accounts: building them, connect-link expiry, lookup and sync.

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

// Lookup and sync go through a profile source: the API server registers one per connected platform (server/meta.ts:
// Instagram via Meta's Business Discovery). Without one (prototype mode, other platforms) they fail the way a real
// integration does when it isn't available, instead of inventing numbers.

/** Fetches a public profile; throws JobFailure (`not_found`, `personal_account`, `rate_limited`, `not_connected`). */
export interface ProfileSource {
  platforms: Platform[]
  fetch(platform: Platform, handle: string): Promise<LookupProfile>
}

let source: ProfileSource | null = null

/** The API server's platform connection (null in prototype mode). */
export function setProfileSource(next: ProfileSource | null) {
  source = next
}

/** Platforms whose profiles can be looked up and synced right now. */
export const connectedPlatforms = (): Platform[] => source?.platforms ?? []

const NOT_CONNECTED = 'Profile lookup isn’t connected yet. Add the account and type in its stats instead.'

function sourceFor(platform: Platform): ProfileSource {
  if (!LOOKUP_PLATFORMS.includes(platform)) {
    throw new JobFailure('not_supported', `${PLATFORM_META[platform].label} can’t be looked up`)
  }
  if (!source || !source.platforms.includes(platform)) throw new JobFailure('not_connected', NOT_CONNECTED)
  return source
}

/** Public profile lookup (Add influencer → Look up). */
export async function lookupProfile(platform: Platform, username: string): Promise<LookupProfile> {
  return sourceFor(platform).fetch(platform, normalizeHandle(username, platform))
}

/** Puts a fetched profile on an account: picture, name, bio, links and stats; marks it synced. */
/** An email address written in a bio ("Collabs: name@mail.com"). */
const BIO_EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/

/**
 * Applies a looked-up profile to an account. Platforms don't share a creator's email, category or city; an email
 * written in the bio fills the influencer's email when it has none (never replaces one the team entered).
 */
export function applyProfile(influencer: Influencer, account: SocialAccount, profile: LookupProfile) {
  const email = profile.bio?.match(BIO_EMAIL)?.[0]
  if (email && !influencer.email) influencer.email = email.toLowerCase()
  account.display_name = profile.display_name || account.display_name
  account.profile_pic_url = profile.profile_pic_url
  account.bio = profile.bio
  account.links = profile.links
  account.is_verified = profile.is_verified || account.is_verified
  // Stats the platform didn't return (null) keep their last known value.
  const fresh = Object.fromEntries(Object.entries(profile.metrics).filter(([, v]) => v !== null && v !== undefined))
  account.metrics = metricsFor(account.platform, { ...account.metrics, ...fresh }) as typeof account.metrics
  account.sync_status = 'synced'
  account.last_synced_at = nowIso()
}

/** Refreshes one account's stats now (Sync now). The account is left as it was when the platform refuses. */
export async function syncAccount(accountId: string): Promise<SyncResult> {
  const found = findAccount(accountId)
  if (!found) throw new JobFailure('not_found', 'Account no longer exists')
  const { account } = found
  let profile: LookupProfile
  try {
    profile = await sourceFor(account.platform).fetch(account.platform, account.handle)
  } catch (err) {
    if (err instanceof JobFailure && err.code !== 'not_connected' && err.code !== 'not_supported' && err.code !== 'rate_limited') {
      account.sync_status = 'error'
    }
    throw err
  }
  // The account may have been removed or changed while the platform answered.
  const now = findAccount(accountId)
  if (!now) throw new JobFailure('not_found', 'Account no longer exists')
  applyProfile(now.influencer, now.account, profile)
  refreshDerived(now.influencer)
  return { account_id: accountId, audience: audienceOf(now.account) }
}

/**
 * A manual account (stats typed in) handed to auto-sync: it becomes a lookup account, queued for the background sync;
 * its typed-in stats stay until the platform's replace them. False when its platform isn't connected.
 */
export function switchToAutoSync(account: SocialAccount): boolean {
  if (account.sync_method !== 'manual' || !connectedPlatforms().includes(account.platform)) return false
  account.sync_method = 'lookup'
  account.last_synced_at = null
  return queueSync([account]) === 1
}

/**
 * Marks accounts for the API server's background sync (bulk Sync now, CSV import with "Fetch public profiles"). Only
 * accounts on a connected platform; returns how many were queued.
 */
export function queueSync(accounts: SocialAccount[]): number {
  let queued = 0
  for (const a of accounts) {
    if (!connectedPlatforms().includes(a.platform) || a.sync_method !== 'lookup') continue
    a.sync_status = 'pending'
    queued += 1
  }
  return queued
}

/** Connect links lapse after 7 days. Runs before every request (there is no scheduler without a server). */
/** Returns how many links it expired (the API server saves after a read only when something changed). */
export function expireConnectLinks(now = Date.now()): number {
  let expired = 0
  for (const inf of db.influencers) {
    for (const a of inf.accounts) {
      if (a.connect_status === 'link_sent' && a.connect_link_expires_at && Date.parse(a.connect_link_expires_at) < now) {
        a.connect_status = 'expired'
        expired += 1
      }
    }
  }
  return expired
}

export const CONNECT_LINK_DAYS = 7
