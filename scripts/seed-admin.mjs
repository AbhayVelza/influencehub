// @ts-check
/**
 * Creates (or updates) the first InfluenceHub admin, so there is someone to sign in and add the rest of the team from
 * Settings > Team (there is no sign-up page). Setup: docs/auth.md.
 *
 * Usage: npm run seed:admin   (reads .env.local if present, then the shell)
 * Run it before starting the API server, or restart the server afterwards: the server loads the data at start-up.
 *
 * Environment (put these in .env.local or the shell, never in the committed .env):
 *   ADMIN_EMAIL                     required: the admin's sign-in email
 *   ADMIN_PASSWORD                  required: at least 8 characters; never printed
 *   ADMIN_NAME                      optional: display name (default "Admin")
 *   DATABASE_URL                    required: the PostgreSQL connection string
 *   GOOGLE_APPLICATION_CREDENTIALS  required: path to a Firebase service account key JSON
 *   FIREBASE_PROJECT_ID             optional: when the key file doesn't name the project
 *
 * Idempotent: running it again updates the password and name, keeps created_at, and only seeds the default
 * categories when there are none.
 *
 * Writes:
 *   - Firebase Auth user (emailVerified, displayName) with custom claims { ih_member: true } (storage.rules checks it)
 *   - PostgreSQL team row (id = Firebase uid) = { email (lowercase), name, role: 'admin', is_active: true, created_at }
 *   - PostgreSQL categories rows = { name, is_active: true } for DEFAULT_CATEGORIES, if none exist yet
 * Creates the tables first if they're missing (server/schema.sql). Timestamps are ISO 8601 strings, as the API returns.
 */
import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { applicationDefault, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import postgres from 'postgres'

/** Keep in sync with MIN_PASSWORD_LENGTH in src/lib/auth/types.ts. */
const MIN_PASSWORD_LENGTH = 8

/** Keep in sync with DEFAULT_CATEGORIES in src/lib/constants.ts. */
const DEFAULT_CATEGORIES = [
  'Fashion',
  'Beauty',
  'Food',
  'Tech & Gadgets',
  'Travel',
  'Fitness & Lifestyle',
  'Lifestyle',
  'Gaming & Esports',
  'Finance',
  'Art & Designs',
  'Marketing & Business',
]

/** @param {string} message */
function fail(message) {
  console.error(`seed:admin: ${message}`)
  process.exit(1)
}

/**
 * Reads and checks the environment before touching Firebase or the database.
 * @returns {{ email: string, password: string, name: string, projectId: string | undefined, databaseUrl: string }}
 */
function readConfig() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase() ?? ''
  const password = process.env.ADMIN_PASSWORD ?? ''
  const name = process.env.ADMIN_NAME?.trim() || 'Admin'
  const projectId = process.env.FIREBASE_PROJECT_ID?.trim() || undefined
  const credentials = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim()
  const databaseUrl = process.env.DATABASE_URL?.trim() ?? ''

  const missing = []
  if (!email) missing.push('ADMIN_EMAIL')
  if (!password) missing.push('ADMIN_PASSWORD')
  if (!databaseUrl) missing.push('DATABASE_URL')
  if (!credentials) missing.push('GOOGLE_APPLICATION_CREDENTIALS')
  if (missing.length) fail(`set ${missing.join(', ')} in .env.local or the shell. Never put them in .env.`)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail('ADMIN_EMAIL is not a valid email address.')
  if (password.length < MIN_PASSWORD_LENGTH) fail(`ADMIN_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters.`)
  if (credentials && !existsSync(credentials)) {
    fail(`GOOGLE_APPLICATION_CREDENTIALS points to a file that doesn't exist: ${credentials}`)
  }
  return { email, password, name, projectId, databaseUrl }
}

/**
 * @param {unknown} err
 * @returns {string | undefined}
 */
const errorCode = (err) =>
  err && typeof err === 'object' && 'code' in err && typeof err.code === 'string' ? err.code : undefined

