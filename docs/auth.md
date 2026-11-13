# Sign-in, data and server setup

With Firebase configured, InfluenceHub has three parts: **PostgreSQL** for all data, the **API server** (`server/`)
in front of it, and Firebase for two jobs only: **Authentication** (sign-in) and **Storage** (document files). There
is no sample data: the app starts empty except for the admin you create. Without the Firebase config it runs in
**prototype mode** (no sign-in, no server, data in the browser; see README).

## How it works

- **Sign-in:** email + password (Firebase Authentication). No public sign-up page: an admin adds each person in
  **Settings > Team > Add member** with name, email, role and an initial password, and shares the password with
  them securely. Anyone can change their own password from the account menu (**Change password**).
- **Who gets in:** a Firebase user whose team record exists and is active. Anyone else signed in sees
  "No access to InfluenceHub". A deactivated member sees the same screen ("deactivated").
- **API server (`server/main.ts`):** the services (`src/services`) call `/api/v1/...` with the user's Firebase ID
  token. The server verifies the token, checks the team record, then runs the business rules in
  `src/backend/handlers` (stages, claims, pool, scoping, permissions, duplicates, imports) over a working copy of
  the data. Prototype mode runs the same handlers in the browser.
- **Data (`server/pg-store.ts`):** the server loads every record from PostgreSQL at start-up and, after each
  request, writes back only the records that changed, in one transaction. A request that fails part-way saves
  nothing.
