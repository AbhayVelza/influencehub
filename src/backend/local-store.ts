import type { AccountSnapshot, Influencer, MediaItem, User } from '@/types'
import { attachDocumentSummary, db, defaultSettings, newWorkspace, type StoredCategory } from './db'
import { withSnapshot, type PlatformDataStore } from './platform-data'

// Prototype mode's store: the whole workspace in this browser's IndexedDB, so it survives reloads (not shared with
// anyone). A new workspace has one admin (the owner) and the default categories, nothing else. Document files are
// kept here too, as Blobs.

const DB_NAME = 'influencehub-prototype'
const WORKSPACE = 'workspace'
const FILES = 'files'
/** Follower history and recent posts, keyed by account id (./platform-data.ts; not part of the workspace). */
const SNAPSHOTS = 'snapshots'
const MEDIA = 'media'
const KEY = 'current'
/**
 * Beside the workspace (same store): a new random value on every save. A tab saves only when it is still the value its
 * working copy was loaded from, so a tab never writes over a save another tab made meanwhile (absent before P3).
 */
const REV = 'rev'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    // Version 2 added SNAPSHOTS and MEDIA; a version 1 database keeps its workspace and files.
    const req = indexedDB.open(DB_NAME, 2)
    req.onupgradeneeded = () => {
      for (const name of [WORKSPACE, FILES, SNAPSHOTS, MEDIA]) {
        if (!req.result.objectStoreNames.contains(name)) req.result.createObjectStore(name)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

/** One transaction on the workspace store; resolves with `result()` once it has committed. */
async function inWorkspace<T>(mode: IDBTransactionMode, body: (store: IDBObjectStore) => () => T): Promise<T> {
  const idb = await openDb()
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = idb.transaction(WORKSPACE, mode)
      const result = body(tx.objectStore(WORKSPACE))
      tx.oncomplete = () => resolve(result())
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error ?? new Error('Transaction aborted'))
    })
  } finally {
    idb.close()
  }
}

/** The saved workspace and its revision, read together. */
function readSaved() {
  return inWorkspace('readonly', (store) => {
    const data = store.get(KEY) as IDBRequest<Snapshot | undefined>
    const rev = store.get(REV) as IDBRequest<string | undefined>
    return () => ({ data: data.result, rev: rev.result })
  })
}

