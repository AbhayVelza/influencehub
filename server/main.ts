import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { cors } from 'hono/cors'
import { getResponse } from 'msw'
import { db, isRead, readChangedData, setActingUid } from '@/backend/db'
import { handlers } from '@/backend/handlers'
import { dropQueuedSyncedData, saveQueuedSyncedData, setProfileSource } from '@/backend/social'
import { mayReadFile } from '@/backend/documents'
import { commitJobs, executeJob, revertJobs } from '@/backend/jobs'
import { setPlatformData } from '@/backend/platform-data'
import { apiError } from '@/backend/utils'
import { MAX_DOCUMENT_BYTES } from '@/lib/documents'
import { API_BASE } from '@/lib/env'
import { authRoutes, ensureFirstAdmin, sessionUid } from './auth'
import { backgroundDataChanged, closeLiveStreams, dataChanged, liveStream } from './live'
import { instagramSource } from './meta'
import * as pgStore from './pg-store'
import { startScheduler, stopScheduler } from './scheduler'
import { startInstagramSync, startYouTubeSync, stopSync } from './sync-worker'
import { youtubeSource } from './youtube'

// The API server. It runs the same handlers the prototype runs in the browser (src/backend/handlers: stages, claims,
// scoping, permissions) over a working copy of the workspace that pg-store.ts loads from and saves to PostgreSQL.
// Every request needs a signed-in, active team member (server/auth.ts: email + password, session cookie).

/** Requests are answered one at a time: the handlers share one working copy and one "current user". */
let queue: Promise<unknown> = Promise.resolve()
function inTurn<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task)
  queue = run.catch(() => undefined)
  return run
}

const failed = (what: string, err: unknown) => {
  console.error(`${what} failed`, err)
  return apiError(500, 'server_error', 'Something went wrong saving your data. Try again.')
}

function handleApiRequest(request: Request, uid: string | undefined): Promise<Response> {
  return inTurn(async () => {
    if (!uid) return apiError(401, 'unauthenticated', 'Sign in to continue.')
    if (!db.team.some((u) => u.id === uid && u.is_active)) {
      return apiError(403, 'inactive', 'Your account has been deactivated. Ask an admin if this is a mistake.')
    }
    setActingUid(uid)
    try {
      const response = (await getResponse(handlers, request)) ?? apiError(404, 'not_found', 'Unknown endpoint')
      if (response.status === 202) {
        const data = await response.clone().json().catch(() => null)
        if (data && typeof data === 'object' && 'job_id' in data && typeof data.job_id === 'string') {
          await executeJob(data.job_id)
        }
      }
      // A read saves only when it changed something by itself (auto-release, link expiry, a job).
      if (!isRead(request) || readChangedData()) await pgStore.flush()
      commitJobs()
      // A looked-up account's first history point and posts, now that its row exists.
      await saveQueuedSyncedData()
      return response
    } catch (err) {
      revertJobs()
      dropQueuedSyncedData()
      // The handler threw or the save failed: nothing was written, so drop the half-made change.
      pgStore.revert()
      return failed(`${request.method} ${new URL(request.url).pathname}`, err)
    } finally {
      setActingUid(null)
    }
  })
}

const app = new Hono()

app.get('/health', async (c) => {
  const database = await pgStore.ping()
  return c.json({ status: database ? 'ok' : 'unavailable' }, database ? 200 : 503)
})