/**
 * Creates the Auth user, or updates the password and name of the existing one.
 * @param {import('firebase-admin/auth').Auth} auth
 * @param {{ email: string, password: string, name: string }} admin
 * @returns {Promise<{ uid: string, created: boolean }>}
 */
async function upsertAuthUser(auth, { email, password, name }) {
  try {
    const existing = await auth.getUserByEmail(email)
    await auth.updateUser(existing.uid, { password, displayName: name, disabled: false })
    return { uid: existing.uid, created: false }
  } catch (err) {
    if (errorCode(err) !== 'auth/user-not-found') throw err
  }
  const user = await auth.createUser({ email, password, displayName: name, emailVerified: true })
  return { uid: user.uid, created: true }
}

/**
 * Upserts the admin's team row, keeping created_at from an earlier run.
 * @param {import('postgres').Sql} sql
 * @param {string} uid
 * @param {{ email: string, name: string }} admin
 */
async function upsertTeamMember(sql, uid, { email, name }) {
  const [existing] = await sql`select data from team where id = ${uid}`
  const createdAt = existing?.data?.created_at ?? new Date().toISOString()
  const data = { email, name, role: 'admin', is_active: true, created_at: createdAt }
  await sql`
    insert into team (id, data) values (${uid}, ${sql.json(data)})
    on conflict (id) do update set data = excluded.data, updated_at = now()`
}

/**
 * Adds DEFAULT_CATEGORIES when there are no categories (configuration, not dummy data).
 * @param {import('postgres').Sql} sql
 * @returns {Promise<number>} how many categories were added
 */
async function seedCategories(sql) {
  const [{ n }] = await sql`select count(*)::int as n from categories`
  if (n > 0) return 0
  for (const name of DEFAULT_CATEGORIES) {
    // Same id format as the app's (src/backend/db.ts, nextId).
    const id = `cat_${randomUUID().replace(/-/g, '').slice(0, 20)}`
    await sql`insert into categories (id, data) values (${id}, ${sql.json({ name, is_active: true })})`
  }
  return DEFAULT_CATEGORIES.length
}

async function main() {
  const config = readConfig()
  const sql = postgres(config.databaseUrl, { max: 1, onnotice: () => undefined })
  try {
    await sql.unsafe(readFileSync(path.join(import.meta.dirname, '../server/schema.sql'), 'utf8'))

    const app = initializeApp({ credential: applicationDefault(), projectId: config.projectId })
    const auth = getAuth(app)
    const { uid, created } = await upsertAuthUser(auth, config)
    await auth.setCustomUserClaims(uid, { ih_member: true })

    const categories = await sql.begin(async (tx) => {
      await upsertTeamMember(tx, uid, config)
      return seedCategories(tx)
    })

    console.log(`seed:admin: ${created ? 'created' : 'updated'} admin ${config.email} (uid ${uid}).`)
    console.log(
      categories
        ? `seed:admin: added ${categories} default categories.`
        : 'seed:admin: categories already exist; left unchanged.',
    )
    console.log('seed:admin: if the API server is running, restart it so it loads these changes.')
  } finally {
    await sql.end({ timeout: 5 })
  }
}

main().catch((/** @type {unknown} */ err) => {
  const code = errorCode(err)
  const message = err instanceof Error ? err.message : String(err)
  // Never echo the password: neither Firebase nor PostgreSQL errors include it, and nothing here prints the config.
  if (code === 'ECONNREFUSED' || code === 'ENOTFOUND' || /password authentication failed|database .* does not exist/i.test(message)) {
    fail(`could not connect to PostgreSQL. Check DATABASE_URL and that the database is running.\n${message}`)
  }
  if (/credential|ENOENT|Could not load the default credentials|invalid_grant/i.test(message)) {
    fail(
      `could not authenticate with Firebase. Check that GOOGLE_APPLICATION_CREDENTIALS points to a valid service ` +
        `account key for the right project.\n${message}`,
    )
  }
  if (/project id/i.test(message)) fail(`set FIREBASE_PROJECT_ID (the key file doesn't name a project).\n${message}`)
  fail(`${code ? `${code}: ` : ''}${message}`)
})
