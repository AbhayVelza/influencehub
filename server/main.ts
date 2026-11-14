import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { cors } from 'hono/cors'
import { getResponse } from 'msw'
import { db, resolveActingUid, setActingUid } from '@/backend/db'
import { handlers } from '@/backend/handlers'
import { commitJobs, executeJob, revertJobs } from '@/backend/jobs'
import { apiError } from '@/backend/utils'
import { MAX_DOCUMENT_BYTES } from '@/lib/documents'
import { ACTING_AS_HEADER, API_BASE } from '@/lib/env'
import * as pgStore from './pg-store'

// The API server. It runs the same handlers the prototype runs in the browser (src/backend/handlers: stages, claims,
// scoping, permissions) over a working copy of the workspace that pg-store.ts loads from and saves to PostgreSQL.
// There is no sign-in yet: each request names the team member it acts as (ACTING_AS_HEADER).

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

function handleApiRequest(request: Request): Promise<Response> {
  return inTurn(async () => {
    setActingUid(resolveActingUid(request.headers.get(ACTING_AS_HEADER)))
    try {
      const response = (await getResponse(handlers, request)) ?? apiError(404, 'not_found', 'Unknown endpoint')
      if (response.status === 202) {
        const data = await response.clone().json().catch(() => null)
        if (data && typeof data === 'object' && 'job_id' in data && typeof data.job_id === 'string') {
          executeJob(data.job_id)
        }
      }
      await pgStore.flush()
      commitJobs()
      return response
    } catch (err) {
      revertJobs()
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
  app.use(`${API_BASE}/*`, cors({ origin: origins, allowHeaders: ['Content-Type', ACTING_AS_HEADER], allowMethods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'] }))
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

app.put(`${FILES}*`, async (c) => {
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
    return c.body(null, 204)
  } finally {
    fileTransferEnded()
  }
})

app.get(`${FILES}*`, async (c) => {
  fileTransferStarted()
  try {
    const file = await pgStore.readFile(fileKey(c.req.path))
    if (!file) return apiError(404, 'not_found', 'File not found')
    return new Response(Buffer.from(file.data), { headers: { 'Content-Type': file.content_type, 'Cache-Control': 'private, max-age=3600' } })
  } finally {
    fileTransferEnded()
  }
})

app.all(`${API_BASE}/*`, (c) => handleApiRequest(c.req.raw))

// Serves the built app too (`npm run build` → dist/), so one process is the whole deployment.
const dist = path.resolve(process.env.STATIC_DIR ?? 'dist')
if (existsSync(path.join(dist, 'index.html'))) {
  const index = readFileSync(path.join(dist, 'index.html'), 'utf8')
  app.use('*', serveStatic({ root: path.relative(process.cwd(), dist) || '.' }))
  app.get('*', (c) => c.html(index))
}

try {
  await pgStore.start()
} catch (err) {
  console.error('Could not start: PostgreSQL is not reachable or DATABASE_URL is wrong.', err)
  process.exit(1)
}

const port = Number(process.env.PORT) || 3001
const server = serve({ fetch: app.fetch, port }, () => console.log(`InfluenceHub API listening on http://localhost:${port}`))

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void (async () => {
      await Promise.all([
        new Promise<void>((resolve) => server.close(() => resolve())),
        queue,
        waitForFileTransfers(),
      ])
      await pgStore.stop()
      process.exit(0)
    })()
  })
}
