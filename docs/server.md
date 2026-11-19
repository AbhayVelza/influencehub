# API server and PostgreSQL

With `VITE_API_SERVER=true`, InfluenceHub has two parts: **PostgreSQL** for all data and document files, and the
**API server** (`server/`) in front of it. There is **no sign-in yet**: the account menu's **Acting as** picks which team
member you are. Without `VITE_API_SERVER` the app runs in **prototype mode** (no server, data in the browser; see README).

## How it works

- **API server (`server/main.ts`):** the services (`src/services`) call `/api/v1/...` with the acting member's id in
  the `X-Acting-As` header. The server resolves the member (an active admin if that member is gone or deactivated),
  then runs the business rules in `src/backend/handlers` (stages, claims, pool, scoping, permissions, duplicates,
  imports) over a working copy of the data. Prototype mode runs the same handlers in the browser.
- **Data (`server/pg-store.ts`):** the server loads every row from PostgreSQL's relational tables at start-up and,
  after each request that changes something, writes back only the rows that changed, in one transaction (compared
  column by column with what PostgreSQL last had). A request that fails part-way saves nothing. Reads (GET) don't
  save, unless a rule that runs inside a read changed data and said so (`noteChangedOnRead`: auto-release, link
  expiry, a job, the one-time category upgrade); `tests/workspace.test.ts` checks that no other read writes.
  `server/relational.ts` maps the app's records to rows and back.
- **Document files:** `PUT /api/v1/files/<key>` (only for a key handed out by `POST /documents/presign`) stores the
  file in the `files` table; `GET /api/v1/files/<key>` serves it.
