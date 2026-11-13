import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { cors } from 'hono/cors'
import { getResponse } from 'msw'
import { db, setActingUid } from '@/backend/db'
import { setFileUrlProvider } from '@/backend/documents'
import { handlers } from '@/backend/handlers'
import { setSignInAccountCreator } from '@/backend/sign-in-accounts'
import { apiError } from '@/backend/utils'
import { API_BASE } from '@/lib/env'
import { createSignInAccount, fileUrl, syncMemberAccess, verifyToken } from './firebase-admin'
import * as pgStore from './pg-store'

// The API server. It runs the same handlers the prototype runs in the browser (src/backend/handlers: stages, claims,
// scoping, permissions) over a working copy of the workspace that pg-store.ts loads from and saves to PostgreSQL.
// Sign-in is Firebase Auth: every request carries the user's ID token, and the team record decides access.

setSignInAccountCreator(createSignInAccount)
setFileUrlProvider(fileUrl)

/** Requests are answered one at a time: the handlers share one working copy and one "current user". */
let queue: Promise<unknown> = Promise.resolve()
function inTurn<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task)
  queue = run.catch(() => undefined)
  return run
}

async function handleApiRequest(request: Request): Promise<Response> {
  const uid = await verifyToken(request.headers.get('Authorization'))
  if (!uid) return apiError(401, 'unauthenticated', 'Sign in to continue.')

  return inTurn(async () => {
    const access = await pgStore.connect(uid)
    if (access === 'not_a_member') {
      return apiError(403, 'not_a_member', 'You don’t have access to InfluenceHub. Ask an admin to add you.')
    }
    if (access === 'inactive') return apiError(403, 'inactive', 'Your account has been deactivated. Ask an admin if this is a mistake.')

    setActingUid(uid)
    try {
      const response = (await getResponse(handlers, request)) ?? apiError(404, 'not_found', 'Unknown endpoint')
      await pgStore.flush()
      return response
    } catch (err) {
      // The handler threw or the save failed: nothing was written, so drop the half-made change.
      pgStore.revert()
      console.error(`${request.method} ${new URL(request.url).pathname} failed`, err)
      return apiError(500, 'server_error', 'Something went wrong saving your data. Try again.')
    } finally {
      setActingUid(null)
      for (const id of pgStore.takeTeamChanges()) {
        const member = db.team.find((u) => u.id === id)
        if (member) void syncMemberAccess(member.id, member.is_active)
      }
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
  app.use(`${API_BASE}/*`, cors({ origin: origins, allowHeaders: ['Content-Type', 'Authorization'], allowMethods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'] }))
}

app.use(
  `${API_BASE}/*`,
  bodyLimit({
    // Room for a CSV import; document files go straight to Firebase Storage, never through here.
    maxSize: 30 * 1024 * 1024,
    onError: (c) => c.json({ error: { code: 'payload_too_large', message: 'That’s too much data for one request.' } }, 413),
  }),
)
app.all(`${API_BASE}/*`, (c) => handleApiRequest(c.req.raw))

// Serves the built app too (`npm run build` → dist/), so one process is the whole deployment.
const dist = path.resolve(process.env.STATIC_DIR ?? 'dist')
if (existsSync(path.join(dist, 'index.html'))) {
  const index = readFileSync(path.join(dist, 'index.html'), 'utf8')
  app.use('*', serveStatic({ root: path.relative(process.cwd(), dist) || '.' }))
  app.get('*', (c) => c.html(index))
}

const port = Number(process.env.PORT) || 3001

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim() && !process.env.FIREBASE_PROJECT_ID?.trim()) {
  console.error(
    'Could not start: sign-in can’t be checked without Firebase. Set GOOGLE_APPLICATION_CREDENTIALS (path to a service ' +
      'account key) in .env.local; see docs/auth.md.',
  )
  process.exit(1)
}

try {
  await pgStore.start()
} catch (err) {
  console.error('Could not start: PostgreSQL is not reachable or DATABASE_URL is wrong.', err)
  process.exit(1)
}
if (!db.team.length) console.warn('No team members yet. Run `npm run seed:admin` to create the first admin, then restart the server.')

const server = serve({ fetch: app.fetch, port }, () => console.log(`InfluenceHub API listening on http://localhost:${port}`))

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close()
    // Let the request in progress finish and save before the connection closes.
    void queue.then(() => pgStore.stop()).finally(() => process.exit(0))
  })
}