const newRev = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`

/** flush() found that another tab saved since this tab's working copy was loaded; nothing was written. */
export class SavedInOtherTab extends Error {
  constructor() {
    super('Another tab saved first')
  }
}

async function run<T>(store: string, mode: IDBTransactionMode, action: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const idb = await openDb()
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = action(idb.transaction(store, mode).objectStore(store))
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  } finally {
    idb.close()
  }
}

interface Snapshot {
  version: 1
  team: User[]
  categories: StoredCategory[]
  influencers: Influencer[]
  documents: typeof db.documents
  calls: typeof db.calls
  packages: typeof db.packages
  activities: typeof db.activities
  savedViews: typeof db.savedViews
  poolSettings: typeof db.poolSettings
  instagramSettings: typeof db.instagramSettings
  /** Absent in snapshots saved before migrations were tracked. */
  migrations?: typeof db.migrations
  dismissed: string[]
  /** Absent in snapshots saved before jobs and pending CSV files were kept. */
  jobs?: typeof db.jobs
  uploads?: [string, string][]
}

function emptyWorkspace(): Snapshot {
  return {
    version: 1,
    ...newWorkspace(),
    influencers: [],
    documents: [],
    calls: [],
    packages: [],
    activities: [],
    savedViews: [],
    ...defaultSettings(),
    dismissed: [],
  }
}

function snapshot(): Snapshot {
  return {
    version: 1,
    team: db.team,
    categories: db.categories,
    influencers: db.influencers,
    documents: db.documents,
    calls: db.calls,
    packages: db.packages,
    activities: db.activities,
    savedViews: db.savedViews,
    poolSettings: db.poolSettings,
    instagramSettings: db.instagramSettings,
    migrations: db.migrations,
    dismissed: [...db.dismissedDuplicates],
    jobs: db.jobs,
    uploads: [...db.uploads],
  }
}

function load(data: Snapshot) {
  Object.assign(db, {
    team: data.team,
    categories: data.categories,
    // The documents summary is derived on every response (see attachDocumentSummary).
    influencers: data.influencers.map((i) => attachDocumentSummary(i)),
    documents: data.documents,
    calls: data.calls,
    packages: data.packages,
    activities: data.activities,
    savedViews: data.savedViews,
    poolSettings: { ...defaultSettings().poolSettings, ...data.poolSettings },
    // Auto-sync is every 7 days only; a browser saved with an older choice moves to it.
    instagramSettings: { ...defaultSettings().instagramSettings, ...data.instagramSettings, sync_interval_hours: 168 },
    migrations: { ...defaultSettings().migrations, ...data.migrations },
    dismissedDuplicates: new Set(data.dismissed),
    jobs: data.jobs ?? [],
    uploads: new Map(data.uploads ?? []),
  })
}

let ready: Promise<void> | null = null
let lastSaved = ''
let initialSnapshot = ''
/** The saved revision (REV) this tab's working copy was loaded from or last saved as. */
let knownRev: string | undefined
let warned = false

function warnOnce(err: unknown) {
  if (warned) return
  warned = true
  console.warn('Prototype data can’t be saved in this browser (private window or storage blocked); changes last until reload.', err)
}

/** Loads the workspace once (or creates it). Everyone in the team "exists" here; the acting user is resolved by the caller. */
export async function connect(): Promise<void> {
  ready ??= (async () => {
    let saved: { data: Snapshot | undefined; rev: string | undefined } = { data: undefined, rev: undefined }
    try {
      saved = await readSaved()
    } catch (err) {
      warnOnce(err)
    }
    load(saved.data ?? emptyWorkspace())
    initialSnapshot = JSON.stringify(snapshot())
    lastSaved = saved.data ? initialSnapshot : ''
    knownRev = saved.rev
  })()
  await ready
}

/**
 * Saves the workspace if anything changed since the last save; true when it did. Throws SavedInOtherTab, writing
 * nothing, when another tab saved since this tab's working copy was loaded (the caller reloads and fails the request).
 */
export async function flush(): Promise<boolean> {
  if (!ready) return false
  const json = JSON.stringify(snapshot())
  if (json === lastSaved) return false
  const rev = newRev()
  let wrote: boolean
  try {
    // Check and write in one transaction: IndexedDB runs the tabs' read-write transactions one after another.
    wrote = await inWorkspace('readwrite', (store) => {
      let ok = false
      const current = store.get(REV) as IDBRequest<string | undefined>
      current.onsuccess = () => {
        if (current.result !== knownRev) return
        // Stored as plain JSON data (derived fields such as an influencer's documents summary are recomputed on load).
        store.put(JSON.parse(json) as Snapshot, KEY)
        store.put(rev, REV)
        ok = true
      }
      return () => ok
    })
  } catch (err) {
    warnOnce(err)
    throw err
  }
  if (!wrote) throw new SavedInOtherTab()
  lastSaved = json
  knownRev = rev
  return true
}

/**
 * Loads the saved workspace again when another tab of this browser saved since this tab last read or wrote it (live
 * updates, ./index.ts), so this tab answers with it and its next save builds on it. Call it between requests. True
 * when the working copy changed.
 */
export async function reload(): Promise<boolean> {
  // Not loaded yet: connect() will read the latest.
  if (!ready) return false
  await ready
  let saved: { data: Snapshot | undefined; rev: string | undefined }
  try {
    // Usually nothing changed: only the revision is read.
    const rev = await run<string | undefined>(WORKSPACE, 'readonly', (s) => s.get(REV) as IDBRequest<string | undefined>)
    if (rev === knownRev) return false
    saved = await readSaved()
  } catch (err) {
    warnOnce(err)
    return false
  }
  // Nothing saved: the other tab reset the prototype data.
  load(saved.data ?? emptyWorkspace())
  const json = JSON.stringify(snapshot())
  if (!saved.data) initialSnapshot = json
  lastSaved = saved.data ? json : ''
  knownRev = saved.rev
  return true
}

/** Restores the working copy to the last persisted snapshot (or the initial state if nothing was saved yet). */
export function revert(): void {
  const target = lastSaved || initialSnapshot
  if (target) {
    load(JSON.parse(target) as Snapshot)
  }
}

/** Keeps an uploaded document file. */
export async function saveFile(key: string, file: Blob): Promise<void> {
  await run(FILES, 'readwrite', (s) => s.put(file, key))
}

/** A URL for a stored document file (a blob URL for this tab). */
export async function fileObjectUrl(key: string): Promise<string | null> {
  const blob = await run<Blob | undefined>(FILES, 'readonly', (s) => s.get(key) as IDBRequest<Blob | undefined>)
  return blob ? URL.createObjectURL(blob) : null
}

/**
 * Prototype mode's follower history and recent posts. Nothing fills them yet (prototype mode has no platform
 * connection); kept so both modes run the same code. Rows of a removed account stay behind, unread (ids are never
 * reused), until Reset prototype data.
 */
export const localPlatformData: PlatformDataStore = {
  async recordSnapshot(accountId, audience, at) {
    const list = await run<AccountSnapshot[] | undefined>(SNAPSHOTS, 'readonly', (s) => s.get(accountId) as IDBRequest<AccountSnapshot[] | undefined>)
    await run(SNAPSHOTS, 'readwrite', (s) => s.put(withSnapshot(list ?? [], audience, at), accountId))
  },
  async listSnapshots(accountId) {
    return (await run<AccountSnapshot[] | undefined>(SNAPSHOTS, 'readonly', (s) => s.get(accountId) as IDBRequest<AccountSnapshot[] | undefined>)) ?? []
  },
  async setRecentPosts(accountId, items) {
    await run(MEDIA, 'readwrite', (s) => s.put(items, accountId))
  },
  async listRecentPosts(accountId) {
    return (await run<MediaItem[] | undefined>(MEDIA, 'readonly', (s) => s.get(accountId) as IDBRequest<MediaItem[] | undefined>)) ?? []
  },
}

/** Deletes the whole prototype workspace (data and files) from this browser. */
export async function resetPrototypeData(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
    req.onblocked = () => resolve()
  })
  ready = null
  lastSaved = ''
  knownRev = undefined
}