- **One request at a time, one server:** the server is the only writer, so the rules hold for the whole team (two
  people can't claim the same influencer or add the same handle). Run exactly one instance.
- **New workspace:** on first start the server adds the owner admin (`usr_owner`) and the default categories.
- **Not connected yet:** public profile lookup, **Sync now**, connect links and growth history need the social
  platforms' APIs. Accounts keep the stats people type in.

| Piece | Where |
|---|---|
| Acting member (no sign-in) | `src/lib/auth/index.ts` (`currentAuthUid`, `switchUser`), `resolveActingUid` in `src/backend/db.ts` |
| Business rules (shared by server and prototype) | `src/backend/` (`handlers/`, `domain.ts`, `db.ts`) |
| API server | `server/main.ts` (HTTP, request queue, files, static app), `vite.server.config.ts` (build) |
| PostgreSQL store and tables | `server/pg-store.ts`, `server/relational.ts` (records ↔ rows), `server/schema.sql` |
| Migration from the old layout | `server/migrate.ts` (`npm run db:migrate`) |
| Prototype store (browser) | `src/backend/index.ts`, `src/backend/local-store.ts` |

## Set up (once)

1. Install PostgreSQL and create a database and a user that owns it, e.g. in `psql` as `postgres`:
   ```sql
   CREATE USER influencehub WITH PASSWORD '<choose-one>';
   CREATE DATABASE influencehub OWNER influencehub;
   ```
   The server creates its tables on first start.
2. **`.env.local`** (gitignored; never the committed `.env`):
   ```
   DATABASE_URL=postgres://influencehub:<password>@localhost:5432/influencehub
   VITE_API_SERVER=true
   ```

## Run it

| Command | What it does |
|---|---|
| `npm run server` | Builds the server (`dist-server/`) and starts it on port 3001 (`PORT` to change). |
| `npm run dev` | The app on port 3000; it forwards `/api` to the server. |
| `npm run build` then `npm run server` | Production: the server also serves the built app from `dist/`, one process on one port. |
| `npm start` | Starts an already-built server. |
| `npm run server:supabase` | Same server, but over Supabase (`SUPABASE_DATABASE_URL`) instead of local PostgreSQL. |
| `npm run db:copy` | Copies all data + files local → Supabase (`-- --from supabase` for Supabase → local). Refuses a target that has data unless `-- --replace`, and either database on the old layout. Stop the server first. |
| `npm run db:migrate -- --env <VAR>` | Moves a database from the old layout to the relational tables (see Migrating below). |

## Migrating a database from the old layout

Before Nov 2026 every table held one jsonb `data` row per record. The server now refuses to start on such a database
("This database still uses the old layout"). To migrate it:

1. Stop the server and back the database up: `pg_dump "$DATABASE_URL" -Fc -f influencehub-before-migration.dump`.
2. Try it first on a copy: restore the dump into a test database, then
   `npm run db:migrate -- --env TEST_DATABASE_URL --dry-run` (the variable holding the test connection string).
3. Run it for real on the copy (no `--dry-run`), start a server against it and check the app.
4. Then the real database: `npm run db:migrate -- --env DATABASE_URL --i-have-a-backup`.

`--env` is required, so the target is always chosen on purpose; `DATABASE_URL` and `SUPABASE_DATABASE_URL` also need
`--i-have-a-backup`. Everything runs in one transaction: the old tables move, untouched, to a `legacy` schema; the new
tables are created and filled; then every record is rebuilt from the new tables and compared with the original. Any
difference rolls everything back. It prints old and new row counts.

**Rollback:** `npm run db:migrate -- --env <VAR> --rollback --confirm` drops the new tables and moves the old ones back
(anything written since the migration is lost; restoring the backup does the same). Once the new layout has run
without problems for a release, drop the old tables: `DROP SCHEMA legacy CASCADE`.

**Supabase (shared test database).** PostgreSQL stays the database; Supabase is just a hosted PostgreSQL that the
team tests on. Put its connection string (Project → Connect → Session pooler, port 5432) in `.env.local` as
`SUPABASE_DATABASE_URL`. TLS is used for any non-localhost host; the transaction pooler (port 6543) works too
(prepared statements off). Only **one** server may run against a database (it keeps a working copy in memory), so
testers share one running server rather than each starting their own against Supabase.

## Deploying (Vercel + Render + Supabase)

Vercel serves only the built app; it can't run the API server (one long-running process with the data in memory).
The server runs on Render, over the Supabase database.

1. **Render:** New → Blueprint → this repo (`render.yaml`). Enter `DATABASE_URL` (Supabase session pooler) and
   `CORS_ORIGIN` (the Vercel address, e.g. `https://influencehub.vercel.app`). Check `https://<service>.onrender.com/health`.
2. **Vercel** → Project → Settings → Environment Variables (Production): `VITE_API_SERVER=true`,
   `VITE_API_URL=https://<service>.onrender.com`, then redeploy (they are read at build time).
3. **Vercel** → Settings → Deployment Protection: protect production too, so only invited people open the app.

`vercel.json` sends every path to `index.html`, so deep links and refreshes work. Render's free plan sleeps after
15 minutes idle (the first request then takes about a minute) and briefly runs two instances during a deploy, so
deploy when nobody is editing. The API address itself is not protected: anyone who finds it can call it until
sign-in is back.

Server environment: `DATABASE_URL` (required), `PORT` (default 3001), `STATIC_DIR` (default `dist`), `CORS_ORIGIN`
(comma-separated origins; only when the app is served from elsewhere, together with `VITE_API_URL` in the app's
build). `GET /health` answers 200 when PostgreSQL is reachable.

**Sign-in was removed for now** (management demo). The custom email + password sign-in is in git history (commit
`2b3a498`); `git revert` the commit that removed it to bring it back.

**Security:** with no sign-in, anyone who can reach the server can use the app as any member. Keep it on your own
machine or a private network until sign-in is added.

## PostgreSQL layout

Relational tables with primary keys, foreign keys, checks and indexes (`server/schema.sql`; the full design is in the
SDLC specification, section 9). Ids are the app's ids (`inf_…`, `call_…`, `usr_…`); `seq` keeps creation order.

| Table | Contents |
|---|---|
| `team_members` | `User`; soft delete via `deleted_at`; email unique among undeleted members |
| `categories` | name (unique, case-insensitive), is_active |
| `influencers` | `Influencer` with the address and checklist as columns; `category_id` → categories, `assigned_to` → team_members. Kept columns (`platforms`, `has_agreement`, `insights_count`, `ever_onboarded`, `claimed_at`, `stage_before_hold`, `stage_changed_at`, `search_text`) are written by the server for SQL use; the app never reads them back |
| `social_accounts` | `SocialAccount`; unique (`platform`, `handle`); one primary per influencer; `metrics` jsonb; kept `audience` |
| `account_snapshots` | audience history (empty until platform sync exists) |
| `calls`, `activities`, `saved_views` | `CallLog`, `Activity` (`payload` jsonb), `SavedView` (`filters` jsonb) |
| `packages`, `package_items` | `Package` (address as columns) and its items |
| `documents` | `InfluencerDocument` + `deleted_at` (soft delete) + `storage_key` → files; one current agreement per influencer |
| `files` | document files: `key`, `content_type`, `size`, `data` (bytea), `created_at` — never loaded into memory |
| `dismissed_duplicates` | pairs (`influencer_a`, `influencer_b`) a manager marked "not the same creator" |
| `pool_settings`, `instagram_settings`, `sync_runs` | single-row settings and the integration's recent runs |
| `schema_migrations` | one-time data upgrades done (e.g. `categories_upgraded`) |
| `jobs` | finished jobs of the last hour (`status`, `result`/`error` jsonb), so a poll finds them after a restart |
| `csv_uploads` | CSV files uploaded and not yet imported (the latest 5) |

Deleting an influencer removes its accounts, calls, packages, documents, activity and dismissed pairs (cascade).
Team members are only soft-deleted, so rows that name them always resolve.

To read it in SQL: `select name, stage, total_reach from influencers order by total_reach desc nulls last;`

Don't edit rows while the server is running: it holds its own copy and would overwrite or ignore your change. Stop
it, edit, start it.

## Backups

One `pg_dump` holds everything (document files are in the `files` table). `scripts/db-backup.mjs` needs the
PostgreSQL 17 client tools (`pg_dump`, `pg_restore`, `psql`; on Windows it finds them in `C:\Program Files\PostgreSQL`).

- **Daily, automatic:** `.github/workflows/db-backup.yml` backs Supabase up at 02:00 IST, restores the dump into a
  throwaway PostgreSQL and checks every table's row count, then keeps the dump **encrypted** (the repository is
  public) as a workflow artifact for 30 days. It needs two repository secrets: `SUPABASE_DATABASE_URL` and
  `BACKUP_PASSPHRASE` (keep a copy of the passphrase outside GitHub). Run it by hand from Actions → Database backup.
