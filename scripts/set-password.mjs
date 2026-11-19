// Sets a team member's sign-in password straight in the database: the first admin of a deployment, or an admin who
// is locked out. Everyone else gets a password from an admin (Settings → Team → Set password).
//
//   npm run set-password -- --env SUPABASE_DATABASE_URL --email someone@example.com [--password <at least 8 chars>]
//
// Without --password a strong one is generated and printed once. It signs that member out everywhere. The hash
// format matches server/auth.ts (scrypt, 16-byte salt, 64-byte key).
import { randomBytes, scrypt } from 'node:crypto'
import postgres from 'postgres'

const args = process.argv.slice(2)
const option = (name) => {
  const i = args.indexOf(name)
  return i === -1 ? undefined : args[i + 1]
}
const fail = (message) => {
  console.error(message)
  process.exit(1)
}

const envName = option('--env')
const url = envName && process.env[envName]?.trim()
if (!url) fail('Name the database: --env <VARIABLE> (set in .env.local).')
const email = option('--email')?.trim().toLowerCase()
if (!email) fail('Give the member: --email <address>')
const password = option('--password') ?? randomBytes(15).toString('base64url')
if (password.length < 8) fail('Use at least 8 characters.')

const salt = randomBytes(16)
const key = await new Promise((resolve, reject) => scrypt(password, salt, 64, (err, k) => (err ? reject(err) : resolve(k))))
const hash = `scrypt$${salt.toString('base64')}$${key.toString('base64')}`

const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url)
const sql = postgres(url, { max: 1, onnotice: () => undefined, ssl: local ? false : 'require', prepare: false })
try {
  const [member] = await sql`select id, name, is_active from team_members where lower(email) = ${email} and deleted_at is null`
  if (!member) fail(`No team member with the email ${email}.`)
  await sql.begin(async (tx) => {
    // The API server creates these at start-up too (server/schema.sql).
    await tx`CREATE TABLE IF NOT EXISTS credentials (user_id text PRIMARY KEY, password_hash text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())`
    await tx`CREATE TABLE IF NOT EXISTS sessions (token_hash text PRIMARY KEY, user_id text NOT NULL, expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now())`
    await tx`insert into credentials (user_id, password_hash) values (${member.id}, ${hash})
      on conflict (user_id) do update set password_hash = excluded.password_hash, updated_at = now()`
    await tx`delete from sessions where user_id = ${member.id}`
  })
  console.log(`Password set for ${member.name} (${email})${member.is_active ? '' : ' — note: this member is deactivated and can’t sign in'}.`)
  if (!option('--password')) console.log(`Password: ${password}`)
} finally {
  await sql.end({ timeout: 5 })
}
