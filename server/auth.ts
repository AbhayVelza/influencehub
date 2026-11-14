import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import type { Context } from 'hono'
import { Hono } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { db, nextId, nowIso } from '@/backend/db'
import { apiError } from '@/backend/utils'
import { MIN_PASSWORD_LENGTH } from '@/lib/constants'
import { OWNER_ID } from '@/lib/mode'
import type { User } from '@/types'
import * as pgStore from './pg-store'

// Sign-in: email + password (scrypt hashes in `credentials`), then an HttpOnly session cookie whose token is stored
// hashed in `sessions`. The team record still decides access: a deactivated member is refused on every request.

const COOKIE = 'ih_session'
const SESSION_DAYS = 30

const hashScrypt = (password: string, salt: Buffer, length: number) =>
  new Promise<Buffer>((resolve, reject) => scrypt(password, salt, length, (err, key) => (err ? reject(err) : resolve(key))))

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  return `scrypt$${salt.toString('base64')}$${(await hashScrypt(password, salt, 64)).toString('base64')}`
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [, salt = '', hash = ''] = stored.split('$')
  const expected = Buffer.from(hash, 'base64')
  const actual = await hashScrypt(password, Buffer.from(salt, 'base64'), expected.length || 64)
  return expected.length > 0 && timingSafeEqual(actual, expected)
}

/** Checked when the email is unknown, so a wrong email takes as long as a wrong password. */
const DUMMY_HASH = await hashPassword(randomBytes(16).toString('hex'))

const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex')
const sessionToken = (c: Context) => getCookie(c, COOKIE)

/** The signed-in member's id for this request, or undefined. */
export async function sessionUid(c: Context): Promise<string | undefined> {
  const token = sessionToken(c)
  return token ? pgStore.sessionUser(tokenHash(token)) : undefined
}

const weak = (password: unknown) => typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH
const weakPassword = () => apiError(422, 'weak_password', `Use at least ${MIN_PASSWORD_LENGTH} characters`)
const activeMember = (id: string | undefined) => db.team.find((u) => u.id === id && u.is_active)

/** Five wrong passwords for an email lock it for 15 minutes (in memory; a restart clears it). */
const failures = new Map<string, { count: number; until: number }>()
const LOCK_MS = 15 * 60 * 1000

type InTurn = <T>(task: () => Promise<T>) => Promise<T>
type HandleApi = (request: Request, uid: string | undefined) => Promise<Response>

