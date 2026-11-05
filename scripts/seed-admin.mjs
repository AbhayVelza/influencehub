// @ts-check
/**
 * Creates (or updates) the first InfluenceHub admin in Firebase, so there is someone to sign in and add the rest of
 * the team from Settings > Team (there is no sign-up page). Setup: docs/auth.md.
 *
 * Usage: npm run seed:admin   (reads .env.local if present, then the shell)
 *
 * Environment (put these in .env.local or the shell, never in the committed .env):
 *   ADMIN_EMAIL                     required: the admin's sign-in email
 *   ADMIN_PASSWORD                  required: at least 8 characters; never printed
 *   ADMIN_NAME                      optional: display name (default "Admin")
 *   GOOGLE_APPLICATION_CREDENTIALS  required: path to a Firebase service account key JSON
 *   FIREBASE_PROJECT_ID             optional: when the key file doesn't name the project
 *
 * Idempotent: running it again updates the password and name, keeps created_at, and only seeds the default
 * categories when the categories collection is empty.
 *
 * Writes:
 *   - Firebase Auth user (emailVerified, displayName) with custom claims { role: 'admin' }
 *   - Firestore team/{uid} = { email (lowercase), name, role: 'admin', is_active: true, created_at, updated_at }
 *   - Firestore categories/* = { name, is_active: true, created_at } for DEFAULT_CATEGORIES, if none exist yet
 * Timestamps are ISO 8601 strings, the format the API returns.
 */
import { existsSync } from 'node:fs'
import { applicationDefault, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'

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
  'Other',
]

/** @param {string} message */
function fail(message) {
  console.error(`seed:admin: ${message}`)
  process.exit(1)
}

/**
 * Reads and checks the environment before touching Firebase.
 * @returns {{ email: string, password: string, name: string, projectId: string | undefined }}
 */
function readConfig() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase() ?? ''
  const password = process.env.ADMIN_PASSWORD ?? ''
  const name = process.env.ADMIN_NAME?.trim() || 'Admin'
  const projectId = process.env.FIREBASE_PROJECT_ID?.trim() || undefined
  const credentials = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim()

  const missing = []
  if (!email) missing.push('ADMIN_EMAIL')
  if (!password) missing.push('ADMIN_PASSWORD')
  if (!credentials) missing.push('GOOGLE_APPLICATION_CREDENTIALS')
  if (missing.length) {
    fail(`set ${missing.join(', ')} in .env.local or the shell (see .env.example). Never put them in .env.`)
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail('ADMIN_EMAIL is not a valid email address.')
  if (password.length < MIN_PASSWORD_LENGTH) fail(`ADMIN_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters.`)
  if (credentials && !existsSync(credentials)) {
    fail(`GOOGLE_APPLICATION_CREDENTIALS points to a file that doesn't exist: ${credentials}`)
  }
  return { email, password, name, projectId }
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
 * Upserts team/{uid}, keeping created_at from an earlier run.
 * @param {import('firebase-admin/firestore').Firestore} db
 * @param {string} uid
 * @param {{ email: string, name: string }} admin
 */
async function upsertTeamMember(db, uid, { email, name }) {
  const ref = db.collection('team').doc(uid)
  const now = new Date().toISOString()
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    const createdAt = snap.exists ? snap.get('created_at') ?? now : now
    tx.set(ref, { email, name, role: 'admin', is_active: true, created_at: createdAt, updated_at: now })
  })
}

/**
 * Adds DEFAULT_CATEGORIES when the categories collection is empty (configuration, not dummy data).
 * @param {import('firebase-admin/firestore').Firestore} db
 * @returns {Promise<number>} how many categories were added
 */
async function seedCategories(db) {
  const existing = await db.collection('categories').limit(1).get()
  if (!existing.empty) return 0
  const now = new Date().toISOString()
  const batch = db.batch()
  for (const name of DEFAULT_CATEGORIES) {
    batch.set(db.collection('categories').doc(), { name, is_active: true, created_at: now })
  }
  await batch.commit()
  return DEFAULT_CATEGORIES.length
}

async function main() {
  const config = readConfig()
  const app = initializeApp({ credential: applicationDefault(), projectId: config.projectId })
  const auth = getAuth(app)
  const db = getFirestore(app)

  const { uid, created } = await upsertAuthUser(auth, config)
  await auth.setCustomUserClaims(uid, { role: 'admin' })
  await upsertTeamMember(db, uid, config)
  const categories = await seedCategories(db)

  console.log(`seed:admin: ${created ? 'created' : 'updated'} admin ${config.email} (uid ${uid}).`)
  console.log(
    categories
      ? `seed:admin: added ${categories} default categories.`
      : 'seed:admin: categories already exist; left unchanged.',
  )
}

main().catch((/** @type {unknown} */ err) => {
  const code = errorCode(err)
  const message = err instanceof Error ? err.message : String(err)
  // Never echo the password: Firebase errors don't include it, and nothing here prints the config.
  if (/credential|ENOENT|Could not load the default credentials|invalid_grant/i.test(message)) {
    fail(
      `could not authenticate with Firebase. Check that GOOGLE_APPLICATION_CREDENTIALS points to a valid service ` +
        `account key for the right project.\n${message}`,
    )
  }
  if (/project id/i.test(message)) fail(`set FIREBASE_PROJECT_ID (the key file doesn't name a project).\n${message}`)
  fail(`${code ? `${code}: ` : ''}${message}`)
})
