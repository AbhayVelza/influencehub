# API server and PostgreSQL

With `VITE_API_SERVER=true`, InfluenceHub has two parts: **PostgreSQL** for all data and document files, and the
**API server** (`server/`) in front of it, with email + password **sign-in**. Without `VITE_API_SERVER` the app runs in
**prototype mode** (no server, no sign-in, data in the browser; see README).

## How it works

- **Sign-in (`server/auth.ts`):** email + password; passwords are hashed with scrypt in `credentials`. A successful
  sign-in sets an HttpOnly session cookie (30 days; the token is stored hashed in `sessions`, so restarts keep people
  signed in). Five wrong passwords lock an email for 15 minutes. Changing a password, or an admin setting one, signs
  that person out everywhere else.
- **API server (`server/main.ts`):** the services (`src/services`) call `/api/v1/...` with the session cookie. The
  server refuses requests without a session (401) or from a deactivated member (403), then runs the business rules in `src/backend/handlers` (stages, claims, pool, scoping, permissions, duplicates,
  imports) over a working copy of the data. Prototype mode runs the same handlers in the browser.
- **Data (`server/pg-store.ts`):** the server loads every row from PostgreSQL's relational tables at start-up and,
  after each request that changes something, writes back only the rows that changed, in one transaction (compared
  column by column with what PostgreSQL last had). A request that fails part-way saves nothing. Reads (GET) don't
  save, unless a rule that runs inside a read changed data and said so (`noteChangedOnRead`: auto-release, link
  expiry, a job, the one-time category upgrade); `tests/workspace.test.ts` checks that no other read writes.
  `server/relational.ts` maps the app's records to rows and back.
- **Document files:** `PUT /api/v1/files/<key>` (only for a key handed out by `POST /documents/presign`) stores the
  file in the `files` table; `GET /api/v1/files/<key>` serves it,
  only to a member who may download that document (the rule of `GET /documents/{id}/download`; 404 otherwise).
