import type { Influencer, User } from '@/types'
import { attachDocumentSummary, db, defaultSettings, newWorkspace, type StoredCategory } from './db'

// Prototype mode's store: the whole workspace in this browser's IndexedDB, so it survives reloads (not shared with
// anyone). A new workspace has one admin (the owner) and the default categories, nothing else. Document files are
// kept here too, as Blobs.

const DB_NAME = 'influencehub-prototype'
const WORKSPACE = 'workspace'
const FILES = 'files'
const KEY = 'current'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      req.result.createObjectStore(WORKSPACE)
      req.result.createObjectStore(FILES)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
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
    instagramSettings: { ...defaultSettings().instagramSettings, ...data.instagramSettings },
    migrations: { ...defaultSettings().migrations, ...data.migrations },
    dismissedDuplicates: new Set(data.dismissed),
  })
}

let ready: Promise<void> | null = null
let lastSaved = ''
let initialSnapshot = ''
let warned = false

function warnOnce(err: unknown) {
  if (warned) return
  warned = true
  console.warn('Prototype data can’t be saved in this browser (private window or storage blocked); changes last until reload.', err)
}

/** Loads the workspace once (or creates it). Everyone in the team "exists" here; the acting user is resolved by the caller. */
export async function connect(): Promise<void> {
  ready ??= (async () => {
    let data: Snapshot | undefined
    try {
      data = await run<Snapshot | undefined>(WORKSPACE, 'readonly', (s) => s.get(KEY) as IDBRequest<Snapshot | undefined>)
    } catch (err) {
      warnOnce(err)
    }
    load(data ?? emptyWorkspace())
    initialSnapshot = JSON.stringify(snapshot())
    lastSaved = data ? initialSnapshot : ''
  })()
  await ready
}

/** Saves the workspace if anything changed since the last save. */
export async function flush(): Promise<void> {
  if (!ready) return
  const json = JSON.stringify(snapshot())
  if (json === lastSaved) return
  try {
    // Stored as plain JSON data (derived fields such as an influencer's documents summary are recomputed on load).
    await run(WORKSPACE, 'readwrite', (s) => s.put(JSON.parse(json) as Snapshot, KEY))
    lastSaved = json
  } catch (err) {
    warnOnce(err)
    throw err
  }
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
}