/** `/auth/*` routes, and `POST /team`, which also saves the new member's initial password. */
export function authRoutes(inTurn: InTurn, handleApi: HandleApi) {
  const auth = new Hono()

  auth.get('/auth/session', async (c) => {
    const uid = await sessionUid(c)
    const me = await inTurn(async () => activeMember(uid))
    return me ? c.json(me) : apiError(401, 'unauthenticated', 'Sign in to continue.')
  })

  auth.post('/auth/sign-in', async (c) => {
    const body = await c.req.json<{ email?: unknown; password?: unknown }>().catch(() => ({}) as Record<string, unknown>)
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    const password = typeof body.password === 'string' ? body.password : ''
    const lock = failures.get(email)
    if (lock && lock.count >= 5 && lock.until > Date.now()) {
      return apiError(429, 'too_many_requests', 'Too many wrong passwords. Try again in 15 minutes.')
    }
    const member = await inTurn(async () => db.team.find((u) => u.email.toLowerCase() === email))
    const stored = member && (await pgStore.passwordHash(member.id))
    if (!(await verifyPassword(password, stored ?? DUMMY_HASH)) || !stored || !member) {
      const count = lock && lock.until > Date.now() ? lock.count + 1 : 1
      failures.set(email, { count, until: Date.now() + LOCK_MS })
      return apiError(401, 'invalid_credentials', 'Wrong email or password.')
    }
    failures.delete(email)
    if (!member.is_active) return apiError(403, 'inactive', 'Your account has been deactivated. Ask an admin if this is a mistake.')

    const token = randomBytes(32).toString('base64url')
    await pgStore.createSession(tokenHash(token), member.id, new Date(Date.now() + SESSION_DAYS * 86_400_000))
    setCookie(c, COOKIE, token, {
      httpOnly: true,
      sameSite: 'Lax',
      secure: new URL(c.req.url).protocol === 'https:' || c.req.header('x-forwarded-proto') === 'https',
      path: '/',
      maxAge: SESSION_DAYS * 86_400,
    })
    return c.json(member)
  })

  auth.post('/auth/sign-out', async (c) => {
    const token = sessionToken(c)
    if (token) await pgStore.deleteSession(tokenHash(token))
    deleteCookie(c, COOKIE, { path: '/' })
    return c.body(null, 204)
  })

  // Change your own password: re-checks the current one, then signs you out everywhere else.
  auth.post('/auth/password', async (c) => {
    const uid = await sessionUid(c)
    if (!uid || !(await inTurn(async () => activeMember(uid)))) return apiError(401, 'unauthenticated', 'Sign in to continue.')
    const body = await c.req.json<{ current_password?: unknown; new_password?: unknown }>().catch(() => ({}) as Record<string, unknown>)
    const stored = await pgStore.passwordHash(uid)
    if (!stored || !(await verifyPassword(String(body.current_password ?? ''), stored))) {
      return apiError(422, 'wrong_password', 'That isn’t your current password.')
    }
    if (weak(body.new_password)) return weakPassword()
    await pgStore.setPasswordHash(uid, await hashPassword(body.new_password as string))
    await pgStore.deleteSessions(uid, tokenHash(sessionToken(c)!))
    return c.body(null, 204)
  })

  // An admin sets someone's password (a new one when they forgot theirs); it signs them out everywhere.
  auth.post('/auth/set-password', async (c) => {
    const uid = await sessionUid(c)
    const body = await c.req.json<{ user_id?: unknown; password?: unknown }>().catch(() => ({}) as Record<string, unknown>)
    const target = await inTurn(async () => {
      if (activeMember(uid)?.role !== 'admin') return 'forbidden' as const
      return db.team.find((u) => u.id === body.user_id) ?? ('missing' as const)
    })
    if (target === 'forbidden') return apiError(403, 'forbidden', 'Only admins can set passwords')
    if (target === 'missing') return apiError(404, 'not_found', 'Team member not found')
    if (weak(body.password)) return weakPassword()
    await pgStore.setPasswordHash(target.id, await hashPassword(body.password as string))
    await pgStore.deleteSessions(target.id)
    return c.body(null, 204)
  })

  // Adding a member: the handler creates the team record; its initial password is hashed and stored here.
  auth.post('/team', async (c) => {
    const body = await c.req.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>)
    const { password, ...member } = body
    if (weak(password)) return weakPassword()
    const request = new Request(c.req.url, { method: 'POST', headers: c.req.raw.headers, body: JSON.stringify(member) })
    const response = await handleApi(request, await sessionUid(c))
    if (response.status === 201) {
      const created = (await response.clone().json()) as User
      await pgStore.setPasswordHash(created.id, await hashPassword(password as string))
    }
    return response
  })

  return auth
}

/**
 * The first admin comes from ADMIN_EMAIL / ADMIN_PASSWORD (/ ADMIN_NAME) at start-up: a new workspace's owner takes
 * that email, or a new admin is added. The password is only set when they have none, so it never overwrites a
 * password they changed; to reset it, an admin uses Settings > Team > Set password.
 */
export async function ensureFirstAdmin() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase()
  const password = process.env.ADMIN_PASSWORD ?? ''
  if (!email || !password) {
    if (!(await pgStore.hasAnyPassword())) {
      console.warn('No one can sign in yet: set ADMIN_EMAIL and ADMIN_PASSWORD in .env.local and restart (see docs/server.md).')
    }
    return
  }
  if (weak(password)) throw new Error(`ADMIN_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters.`)
  const name = process.env.ADMIN_NAME?.trim() || 'Admin'
  let admin = db.team.find((u) => u.email.toLowerCase() === email)
  if (!admin) {
    const owner = db.team.find((u) => u.id === OWNER_ID && u.email.endsWith('@influencehub.local'))
    admin = owner ?? { id: nextId('usr'), name, email, role: 'admin', is_active: true, location: null, created_at: nowIso() }
    Object.assign(admin, { name, email, role: 'admin', is_active: true })
    if (!owner) db.team.push(admin)
    await pgStore.flush()
  }
  if (!(await pgStore.passwordHash(admin.id))) {
    await pgStore.setPasswordHash(admin.id, await hashPassword(password))
    console.log(`First admin ready: ${email}`)
  }
}
