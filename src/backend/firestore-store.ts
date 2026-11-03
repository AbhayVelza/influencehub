import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  writeBatch,
  type DocumentData,
  type QuerySnapshot,
  type Unsubscribe,
} from 'firebase/firestore'
import { firestore } from '@/lib/firebase-data'
import type { Influencer } from '@/types'
import { attachDocumentSummary, db, defaultSettings } from './db'

// Keeps `db` (this browser's working copy) in step with Firestore:
// - Reads: one live listener per collection, so changes made by teammates show up without reloading. Remote changes
//   are applied in place to the existing objects, so a request that is half-way through keeps valid references.
// - Writes: after each request or job, `flush` compares every record with what Firestore last had and writes only
//   the ones that changed (or were added / removed). Business rules stay in the handlers; firestore.rules decides
//   who may write what, so a refused write comes back as an error and the local copy is put back.

const LISTS = {
  team: 'team',
  categories: 'categories',
  influencers: 'influencers',
  documents: 'documents',
  calls: 'calls',
  packages: 'packages',
  activities: 'activities',
  savedViews: 'saved_views',
} as const
type ListKey = keyof typeof LISTS
type Item = { id: string } & Record<string, unknown>

/** Workspace settings, one document each in the `settings` collection. */
const SETTINGS = { poolSettings: 'pool', instagramSettings: 'instagram' } as const
const DISMISSED = 'dismissed_duplicates'

/** Firestore's state as last seen: collection → document id → canonical JSON (without the id). */
const server = new Map<string, Map<string, string>>()
const known = (name: string) => {
  let map = server.get(name)
  if (!map) server.set(name, (map = new Map()))
  return map
}

/** JSON with sorted keys, so the same data always compares equal whatever order Firestore returns fields in. */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)))
      : v,
  )
}

/** What's stored for a record: plain JSON, no id (it's the document id), no derived fields. */
function stored(key: ListKey, item: object): DocumentData {
  const data = JSON.parse(JSON.stringify(item)) as DocumentData
  delete data.id
  // An influencer's documents summary is derived from the documents collection on every response.
  if (key === 'influencers') delete data.documents
  return data
}

const list = (key: ListKey) => db[key] as unknown as Item[]

function fromServer(key: ListKey, id: string, data: DocumentData): Item {
  const item = { ...data, id } as Item
  return key === 'influencers' ? (attachDocumentSummary(item as unknown as Influencer) as unknown as Item) : item
}

function applyList(key: ListKey, snap: QuerySnapshot) {
  const seen = known(LISTS[key])
  const current = new Map(list(key).map((item) => [item.id, item]))
  const removed = new Set<string>()
  const added: Item[] = []
  for (const change of snap.docChanges()) {
    const id = change.doc.id
    if (change.type === 'removed') {
      seen.delete(id)
      removed.add(id)
      continue
    }
    const data = change.doc.data()
    const json = canonical(data)
    seen.set(id, json)
    const local = current.get(id)
    if (local && canonical(stored(key, local)) === json) continue
    if (local) {
      // Update in place: handlers may hold this object.
      for (const field of Object.keys(local)) if (field !== 'id' && !(field in data)) delete local[field]
      Object.assign(local, data)
    } else {
      const item = fromServer(key, id, data)
      current.set(id, item)
      added.push(item)
    }
  }
  if (added.length || removed.size) {
    ;(db[key] as unknown as Item[]) = [...list(key).filter((item) => !removed.has(item.id)), ...added]
  }
}

// ---------------------------------------------------------------------------
// Connecting (one signed-in user at a time)

let syncedUid: string | null = null
let ready: Promise<void> | null = null
let unsubscribers: Unsubscribe[] = []

export type Access = 'ok' | 'not_a_member' | 'inactive'

/**
 * Checks the user's own team record, then (once per sign-in) starts the listeners and waits for the first data.
 * firestore.rules let anyone signed in read their own team record, and nothing else unless it is active.
 */
export async function connect(uid: string): Promise<Access> {
  if (syncedUid !== uid) disconnect()
  if (ready && syncedUid === uid) {
    await ready
    const me = db.team.find((u) => u.id === uid)
    if (me?.is_active) return 'ok'
    if (me) return 'inactive'
  }
  const me = await getDoc(doc(firestore(), 'team', uid))
  if (!me.exists()) return 'not_a_member'
  if (me.data().is_active !== true) return 'inactive'
  syncedUid = uid
  ready ??= startListeners().catch((err: unknown) => {
    disconnect()
    throw err
  })
  await ready
  return 'ok'
}

