import { readFileSync } from 'node:fs'
import postgres from 'postgres'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

// Follower snapshots on real PostgreSQL (server/pg-store.ts): one row per account per IST day, 365 days kept, and the
// daily clean-up of accounts that stopped syncing. Runs only with TEST_DATABASE_URL set to an EMPTY throwaway
// database or schema (never `public`): it creates `social_accounts` (id only) and `account_snapshots` (as in
// server/schema.sql) there and drops them after. A schema is chosen with ?search_path=… on the URL, e.g.
//   CREATE SCHEMA ih_snapshot_check;  then
//   TEST_DATABASE_URL='postgres://user:pass@localhost:5432/influencehub?search_path=ih_snapshot_check' npx vitest run tests/pg-snapshots.test.ts

const url = process.env.TEST_DATABASE_URL?.trim()

describe.skipIf(!url)('PostgreSQL follower snapshots', () => {
  let sql: postgres.Sql
  let store: typeof import('../server/pg-store')

  const rows = async (accountId: string) =>
    (await sql<{ captured_at: Date; audience: string }[]>`
      select captured_at, audience from account_snapshots where account_id = ${accountId} order by captured_at`).map((r) => ({
      at: r.captured_at.toISOString(),
      audience: Number(r.audience),
    }))

  beforeAll(async () => {
    sql = postgres(url!, { onnotice: () => undefined })
    const [{ n, schema: current }] = await sql<{ n: number; schema: string }[]>`
      select count(*)::int as n, current_schema() as schema from information_schema.tables where table_schema = current_schema()`
    if (n > 0 || current === 'public') throw new Error('TEST_DATABASE_URL must point at an empty throwaway schema or database.')
    const schema = readFileSync('server/schema.sql', 'utf8')
    const snapshots = schema.match(/CREATE TABLE IF NOT EXISTS account_snapshots \([\s\S]*?\n\);/)![0]
    await sql.unsafe('CREATE TABLE social_accounts (id text PRIMARY KEY)')
    await sql.unsafe(snapshots)
    process.env.DATABASE_URL = url
    store = await import('../server/pg-store')
  })

  afterAll(async () => {
    await store?.stop()
    await sql?.unsafe('DROP TABLE IF EXISTS account_snapshots; DROP TABLE IF EXISTS social_accounts')
    await sql?.end()
  })

  beforeEach(async () => {
    await sql`delete from social_accounts`
    await sql`insert into social_accounts (id) values ('acc_a'), ('acc_b')`
  })

  it('one row per IST day: a later sync that day replaces it, the next IST day adds one', async () => {
    await store.platformData.recordSnapshot('acc_a', 1_000, '2026-11-20T03:00:00.000Z') // 08:30 IST
    await store.platformData.recordSnapshot('acc_a', 1_200, '2026-11-20T18:00:00.000Z') // 23:30 IST, same day
    expect(await rows('acc_a')).toEqual([{ at: '2026-11-20T18:00:00.000Z', audience: 1_200 }])
    await store.platformData.recordSnapshot('acc_a', 1_300, '2026-11-20T19:00:00.000Z') // 00:30 IST on the 21st
    expect((await rows('acc_a')).map((r) => r.audience)).toEqual([1_200, 1_300])
    // The API reads them back oldest first.
    expect(await store.platformData.listSnapshots('acc_a')).toEqual([
      { captured_at: '2026-11-20T18:00:00.000Z', audience: 1_200 },
      { captured_at: '2026-11-20T19:00:00.000Z', audience: 1_300 },
    ])
  })

  it('a sync drops its own snapshots older than 365 days and keeps one exactly 365 days old', async () => {
    await store.platformData.recordSnapshot('acc_a', 1, '2025-11-19T06:00:00.000Z') // 366 days before
    await store.platformData.recordSnapshot('acc_a', 2, '2025-11-20T06:00:00.000Z') // exactly 365 days before
    await store.platformData.recordSnapshot('acc_b', 9, '2025-01-01T06:00:00.000Z') // another account: untouched
    await store.platformData.recordSnapshot('acc_a', 3, '2026-11-20T06:00:00.000Z')
    expect((await rows('acc_a')).map((r) => r.audience)).toEqual([2, 3])
    expect(await rows('acc_b')).toHaveLength(1)
  })

  it('the daily clean-up removes old snapshots of every account, including ones no longer synced', async () => {
    await sql`insert into account_snapshots (account_id, captured_at, audience) values
      ('acc_a', '2025-10-01T06:00:00Z', 1), ('acc_a', '2026-11-01T06:00:00Z', 2),
      ('acc_b', '2025-01-01T06:00:00Z', 3), ('acc_b', '2025-11-21T06:00:00Z', 4)`
    expect(await store.pruneSnapshots(new Date('2026-11-20T06:00:00Z'))).toBe(2)
    expect((await rows('acc_a')).map((r) => r.audience)).toEqual([2])
    expect((await rows('acc_b')).map((r) => r.audience)).toEqual([4])
    expect(await store.pruneSnapshots(new Date('2026-11-20T06:00:00Z'))).toBe(0)
  })

  it('an account removed meanwhile gets nothing; removing an account removes its history', async () => {
    await store.platformData.recordSnapshot('acc_missing', 5, '2026-11-20T06:00:00.000Z')
    expect(await rows('acc_missing')).toEqual([])
    await store.platformData.recordSnapshot('acc_a', 5, '2026-11-20T06:00:00.000Z')
    await sql`delete from social_accounts where id = 'acc_a'`
    expect(await rows('acc_a')).toEqual([])
  })
})