- **One request at a time, one server:** the server is the only writer, so the rules hold for the whole team (two
  people can't claim the same influencer or add the same handle). Run exactly one instance.
- **First admin:** on start, `ADMIN_EMAIL` / `ADMIN_PASSWORD` (/ `ADMIN_NAME`) become an admin's sign-in (a new
  workspace's owner takes that email). The password is only set while that admin has none, so later changes stick.
  A new workspace also gets the default categories.
- **Instagram:** with `META_ACCESS_TOKEN` and `META_IG_USER_ID` set, the server looks creators up and keeps their stats
  fresh in the background (see "Instagram" below); each sync also records the day's follower count (history, a year)
  and the latest 12 posts.
- **YouTube:** with `YOUTUBE_API_KEY` set, the same for YouTube channels (see "YouTube" below), with the latest 10
  videos. Other platforms and connect links aren't connected: their accounts keep the stats people type in.

| Piece | Where |
|---|---|
| Sign-in, sessions, first admin | `server/auth.ts`; client: `src/lib/auth/index.ts`, `src/pages/login-page.tsx` |
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
   ADMIN_EMAIL=you@yourcompany.com
   ADMIN_PASSWORD=at-least-8-characters
   ADMIN_NAME=Your Name
   ```
   You can delete `ADMIN_PASSWORD` after the first start: it is only used while that admin has no password.

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

1. **Render:** New → Blueprint → this repo (`render.yaml`). Enter `DATABASE_URL` (Supabase session pooler). Check
   `https://<service>.onrender.com/health`.
2. **Vercel** → Project → Settings → Environment Variables (Production): `VITE_API_SERVER=true` and no `VITE_API_URL`,
   then redeploy (read at build time). `vercel.json` forwards `/api/*` to the Render service, so the browser sees one
   site: the session cookie is first-party (cookies between `vercel.app` and `onrender.com` are blocked by Safari and
   others) and no CORS is needed. Change the Render address there if the service moves.
3. **First admin:** `npm run set-password -- --env SUPABASE_DATABASE_URL --email <admin's email>` prints a new
   password; sign in and change it (account menu → Change password). The admin then sets everyone else's password in
   Settings → Team. The same command lets a locked-out admin back in.

`vercel.json` also sends every other path to `index.html`, so deep links and refreshes work. Render's free plan sleeps
after 15 minutes idle (the first request then takes about a minute, Vercel's proxy answers 502, and the Instagram sync
stops; the server requests its own `RENDER_EXTERNAL_URL/health` every 10 minutes to prevent that, and
`.github/workflows/keep-alive.yml` pings too, as a backup: GitHub often delays or skips scheduled runs) and briefly runs two instances during a deploy, so
deploy when nobody is editing. Every API call and file needs a signed-in, active member, so production no longer needs
Vercel's Deployment Protection.

Server environment: `DATABASE_URL` (required), `PORT` (default 3001), `STATIC_DIR` (default `dist`), `CORS_ORIGIN`
(comma-separated origins; only when the app is served from elsewhere, together with `VITE_API_URL` in the app's
build). `GET /health` answers 200 when PostgreSQL is reachable.

**Security:** put the server behind HTTPS (e.g. Caddy) before anyone outside your machine uses it: passwords and the
session cookie travel over the network.

## Instagram (Meta Business Discovery)

The server looks up Instagram creators by handle through our own Instagram professional account (`@velzaglobalin`,
linked to the Velza Global India Facebook Page), using Meta's Business Discovery API (`server/meta.ts`). Only
Business and Creator accounts can be looked up; personal profiles answer "not found".

- **Environment (secret):** `META_ACCESS_TOKEN` (a Page token, which never expires) and `META_IG_USER_ID` (our Instagram
  account's id). On Render: Dashboard → influencehub-api → Environment. The log says `Instagram connected: @…` on start.
- **Making the token:** Graph API Explorer, app influencerhub, **Get User Access Token** with `instagram_basic`,
  `instagram_manage_insights`, `pages_show_list`, `pages_read_engagement`, `business_management`, `ads_read`. Then swap
  it for a 60-day token (`/oauth/access_token?grant_type=fb_exchange_token`, needs `META_APP_ID` / `META_APP_SECRET`)
  and read the Page's token from `/me/accounts`: that one doesn't expire. Meta still cuts data access if nobody
  re-approves the app for about 90 days; Settings → Instagram then shows the connection as expired.
- **What it fills in:** name, picture, bio, website, followers, following, posts, and from the last 12 posts average
  likes, average comments and engagement rate.
- **Background sync (`server/sync-worker.ts`):** one creator about every 40 s (~90 an hour, under Meta's hourly
  allowance), paused while Meta reports 75% used. Order: accounts queued by Sync now / CSV import / **Auto-sync** /
  **Sync profiles**, then never-synced ones, then any not synced in the last 7 days (auto-sync; the only interval).
  **Sync profiles** (admins, Influencers and Settings → Instagram) queues every account on a connected platform, so
  it refreshes them right away whenever it's clicked (including ones whose last sync failed).
- **Typed-in accounts:** CSV imports with a followers column create manual accounts. **Auto-sync IG** (bulk bar) or
  **Auto-sync** (influencer → account) switches them; their numbers stay until Instagram's arrive.

## YouTube (YouTube Data API v3)

The server looks YouTube channels up by handle (`@handle`) with an API key (`server/youtube.ts`). No sign-in by the
creator is needed; the key only reads public data.

- **Making the key:** [Google Cloud console](https://console.cloud.google.com/) → project picker → **New project**
  (e.g. `influencehub`) → **APIs & Services → Library** → search **YouTube Data API v3** → **Enable** → **APIs &
  Services → Credentials** → **Create credentials → API key** → open the new key → **API restrictions → Restrict key**
  → tick **YouTube Data API v3** → **Save**. (Application restrictions can stay "None": Render has no fixed address.)
- **Environment (secret):** `YOUTUBE_API_KEY` in `.env.local` and on Render (Dashboard → influencehub-api →
  Environment). On start the server spends 1 quota unit checking the key; the log says `YouTube connected` or
  `YouTube not connected: …` (a wrong key, or the API not enabled in that project).
- **Quota:** 10,000 units a day per project, reset at midnight Pacific time (12:30 IST in summer, 13:30 IST in
  winter). A lookup or sync costs 3 units (channel, its latest 10 uploads, their stats; 1 for a channel without
  videos), so about 3,300 a day. The background sync stops for the day at 8,000 units, keeping the rest for Look up
  and Sync now. The search endpoint (100 units) is never used. More quota: Google Cloud console →
  IAM & Admin → Quotas, or YouTube's audit form.
- **What it fills in:** name, picture, description (bio), the channel's own link, subscribers (unless the channel
  hides them), total views, videos, average views of the latest 10 uploads, channel country, and those videos as
  recent posts. A link to another platform in the description is offered as "Also found" on lookup.
- **Background sync:** its own loop, one channel about every 15 s (~240 an hour), same order and same 7-day
  auto-sync as Instagram, up to ~2,600 channel syncs a day (8,000 units; far more than 7-day auto-sync needs). Then it stops until midnight Pacific time,
  so ~660 lookups or Sync nows stay available; if the quota still runs out, those answer "rate limited" until then.
  The count restarts at 0 when the server restarts. YouTube runs don't show in Settings → Instagram → Recent runs.

## PostgreSQL layout

Relational tables with primary keys, foreign keys, checks and indexes (`server/schema.sql`; the full design is in the
SDLC specification, section 9). Ids are the app's ids (`inf_…`, `call_…`, `usr_…`); `seq` keeps creation order.

| Table | Contents |
|---|---|
| `team_members` | `User`; soft delete via `deleted_at`; email unique among undeleted members |
| `categories` | name (unique, case-insensitive), is_active |
| `influencers` | `Influencer` with the address and checklist as columns; `category_id` → categories, `assigned_to` → team_members. Kept columns (`platforms`, `has_agreement`, `insights_count`, `ever_onboarded`, `claimed_at`, `stage_before_hold`, `stage_changed_at`, `search_text`) are written by the server for SQL use; the app never reads them back |
| `social_accounts` | `SocialAccount`; unique (`platform`, `handle`); one primary per influencer; `metrics` jsonb; kept `audience` |
| `account_snapshots` | audience history written by each sync: one row per account per IST day, the last 365 days; never loaded into memory |
| `account_media` | the recent posts the last sync returned (`position` 0 = newest; `likes` null when hidden), replaced per sync; never loaded into memory |
| `calls`, `activities`, `saved_views` | `CallLog`, `Activity` (`payload` jsonb), `SavedView` (`filters` jsonb) |
| `packages`, `package_items` | `Package` (address as columns) and its items |
| `documents` | `InfluencerDocument` + `deleted_at` (soft delete) + `storage_key` → files; one current agreement per influencer |
| `files` | document files: `key`, `content_type`, `size`, `data` (bytea), `created_at` — never loaded into memory |
| `dismissed_duplicates` | pairs (`influencer_a`, `influencer_b`) a manager marked "not the same creator" |
| `pool_settings`, `instagram_settings`, `sync_runs` | single-row settings and the integration's recent runs |
| `schema_migrations` | one-time data upgrades done (e.g. `categories_upgraded`) |
| `jobs` | finished jobs of the last hour (`status`, `result`/`error` jsonb), so a poll finds them after a restart |
| `csv_uploads` | CSV files uploaded and not yet imported (the latest 5) |
| `credentials` | `user_id`, `password_hash` (scrypt); never loaded into memory |
| `sessions` | `token_hash` (SHA-256 of the cookie token), `user_id`, `expires_at` |

Deleting an influencer removes its accounts, calls, packages, documents, activity and dismissed pairs (cascade);
removing an account removes its snapshots and posts. Accounts are saved by upsert (only removed accounts are deleted),
so saving an influencer never touches its history.
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
- Other people's changes appear within about a second while the live-updates stream is open (Live updates below),
  otherwise when the app next refetches (30 s stale time, 60 s polling on some screens).
- Auto-release of stale claims and connect-link expiry run at the start of every request (no scheduler).

## Troubleshooting

- **Every screen says "Something went wrong. Check your connection":** the API server isn't running (`npm run server`;
  `GET /health`), or `VITE_API_SERVER=true` is set but the server is elsewhere (`VITE_API_URL`).
- **The server won't start:** `DATABASE_URL` is missing or wrong, or PostgreSQL isn't running (Windows: the
  `postgresql-x64-17` service).
- **Can't sign in as the admin:** `ADMIN_EMAIL` / `ADMIN_PASSWORD` weren't set when the server started (its log says
  "No one can sign in yet"). Set them in `.env.local` and restart, or run `npm run set-password` (Deploying, step 3).
- **Data you entered isn't on the server:** `VITE_API_SERVER` isn't `true`, so the app is in prototype mode (data in
  the browser). Restart `npm run dev` after editing env files.

## Live updates

`GET /api/v1/events` (`server/live.ts`) is a Server-Sent Events stream for signed-in, active members. After every save
that changed data each open stream gets `data: {"v":<n>}`, and the app refetches what it shows (`src/lib/live.ts`):
at most one event per 300 ms after members' requests, and at most one per minute for the Instagram / YouTube sync and
the scheduler (each event makes every open screen refetch). Events carry no data; the number starts at the boot time,
so a browser reconnecting after a restart refreshes. A `: ping` comment every 25 s keeps the stream open through
proxies and rechecks the session. Limits: 200 streams, 10 per member (503 beyond). Only the sign-in check uses the
request queue; the open stream doesn't hold it.

- **Visible tabs only:** a hidden tab closes its stream and reopens it when shown. Over plain HTTP/1.1 (`npm run dev`,
  or `npm run server` on http://localhost) a browser allows about 6 connections per host, so 6 visible windows of the
  app would leave none for API calls; Vercel and Render serve HTTP/2, where streams share one connection.

- **Vercel:** the app's `/api/*` rewrite (`vercel.json`) proxies the stream to Render, and Vercel may end a proxied
  response after a while. The browser reconnects by itself (3 s), refreshing if it missed a change, so this only
  costs a reconnect. A stream that keeps failing is retried with backoff (5 s up to 5 minutes), and the normal polling
  (`staleTime` 30 s, `refetchInterval` 60 s) still runs, so nothing depends on the stream.
- **Check it:** sign in, copy the `ih_session` cookie from the browser, then
  `curl -N -H "Cookie: ih_session=<value>" http://localhost:3001/api/v1/events`. It prints `retry: 3000` and
  `data: {"v":…}`, a new event after each change, and `: ping` every 25 s.
- Prototype mode has no server: tabs of the same browser tell each other through a BroadcastChannel, and a tab never
  saves over another tab's newer save (a revision check; docs/contract-decisions.md, "Live updates").

## Scheduler

`server/scheduler.ts` runs every 5 minutes (first run 30 s after start): pool auto-release, connect-link expiry,
the purge of documents deleted more than 30 days ago, then `deleteOrphanFiles()` (files no document points to, older
than a day). It saves only when something changed and logs `Scheduler: …` when it did.