function startListeners(): Promise<void> {
  const fs = firestore()
  return new Promise((resolve, reject) => {
    let waiting = Object.keys(LISTS).length + Object.keys(SETTINGS).length + 1
    let settled = false
    const loaded = (first: { done: boolean }) => {
      if (first.done) return
      first.done = true
      waiting -= 1
      if (waiting === 0 && !settled) {
        settled = true
        resolve()
      }
    }
    // A listener that fails (e.g. the user was deactivated and the rules now refuse) drops the whole connection;
    // the next request reconnects and reports why.
    const failed = (err: unknown) => {
      if (!settled) {
        settled = true
        reject(err)
      } else disconnect()
    }

    for (const key of Object.keys(LISTS) as ListKey[]) {
      const first = { done: false }
      unsubscribers.push(
        onSnapshot(
          collection(fs, LISTS[key]),
          (snap) => {
            applyList(key, snap)
            loaded(first)
          },
          failed,
        ),
      )
    }
    for (const [prop, id] of Object.entries(SETTINGS) as [keyof typeof SETTINGS, string][]) {
      const first = { done: false }
      unsubscribers.push(
        onSnapshot(
          doc(fs, 'settings', id),
          (snap) => {
            const data = snap.data()
            if (data) known('settings').set(id, canonical(data))
            else known('settings').delete(id)
            Object.assign(db, { [prop]: { ...defaultSettings()[prop], ...data } })
            loaded(first)
          },
          failed,
        ),
      )
    }
    const first = { done: false }
    unsubscribers.push(
      onSnapshot(
        collection(fs, DISMISSED),
        (snap) => {
          const seen = known(DISMISSED)
          seen.clear()
          for (const d of snap.docs) seen.set(d.id, canonical(d.data()))
          db.dismissedDuplicates = new Set(snap.docs.map((d) => d.id))
          loaded(first)
        },
        failed,
      ),
    )
  })
}

/** Stops listening and forgets the signed-in user's data (sign-out, or another user signs in). */
export function disconnect() {
  for (const stop of unsubscribers) stop()
  unsubscribers = []
  syncedUid = null
  ready = null
  server.clear()
  for (const key of Object.keys(LISTS) as ListKey[]) (db[key] as unknown as Item[]) = []
  Object.assign(db, defaultSettings())
  db.dismissedDuplicates = new Set()
  db.documentUploads.clear()
  db.uploads.clear()
}

// ---------------------------------------------------------------------------
// Writing back

interface Op {
  collection: string
  id: string
  data: DocumentData | null
  json: string | null
}

function pendingOps(): Op[] {
  const ops: Op[] = []
  for (const key of Object.keys(LISTS) as ListKey[]) {
    const name = LISTS[key]
    const seen = known(name)
    const ids = new Set<string>()
    for (const item of list(key)) {
      ids.add(item.id)
      const data = stored(key, item)
      const json = canonical(data)
      if (seen.get(item.id) !== json) ops.push({ collection: name, id: item.id, data, json })
    }
    for (const id of seen.keys()) if (!ids.has(id)) ops.push({ collection: name, id, data: null, json: null })
  }
  for (const [prop, id] of Object.entries(SETTINGS) as [keyof typeof SETTINGS, string][]) {
    const data = JSON.parse(JSON.stringify(db[prop])) as DocumentData
    const json = canonical(data)
    const before = known('settings').get(id) ?? canonical(JSON.parse(JSON.stringify(defaultSettings()[prop])))
    if (before !== json) ops.push({ collection: 'settings', id, data, json })
  }
  const dismissed = known(DISMISSED)
  for (const id of db.dismissedDuplicates) {
    if (!dismissed.has(id)) ops.push({ collection: DISMISSED, id, data: { dismissed: true }, json: canonical({ dismissed: true }) })
  }
  for (const id of dismissed.keys()) {
    if (!db.dismissedDuplicates.has(id)) ops.push({ collection: DISMISSED, id, data: null, json: null })
  }
  return ops
}

async function write() {
  if (!syncedUid) return
  const ops = pendingOps()
  const fs = firestore()
  // A batch takes at most 500 writes.
  for (let i = 0; i < ops.length; i += 400) {
    const chunk = ops.slice(i, i + 400)
    const batch = writeBatch(fs)
    for (const op of chunk) {
      const ref = doc(fs, op.collection, op.id)
      if (op.data) batch.set(ref, op.data)
      else batch.delete(ref)
    }
    await batch.commit()
    for (const op of chunk) {
      if (op.json === null) known(op.collection).delete(op.id)
      else known(op.collection).set(op.id, op.json)
    }
  }
}

let queue: Promise<void> = Promise.resolve()

/** Writes everything that changed since Firestore's last known state. Calls run one after another. */
export function flush(): Promise<void> {
  const run = queue.then(write)
  queue = run.catch(() => undefined)
  return run
}

/** Puts the local copy back to Firestore's last known state (after a refused write). */
export function revert() {
  for (const key of Object.keys(LISTS) as ListKey[]) {
    ;(db[key] as unknown as Item[]) = [...known(LISTS[key]).entries()].map(([id, json]) =>
      fromServer(key, id, JSON.parse(json) as DocumentData),
    )
  }
  for (const [prop, id] of Object.entries(SETTINGS) as [keyof typeof SETTINGS, string][]) {
    const json = known('settings').get(id)
    Object.assign(db, { [prop]: { ...defaultSettings()[prop], ...(json ? (JSON.parse(json) as object) : {}) } })
  }
  db.dismissedDuplicates = new Set(known(DISMISSED).keys())
}
