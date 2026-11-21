import type { AccountSnapshot, MediaItem } from '@/types'

// Follower history (snapshots) and recent posts. Kept outside the working copy (`db`): a daily snapshot for every
// account at 100,000 influencers would be millions of rows. The API server keeps them in PostgreSQL
// (server/pg-store.ts: `account_snapshots`, `account_media`), prototype mode in this browser's IndexedDB
// (./local-store.ts). Both register themselves at start-up with setPlatformData, like setProfileSource.

/** Days of follower history kept per account. */
export const SNAPSHOT_DAYS = 365
const DAY_MS = 86_400_000
/** Asia/Kolkata is UTC+05:30 all year (no daylight saving). */
const IST_OFFSET_MS = 330 * 60_000

export interface PlatformDataStore {
  /** One snapshot per account per IST calendar day (a later one that day replaces it); drops those past SNAPSHOT_DAYS. */
  recordSnapshot(accountId: string, audience: number, at: string): Promise<void>
  /** Oldest first. */
  listSnapshots(accountId: string): Promise<AccountSnapshot[]>
  /** Replaces the account's recent posts (newest first, as the platform lists them). */
  setRecentPosts(accountId: string, items: MediaItem[]): Promise<void>
  listRecentPosts(accountId: string): Promise<MediaItem[]>
}

let store: PlatformDataStore | null = null

/** The API server's (PostgreSQL) or the prototype's (IndexedDB) store; null leaves history and posts empty. */
export function setPlatformData(next: PlatformDataStore | null) {
  store = next
}

export const platformData = (): PlatformDataStore | null => store

/** The IST calendar day (`yyyy-MM-dd`) of an instant. */
export const istDay = (iso: string): string => new Date(Date.parse(iso) + IST_OFFSET_MS).toISOString().slice(0, 10)

/** The oldest instant kept when recording at `at`. */
export const snapshotCutoff = (at: string): number => Date.parse(at) - SNAPSHOT_DAYS * DAY_MS

/** A list with a new snapshot applied: same-IST-day entry replaced, entries past the retention dropped, oldest first. */
export function withSnapshot(list: AccountSnapshot[], audience: number, at: string): AccountSnapshot[] {
  const day = istDay(at)
  const cutoff = snapshotCutoff(at)
  return [...list.filter((s) => istDay(s.captured_at) !== day && Date.parse(s.captured_at) >= cutoff), { audience, captured_at: at }].sort(
    (a, b) => Date.parse(a.captured_at) - Date.parse(b.captured_at),
  )
}

/** A store kept in memory (tests; nothing survives a restart). */
export function memoryPlatformData(): PlatformDataStore {
  const snapshots = new Map<string, AccountSnapshot[]>()
  const posts = new Map<string, MediaItem[]>()
  return {
    async recordSnapshot(accountId, audience, at) {
      snapshots.set(accountId, withSnapshot(snapshots.get(accountId) ?? [], audience, at))
    },
    async listSnapshots(accountId) {
      return [...(snapshots.get(accountId) ?? [])]
    },
    async setRecentPosts(accountId, items) {
      posts.set(accountId, [...items])
    },
    async listRecentPosts(accountId) {
      return [...(posts.get(accountId) ?? [])]
    },
  }
}