- **By hand:** `npm run db:backup -- backup --env SUPABASE_DATABASE_URL` writes `influencehub-supabase-<time>.dump`
  and its `.counts.json` to `~/influencehub-backups` (`--out <folder>` to choose).
- **Restore test:** `npm run db:backup -- verify --env RESTORE_TEST_DATABASE_URL --file <x.dump>` restores into an
  empty scratch database and compares every table's row count. It refuses `DATABASE_URL` and
  `SUPABASE_DATABASE_URL`.
- **Restore:** decrypt a downloaded artifact (`gpg --decrypt x.dump.gpg > x.dump`), stop the API server (Render:
  suspend the service), back up the target, then `npm run db:backup -- restore --env SUPABASE_DATABASE_URL --file
  x.dump --replace-data`, and start the server again. The `public` and `legacy` schemas are dropped and recreated
  from the dump, in one transaction.

## Limits to know

- The whole workspace (not the files) is in server memory. At 100,000 influencers (`npm run test:perf`, NFR-01)
  lists and filter options answer in ~60–120 ms, the pipeline in ~200–250 ms, the dashboard in ~250–450 ms, and a
  change takes ~1 s to compare and save; that needs a few hundred MB of memory, more than Render's free plan (512 MB,
  0.1 CPU) gives. Beyond that, move the handlers to SQL queries.
- A pipeline column sends its 200 longest-waiting cards (`PIPELINE_COLUMN_LIMIT`); its count is the whole column.
- One server instance only. A second one would overwrite the first one's changes.
- Jobs (CSV import, export) run inside the request that starts them, and their outcome is saved with it (`jobs`), so
  polling works across a restart; outcomes are dropped after an hour. A CSV waiting to be imported is saved too
  (`csv_uploads`).
- Other people's changes appear when the app next refetches, not instantly.
- Auto-release of stale claims and connect-link expiry run at the start of every request (no scheduler).

## Troubleshooting

- **Every screen says "Something went wrong. Check your connection":** the API server isn't running (`npm run server`;
  `GET /health`), or `VITE_API_SERVER=true` is set but the server is elsewhere (`VITE_API_URL`).
- **The server won't start:** `DATABASE_URL` is missing or wrong, or PostgreSQL isn't running (Windows: the
  `postgresql-x64-17` service).
- **Data you entered isn't on the server:** `VITE_API_SERVER` isn't `true`, so the app is in prototype mode (data in
  the browser). Restart `npm run dev` after editing env files.