- **One request at a time, one server:** requests are answered in turn and the server is the only writer, so the
  rules hold for the whole team (two people can't claim the same influencer or add the same handle). Run exactly
  one instance of the server.
- **Not connected yet:** public profile lookup, **Sync now**, connect links and growth history need the social
  platforms' APIs. Until then they say so ("isn't connected yet") and accounts keep the stats people type in.

| Piece | Where |
|---|---|
| Firebase app, Auth instance | `src/lib/firebase.ts` |
| Storage instance (document uploads) | `src/lib/firebase-data.ts` |
| Sign-in state, sign-out, change password, ID token | `src/lib/auth/` (`initAuth`, `useAuthUser`, `signIn`, `signOut`, `getIdToken`) |
| Login page, route guard, "No access" screen | `src/pages/login-page.tsx`, `src/components/layout/require-auth.tsx`, `app-shell.tsx` |
| Business rules (shared by server and prototype) | `src/backend/` (`handlers/`, `domain.ts`, `db.ts`) |
| API server | `server/main.ts` (HTTP, token check, one request at a time), `vite.server.config.ts` (build) |
| PostgreSQL store and tables | `server/pg-store.ts`, `server/schema.sql` |
| Token check, member accounts, file URLs | `server/firebase-admin.ts` |
| Prototype store (browser) | `src/backend/index.ts`, `src/backend/local-store.ts` |
| File access rules | `storage.rules`, `firebase.json` |
| First admin | `scripts/seed-admin.mjs` (`npm run seed:admin`) |

## Set up (once)

1. **PostgreSQL:** create an empty database and a user that owns it. The server creates its tables on first start.
2. **Firebase project** at <https://console.firebase.google.com>:
   - **Authentication > Sign-in method:** enable **Email/Password**. Under **Settings > User actions** you can turn
     **Enable create (sign-up)** off: member accounts are created by the server.
   - **Storage:** create the default bucket (needed for document uploads; new buckets need the Blaze plan).
   - **Project settings > Your apps:** add a **Web app** and copy its config (below).
   - **Project settings > Service accounts > Generate new private key.** Keep the JSON outside the repo (or name it
     `service-account*.json`, which is gitignored).
3. **`.env.local`** (never the committed `.env`):
   ```
   # The app (public values: they are in the browser bundle)
   VITE_FIREBASE_API_KEY=...
   VITE_FIREBASE_AUTH_DOMAIN=<project>.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=<project>
   VITE_FIREBASE_STORAGE_BUCKET=<project>.firebasestorage.app
   VITE_FIREBASE_APP_ID=...

   # The server and the seed script (secrets)
   DATABASE_URL=postgres://<user>:<password>@localhost:5432/<database>
   GOOGLE_APPLICATION_CREDENTIALS=C:/path/to/service-account.json
   FIREBASE_STORAGE_BUCKET=<project>.firebasestorage.app
   FIREBASE_PROJECT_ID=<project>             # optional when the key names it

   # The first admin (seed script only)
   ADMIN_EMAIL=you@yourcompany.com
   ADMIN_PASSWORD=at-least-8-characters
   ADMIN_NAME=Your Name                      # optional
   ```
4. **Deploy the storage rules** (Firebase CLI: `npm i -g firebase-tools`, `firebase login`, `firebase use <project>`):
   ```
   firebase deploy --only storage
   ```
5. **Create the first admin:** `npm run seed:admin`.
6. **Run it** (below) and sign in.

## Run it

| Command | What it does |
|---|---|
| `npm run server` | Builds the server (`dist-server/`) and starts it on port 3001 (`PORT` to change). |
| `npm run dev` | The app on port 3000; it forwards `/api` to the server. |
| `npm run build` then `npm run server` | Production: the server also serves the built app from `dist/`, so one process on one port is the whole deployment. |
| `npm start` | Starts an already-built server. |

Server environment, besides the three secrets above: `PORT` (default 3001), `STATIC_DIR` (default `dist`),
`CORS_ORIGIN` (comma-separated origins; only when the app is served from somewhere else, together with
`VITE_API_URL` in the app's build). `GET /health` answers 200 when PostgreSQL is reachable.

Put the server behind HTTPS (a reverse proxy or your host's TLS) before anyone outside your machine uses it: ID
tokens travel in a request header.

## The first admin: `npm run seed:admin`

The script (idempotent; never prints the password):
- creates the tables if they're missing;
- creates the Firebase user, or updates the password if the email exists;
- sets the custom claim `ih_member: true` (what `storage.rules` checks);
- writes the team row = `{ email, name, role: 'admin', is_active: true, created_at }`;
- adds the default categories if there are none (configuration, not sample data).

The server reads the data at start-up, so run the script before starting it, or restart it afterwards. Add everyone
else from **Settings > Team**.

## PostgreSQL layout

One table per collection, one row per record (`server/schema.sql`):

| Column | Contents |
|---|---|
| `id` | The app's id (`inf_…`, `call_…`; the Firebase uid for team members) |
| `seq` | Creation order (the activity log is read in this order) |
| `data` | The record as the app's TypeScript type (`src/types/index.ts`), as JSON, without the id |
| `updated_at` | When the row was last written |

| Table | Contents |
|---|---|
| `team` | `User`: name, email, role, is_active, created_at |
| `categories` | name, is_active |
| `influencers` | `Influencer` (accounts embedded; the documents summary is derived, not stored) |
| `calls`, `packages`, `activities`, `saved_views` | `CallLog`, `Package`, `Activity`, `SavedView` |
| `documents` | `InfluencerDocument` + `deleted_at` (soft delete) + `storage_key` (file path in Storage) |
| `settings` | rows `pool` (pool guards), `instagram` (integration settings), `migrations` (one-time data upgrades already done) |
| `dismissed_duplicates` | duplicate pairs a manager marked "not the same creator" (`id` = the pair id) |

To read it in SQL: `select id, data->>'name' as name, data->>'stage' as stage from influencers;`

Document files: Firebase Storage `documents/{influencerId}/{uploadId}-{fileName}`.

Back it up like any PostgreSQL database (`pg_dump`). Don't edit rows while the server is running: it holds its own
copy and would overwrite or ignore your change. Stop it, edit, start it.

## What is enforced where

- **The server** enforces everything: sign-in (ID token), membership, roles, an executive seeing only their own
  influencers and the pool, stage rules, claim limits, who may reassign. Nobody reaches the database except through it.
- **`storage.rules`:** only users carrying the `ih_member` claim read document files or upload PDF / JPG / PNG /
  DOCX / XLSX up to 20 MB; files are never changed or deleted. The server sets the claim when a member is added and
  clears it, and signs them out everywhere, when they're deactivated.

Scheduled rules (auto-release of stale claims, connect-link expiry) have no scheduler yet: they run at the start of
every request.

## Limits to know

- The server keeps the whole workspace in memory and compares it with the database after every request. Fine for an
  internal team with thousands of records; for much more, move the handlers to SQL queries.
- One server instance only. A second one would overwrite the first one's changes.
- Background jobs (CSV import, export) and a CSV waiting to be imported live in memory: a restart mid-import loses
  the job, and the import has to be started again. Finished imports are saved.
- A deactivated member's file access can last until their ID token expires (up to an hour); API access stops at once.
- Other people's changes appear when the app next refetches (it does so regularly and after your own actions), not
  instantly.
- CSV exports are generated on the server and downloaded; nothing is stored.

## Troubleshooting

- **"Sign-in isn't available" / "Firebase isn't configured":** the `VITE_FIREBASE_*` values are missing from
  `.env.local` (dev) or the build environment. Restart `npm run dev` after editing env files.
- **Every screen says "Something went wrong. Check your connection":** the API server isn't running or isn't
  reachable (`npm run server`; `GET /health`).
- **The server won't start:** it says why. `DATABASE_URL` is missing or wrong, PostgreSQL isn't running, or
  `GOOGLE_APPLICATION_CREDENTIALS` isn't set.
- **"Sign in to continue" although you are signed in:** the server can't verify tokens (its log says so). The service
  account key belongs to another Firebase project than the app's `VITE_FIREBASE_PROJECT_ID`.
- **"No access to InfluenceHub" for the admin:** the team row is missing or inactive, or the server was started
  before the seed script ran. Re-run `npm run seed:admin` and restart the server.
- **Document upload fails with "You don't have permission":** the storage rules aren't deployed, or the member
  signed in before they were added: sign out and in again to pick up the claim.
- **Document download fails:** `FIREBASE_STORAGE_BUCKET` is missing on the server. Previewing files in the app may
  also need CORS on the bucket (`gsutil cors set`) if the browser blocks it.
- **Requests still answered by an old mock:** an earlier version registered `mockServiceWorker.js` on this origin.
  DevTools > Application > Service workers > Unregister, then reload.