// Only needed when the app is served from another origin than this server (CORS_ORIGIN, comma-separated).
const origins = (process.env.CORS_ORIGIN ?? '').split(',').map((o) => o.trim()).filter(Boolean)
if (origins.length) {
  app.use(`${API_BASE}/*`, cors({ origin: origins, allowHeaders: ['Content-Type'], allowMethods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'], credentials: true }))
}

app.use(
  `${API_BASE}/*`,
  bodyLimit({
    // Room for a CSV import or a 20 MB document file.
    maxSize: 30 * 1024 * 1024,
    onError: (c) => c.json({ error: { code: 'payload_too_large', message: 'That’s too much data for one request.' } }, 413),
  }),
)

// Document files: PUT once to the key the presign step handed out (src/backend/handlers/documents.ts), then served.
const FILES = `${API_BASE}/files/`
const fileKey = (pathname: string) => decodeURIComponent(pathname.slice(FILES.length))

let activeFileTransfers = 0
let onFileTransfersIdle: (() => void) | null = null

function fileTransferStarted() {
  activeFileTransfers++
}

function fileTransferEnded() {
  activeFileTransfers--
  if (activeFileTransfers === 0 && onFileTransfersIdle) {
    onFileTransfersIdle()
  }
}

function waitForFileTransfers(): Promise<void> {
  if (activeFileTransfers === 0) return Promise.resolve()
  return new Promise((resolve) => {
    const prev = onFileTransfersIdle
    onFileTransfersIdle = () => {
      prev?.()
      resolve()
    }
  })
}

/** Files need a signed-in, active member too. */
const signedIn = async (c: Parameters<typeof sessionUid>[0]) => {
  const uid = await sessionUid(c)
  return inTurn(async () => db.team.some((u) => u.id === uid && u.is_active))
}

app.put(`${FILES}*`, async (c) => {
  if (!(await signedIn(c))) return apiError(401, 'unauthenticated', 'Sign in to continue.')
  fileTransferStarted()
  try {
    const key = fileKey(c.req.path)
    const data = new Uint8Array(await c.req.arrayBuffer())
    const upload = await inTurn(async () => {
      const entry = db.documentUploads.get(key)
      if (!entry || entry.uploading) return null
      entry.uploading = true
      return entry
    })
    if (!upload) return apiError(404, 'upload_missing', 'The file wasn’t expected. Choose it again.')
    if (!data.length || data.length > MAX_DOCUMENT_BYTES) {
      await inTurn(async () => {
        upload.uploading = false
      })
      return apiError(422, 'file_too_large', 'Files can be at most 20 MB')
    }
    try {
      await pgStore.saveFile(key, upload.content_type, data)
    } catch (err) {
      await inTurn(async () => {
        upload.uploading = false
      })
      return failed('File upload', err)
    }
    await inTurn(async () => {
      upload.uploaded = true
    })
    return c.body(null, 204)
  } finally {
    fileTransferEnded()
  }
})

app.get(`${FILES}*`, async (c) => {
  const uid = await sessionUid(c)
  const key = fileKey(c.req.path)
  // Only a document's file, for a member who may download that document (404 otherwise, so keys can't be probed).
  const allowed = await inTurn(async () => {
    const user = db.team.find((u) => u.id === uid && u.is_active)
    return user ? mayReadFile(key, user) : null
  })
  if (allowed === null) return apiError(401, 'unauthenticated', 'Sign in to continue.')
  if (!allowed) return apiError(404, 'not_found', 'File not found')
  fileTransferStarted()
  try {
    const file = await pgStore.readFile(key)
    if (!file) return apiError(404, 'not_found', 'File not found')
    return new Response(Buffer.from(file.data), { headers: { 'Content-Type': file.content_type, 'Cache-Control': 'private, max-age=3600' } })
  } finally {
    fileTransferEnded()
  }
})

// Live updates (server/live.ts). Only the sign-in check takes a turn: the open stream never holds the request queue.
app.get(`${API_BASE}/events`, async (c) => {
  const uid = await sessionUid(c)
  if (!uid || !(await inTurn(async () => db.team.some((u) => u.id === uid && u.is_active)))) {
    return apiError(401, 'unauthenticated', 'Sign in to continue.')
  }
  return liveStream(uid, () => signedIn(c))
})

app.route(API_BASE, authRoutes(inTurn, handleApiRequest))
app.all(`${API_BASE}/*`, async (c) => handleApiRequest(c.req.raw, await sessionUid(c)))

// Serves the built app too (`npm run build` → dist/), so one process is the whole deployment.
const dist = path.resolve(process.env.STATIC_DIR ?? 'dist')
if (existsSync(path.join(dist, 'index.html'))) {
  app.use('*', serveStatic({ root: path.relative(process.cwd(), dist) || '.' }))
  // Read on every request (it's ~2 KB): a copy kept from startup would point at old asset hashes after a rebuild,
  // and every deep link or refresh would load a blank page. no-cache keeps browsers from holding a stale copy too.
  app.get('*', (c) => {
    c.header('Cache-Control', 'no-cache')
    return c.html(readFileSync(path.join(dist, 'index.html'), 'utf8'))
  })
}

try {
  await pgStore.start()
  setPlatformData(pgStore.platformData)
  // Every save that changed data tells the open browsers to refresh: at once after a member's request, at most once a
  // minute for the background sync and the scheduler (their turns are marked; server/live.ts).
  let backgroundTurn = false
  pgStore.onDataSaved(() => (backgroundTurn ? backgroundDataChanged() : dataChanged()))
  const inBackgroundTurn = <T>(task: () => Promise<T>): Promise<T> =>
    inTurn(async () => {
      backgroundTurn = true
      try {
        return await task()
      } finally {
        backgroundTurn = false
      }
    })
  await ensureFirstAdmin()
  // Lookup and the background sync per platform: Instagram when META_ACCESS_TOKEN / META_IG_USER_ID are set
  // (server/meta.ts), YouTube when YOUTUBE_API_KEY is (server/youtube.ts).
  const save = async () => {
    try {
      await pgStore.flush()
    } catch (err) {
      pgStore.revert()
      throw err
    }
  }
  startScheduler(inBackgroundTurn, save)
  if (await startInstagramSync(inBackgroundTurn, save)) setProfileSource('instagram', instagramSource)
  if (await startYouTubeSync(inBackgroundTurn, save)) setProfileSource('youtube', youtubeSource)
} catch (err) {
  // e.g. PostgreSQL unreachable, a wrong DATABASE_URL, a database still on the old layout, or ADMIN_PASSWORD too short.
  console.error('Could not start:', err instanceof Error ? err.message : err)
  process.exit(1)
}

const port = Number(process.env.PORT) || 3001
const server = serve({ fetch: app.fetch, port }, () => console.log(`InfluenceHub API listening on http://localhost:${port}`))

// Render's free plan sleeps after 15 idle minutes (cold start ~40 s: Vercel's proxy answers 502, the Instagram sync
// stops). Render sets RENDER_EXTERNAL_URL; a request to it every 10 minutes passes Render's edge and counts as traffic.
const selfUrl = process.env.RENDER_EXTERNAL_URL?.trim()
const keepAwake = selfUrl
  ? setInterval(() => void fetch(`${selfUrl}/health`, { signal: AbortSignal.timeout(30_000) }).catch(() => undefined), 10 * 60_000)
  : null

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void (async () => {
      closeLiveStreams()
      await Promise.all([
        new Promise<void>((resolve) => server.close(() => resolve())),
        queue,
        waitForFileTransfers(),
      ])
      stopSync()
      stopScheduler()
      if (keepAwake) clearInterval(keepAwake)
      await pgStore.stop()
      process.exit(0)
    })()
  })
}
