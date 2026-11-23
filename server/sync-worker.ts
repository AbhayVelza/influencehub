import { db, findAccount, refreshDerived, nowIso } from '@/backend/db'
import { JobFailure } from '@/backend/jobs'
import { applyProfile, recordSyncedData } from '@/backend/social'
import type { LookupProfile, Platform, SocialAccount, SyncRun } from '@/types'
import { fetchBusinessAccount, fetchInstagram, metaConfigured, metaUsagePct } from './meta'
import { checkYouTube, fetchYouTube, youtubeBackgroundHoldUntil, youtubeConfigured } from './youtube'

// The API server's background sync: one loop per connected platform, each fetching one account at a time at its own
// pace. What's due, in order: accounts queued by Sync now / CSV import / Auto-sync (`pending`), never-synced lookup
// accounts, then those last synced more than 7 days ago (auto-sync; Settings → Instagram, used for every platform).
// Admin "Sync profiles" queues every account as pending, so it refreshes them now, whenever it's clicked.
// Each fetch runs outside the request queue; only applying the result takes a turn, so the app stays responsive.
//
// - Instagram: about every 40 s (~90 an hour, under Meta's hourly allowance), never while Meta reports 75% of it
//   used; each hour with work is a row in Settings → Instagram → Recent runs.
// - YouTube: about every 15 s (~240 an hour; 3 quota units each). It stops for the day once 8,000 of the 10,000 daily
//   units are spent (~2,600 syncs), keeping the rest for Look up and Sync now, or when the quota is used up, until
//   YouTube resets it (midnight Pacific time).

const KEEP_RUNS = 20
/** After "rate limited" or "unavailable", wait this long before the next call. */
const COOL_DOWN_MS = 15 * 60_000
/** After "not connected" (expired token, bad key), wait this long. */
const NOT_CONNECTED_PAUSE_MS = 6 * 3600_000

type InTurn = <T>(task: () => Promise<T>) => Promise<T>
type Save = () => Promise<void>

interface PlatformSync {
  platform: Platform
  label: string
  tickMs: number
  fetch: (handle: string) => Promise<LookupProfile>
  /** A time (ms since epoch) to wait for before the next call, beyond the loop's own pauses; 0 = none. */
  holdUntil?: (now: number) => number
  /** The connection stopped working (expired token, bad key): what to record beside pausing. */
  onNotConnected?: (inTurn: InTurn, save: Save) => Promise<void>
  /** A synced or failed account, inside the turn that saves it. */
  onResult?: (ok: boolean) => void
}

/** Accounts that failed (not found, …): auto-sync tries them again only after a full interval, not on every tick. */
const failedAt = new Map<string, number>()
const timers = new Set<ReturnType<typeof setTimeout>>()
let stopped = false

const intervalMs = () => db.instagramSettings.sync_interval_hours * 3600_000

/** The next account of `platform` the background sync should fetch, or null when none is due. */
export function dueAccount(platform: Platform, now: number): SocialAccount | null {
  let best: { account: SocialAccount; rank: number; at: string } | null = null
  for (const inf of db.influencers) {
    for (const a of inf.accounts) {
      if (a.platform !== platform || a.sync_method !== 'lookup') continue
      const rank = a.sync_status === 'pending' ? 0 : a.last_synced_at === null ? 1 : 2
      // Queued accounts (Sync profiles, Sync now, CSV) go regardless; a failure marks them 'error', so no retry loop.
      if (rank > 0 && (failedAt.get(a.id) ?? 0) > now - intervalMs()) continue
      if (rank === 2 && Date.parse(a.last_synced_at!) > now - intervalMs()) continue
      const at = a.last_synced_at ?? ''
      if (!best || rank < best.rank || (rank === best.rank && at < best.at)) best = { account: a, rank, at }
    }
  }
  return best?.account ?? null
}

/** This hour's run in Settings → Instagram → Recent runs (one row per hour with work). */
function recordInstagramRun(ok: boolean) {
  const settings = db.instagramSettings
  const hour = new Date(Math.floor(Date.now() / 3600_000) * 3600_000).toISOString()
  let run = settings.last_runs.find((r) => r.started_at === hour)
  if (!run) {
    run = { started_at: hour, finished_at: null, status: 'succeeded', synced: 0, failed: 0 } as SyncRun
    settings.last_runs = [run, ...settings.last_runs].slice(0, KEEP_RUNS)
  }
  if (ok) run.synced += 1
  else run.failed += 1
  run.finished_at = nowIso()
  run.status = run.failed === 0 ? 'succeeded' : run.synced === 0 ? 'failed' : 'partial'
  settings.api_usage_pct = Math.min(100, metaUsagePct())
}

