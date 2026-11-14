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
- **Data (`server/pg-store.ts`):** the server loads every record from PostgreSQL at start-up and, after each request,
  writes back only the records that changed, in one transaction. A request that fails part-way saves nothing.
- **Document files:** `PUT /api/v1/files/<key>` (only for a key handed out by `POST /documents/presign`) stores the
  file in the `files` table; `GET /api/v1/files/<key>` serves it.
- **One request at a time, one server:** the server is the only writer, so the rules hold for the whole team (two
  people can't claim the same influencer or add the same handle). Run exactly one instance.
- **First admin:** on start, `ADMIN_EMAIL` / `ADMIN_PASSWORD` (/ `ADMIN_NAME`) become an admin's sign-in (a new
  workspace's owner takes that email). The password is only set while that admin has none, so later changes stick.
  A new workspace also gets the default categories.
- **Not connected yet:** public profile lookup, **Sync now**, connect links and growth history need the social
  platforms' APIs. Accounts keep the stats people type in.

| Piece | Where |
|---|---|
| Sign-in, sessions, first admin | `server/auth.ts`; client: `src/lib/auth/index.ts`, `src/pages/login-page.tsx` |
| Business rules (shared by server and prototype) | `src/backend/` (`handlers/`, `domain.ts`, `db.ts`) |
| API server | `server/main.ts` (HTTP, request queue, files, static app), `vite.server.config.ts` (build) |
| PostgreSQL store and tables | `server/pg-store.ts`, `server/schema.sql` |
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

Server environment: `DATABASE_URL` (required), `PORT` (default 3001), `STATIC_DIR` (default `dist`), `CORS_ORIGIN`
(comma-separated origins; only when the app is served from elsewhere, together with `VITE_API_URL` in the app's
build). `GET /health` answers 200 when PostgreSQL is reachable.

**Security:** put the server behind HTTPS (e.g. Caddy) before anyone outside your machine uses it: passwords and the
session cookie travel over the network.

## PostgreSQL layout

One table per collection, one row per record (`server/schema.sql`):

| Column | Contents |
|---|---|
| `id` | The app's id (`inf_…`, `call_…`, `usr_…`) |
| `seq` | Creation order (the activity log is read in this order) |
| `data` | The record as the app's TypeScript type (`src/types/index.ts`), as JSON, without the id |
| `updated_at` | When the row was last written |

| Table | Contents |
|---|---|
| `team` | `User`: name, email, role, is_active, created_at |
| `categories` | name, is_active |
| `influencers` | `Influencer` (accounts embedded; the documents summary is derived, not stored) |
| `calls`, `packages`, `activities`, `saved_views` | `CallLog`, `Package`, `Activity`, `SavedView` |
| `documents` | `InfluencerDocument` + `deleted_at` (soft delete) + `storage_key` (the file's key) |
| `settings` | rows `pool` (pool guards), `instagram` (integration settings), `migrations` (one-time upgrades done) |
| `dismissed_duplicates` | duplicate pairs a manager marked "not the same creator" |
| `credentials` | `user_id`, `password_hash` (scrypt) |
| `sessions` | `token_hash` (SHA-256 of the cookie token), `user_id`, `expires_at` |
| `files` | document files: `key`, `content_type`, `data` (bytea), `created_at` — never loaded into memory |

To read it in SQL: `select id, data->>'name' as name, data->>'stage' as stage from influencers;`

Back it up with `pg_dump` (files included). Don't edit rows while the server is running: it holds its own copy and
would overwrite or ignore your change. Stop it, edit, start it.

## Limits to know

- The whole workspace (not the files) is in server memory and compared with the database after every request. Fine
  for an internal team with thousands of records; for much more, move the handlers to SQL queries.
- One server instance only. A second one would overwrite the first one's changes.
- Background jobs (CSV import, export) and a CSV waiting to be imported live in memory: a restart mid-import loses
  the job. Finished imports are saved. Unpolled jobs are dropped after an hour.
- Other people's changes appear when the app next refetches, not instantly.
- Auto-release of stale claims and connect-link expiry run at the start of every request (no scheduler).

## Troubleshooting

- **Every screen says "Something went wrong. Check your connection":** the API server isn't running (`npm run server`;
  `GET /health`), or `VITE_API_SERVER=true` is set but the server is elsewhere (`VITE_API_URL`).
- **The server won't start:** `DATABASE_URL` is missing or wrong, or PostgreSQL isn't running (Windows: the
  `postgresql-x64-17` service).
- **Can't sign in as the admin:** `ADMIN_EMAIL` / `ADMIN_PASSWORD` weren't set when the server started (its log says
  "No one can sign in yet"). Set them in `.env.local` and restart.
- **Data you entered isn't on the server:** `VITE_API_SERVER` isn't `true`, so the app is in prototype mode (data in
  the browser). Restart `npm run dev` after editing env files.
