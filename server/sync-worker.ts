import { db, findAccount, refreshDerived, nowIso } from '@/backend/db'
import { JobFailure } from '@/backend/jobs'
import { applyProfile } from '@/backend/social'
import type { SocialAccount, SyncRun } from '@/types'
import { fetchBusinessAccount, fetchInstagram, metaConfigured, metaUsagePct } from './meta'

// The API server's Instagram sync: one account at a time, about every 40 seconds (~90 an hour, under Meta's hourly
// allowance), never while Meta reports 75% of it used. What's due, in order: accounts queued by Sync now / CSV import
// (`pending`), never-synced lookup accounts, then those last synced longer ago than Settings → Instagram's interval.
// Each fetch runs outside the request queue; only applying the result takes a turn, so the app stays responsive.

const TICK_MS = 40_000
const PAUSE_AT_PCT = 75
/** After Meta says "rate limited" (or usage passes PAUSE_AT_PCT), wait this long before the next call. */
const COOL_DOWN_MS = 15 * 60_000
const KEEP_RUNS = 20

type InTurn = <T>(task: () => Promise<T>) => Promise<T>
type Save = () => Promise<void>

/** Accounts that failed (not found, …): tried again only after a full interval, not on every tick. */
const failedAt = new Map<string, number>()
let pausedUntil = 0
let stopped = false

const intervalMs = () => db.instagramSettings.sync_interval_hours * 3600_000

function dueAccount(now: number): SocialAccount | null {
  let best: { account: SocialAccount; rank: number; at: string } | null = null
  for (const inf of db.influencers) {
    for (const a of inf.accounts) {
      if (a.platform !== 'instagram' || a.sync_method !== 'lookup') continue
      if ((failedAt.get(a.id) ?? 0) > now - intervalMs()) continue
      const rank = a.sync_status === 'pending' ? 0 : a.last_synced_at === null ? 1 : 2
      if (rank === 2 && Date.parse(a.last_synced_at!) > now - intervalMs()) continue
      const at = a.last_synced_at ?? ''
      if (!best || rank < best.rank || (rank === best.rank && at < best.at)) best = { account: a, rank, at }
    }
  }
  return best?.account ?? null
}

/** This hour's run in Settings → Instagram → Recent runs (one row per hour with work). */
function recordRun(ok: boolean) {
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

async function tick(inTurn: InTurn, save: Save) {
  const now = Date.now()
  if (now < pausedUntil) return
  if (metaUsagePct() >= PAUSE_AT_PCT) {
    pausedUntil = now + COOL_DOWN_MS
    return
  }
  const target = await inTurn(async () => {
    const a = dueAccount(now)
    return a ? { id: a.id, handle: a.handle } : null
  })
  if (!target) return
  try {
    const profile = await fetchInstagram(target.handle)
    await inTurn(async () => {
      const found = findAccount(target.id)
      // Removed, renamed or switched back to manual while Instagram answered: drop the result.
      if (!found || found.account.handle !== target.handle || found.account.sync_method !== 'lookup') return
      applyProfile(found.account, profile)
      refreshDerived(found.influencer)
      failedAt.delete(target.id)
      recordRun(true)
      await save()
    })
  } catch (err) {
    const code = err instanceof JobFailure ? err.code : 'unavailable'
    if (code === 'rate_limited' || code === 'unavailable') {
      pausedUntil = Date.now() + COOL_DOWN_MS
      return
    }
    if (code === 'not_connected') {
      console.error('Instagram sync paused:', err instanceof Error ? err.message : err)
      pausedUntil = Date.now() + 6 * 3600_000
      await inTurn(async () => {
        db.instagramSettings.connected = false
        db.instagramSettings.token_status = 'expired'
        await save()
      })
      return
    }
    // not_found: a personal profile, renamed or deleted account. Marked, and tried again after an interval.
    failedAt.set(target.id, Date.now())
    await inTurn(async () => {
      const found = findAccount(target.id)
      if (found?.account.sync_method !== 'lookup') return
      found.account.sync_status = 'error'
      recordRun(false)
      await save()
    })
  }
}

/** Connects Instagram (Settings → Instagram shows the account) and starts the sync loop. False when not configured. */
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
  const loop = async () => {
    if (stopped) return
    await tick(inTurn, save).catch((err: unknown) => console.error('Instagram sync failed', err))
    setTimeout(() => void loop(), TICK_MS).unref()
  }
  setTimeout(() => void loop(), 5_000).unref()
  return true
}

export function stopInstagramSync() {
  stopped = true
}