const INSTAGRAM: PlatformSync = {
  platform: 'instagram',
  label: 'Instagram',
  tickMs: 40_000,
  fetch: fetchInstagram,
  holdUntil: (now) => (metaUsagePct() >= 75 ? now + COOL_DOWN_MS : 0),
  onNotConnected: async (inTurn, save) =>
    inTurn(async () => {
      db.instagramSettings.connected = false
      db.instagramSettings.token_status = 'expired'
      await save()
    }),
  onResult: recordInstagramRun,
}

const YOUTUBE: PlatformSync = {
  platform: 'youtube',
  label: 'YouTube',
  tickMs: 15_000,
  fetch: fetchYouTube,
  holdUntil: youtubeBackgroundHoldUntil,
}

/** One platform's loop: its own pause, its own pace. */
function startLoop(sync: PlatformSync, inTurn: InTurn, save: Save) {
  let pausedUntil = 0

  async function tick() {
    const now = Date.now()
    if (now < pausedUntil) return
    const hold = sync.holdUntil?.(now) ?? 0
    if (hold > now) {
      pausedUntil = hold
      return
    }
    const target = await inTurn(async () => {
      const a = dueAccount(sync.platform, now)
      return a ? { id: a.id, handle: a.handle } : null
    })
    if (!target) return
    try {
      const profile = await sync.fetch(target.handle)
      await inTurn(async () => {
        const found = findAccount(target.id)
        // Removed, renamed or switched back to manual while the platform answered: drop the result.
        if (!found || found.account.handle !== target.handle || found.account.sync_method !== 'lookup') return
        applyProfile(found.influencer, found.account, profile)
        refreshDerived(found.influencer)
        failedAt.delete(target.id)
        sync.onResult?.(true)
        await save()
        // After the save, so the account's row exists for the history and posts that point at it.
        await recordSyncedData(found.account, profile)
      })
    } catch (err) {
      const code = err instanceof JobFailure ? err.code : 'unavailable'
      if (code === 'rate_limited' || code === 'unavailable') {
        // A used-up daily quota is picked up by holdUntil on the next tick.
        pausedUntil = Date.now() + COOL_DOWN_MS
        return
      }
      if (code === 'not_connected') {
        console.error(`${sync.label} sync paused:`, err instanceof Error ? err.message : err)
        pausedUntil = Date.now() + NOT_CONNECTED_PAUSE_MS
        await sync.onNotConnected?.(inTurn, save)
        return
      }
      // not_found: a personal profile, renamed or deleted account. Marked, and tried again after an interval.
      failedAt.set(target.id, Date.now())
      await inTurn(async () => {
        const found = findAccount(target.id)
        if (found?.account.sync_method !== 'lookup') return
        found.account.sync_status = 'error'
        sync.onResult?.(false)
        await save()
      })
    }
  }

  const schedule = (ms: number) => {
    const timer = setTimeout(() => {
      timers.delete(timer)
      void loop()
    }, ms)
    timer.unref()
    timers.add(timer)
  }
  const loop = async () => {
    if (stopped) return
    await tick().catch((err: unknown) => console.error(`${sync.label} sync failed`, err))
    if (!stopped) schedule(sync.tickMs)
  }
  schedule(5_000)
}

/** Connects Instagram (Settings → Instagram shows the account) and starts its sync loop. False when not configured. */
export async function startInstagramSync(inTurn: InTurn, save: Save): Promise<boolean> {
  if (!metaConfigured()) return false
  try {
    const account = await fetchBusinessAccount()
    await inTurn(async () => {
      Object.assign(db.instagramSettings, { connected: true, business_account: account, token_status: 'valid', token_expires_at: null })
      await save()
    })
    console.log(`Instagram connected: @${account.username}`)
  } catch (err) {
    console.error('Instagram not connected:', err instanceof Error ? err.message : err)
    return false
  }
  startLoop(INSTAGRAM, inTurn, save)
  return true
}

/**
 * Checks YOUTUBE_API_KEY with one 1-unit call and starts YouTube's sync loop. False when the key isn't set or YouTube
 * rejects it; a used-up quota or an outage at start-up still connects (the key may be fine).
 */
export async function startYouTubeSync(inTurn: InTurn, save: Save): Promise<boolean> {
  if (!youtubeConfigured()) return false
  try {
    await checkYouTube()
    console.log('YouTube connected')
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (err instanceof JobFailure && err.code === 'not_connected') {
      console.error('YouTube not connected:', message)
      return false
    }
    console.warn('YouTube connected; the start-up check failed:', message)
  }
  startLoop(YOUTUBE, inTurn, save)
  return true
}

export function stopSync() {
  stopped = true
  for (const timer of timers) clearTimeout(timer)
  timers.clear()
}
