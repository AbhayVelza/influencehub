# Sign-in, data and Firebase setup

With Firebase configured, InfluenceHub runs on Firebase: **Authentication** for sign-in, **Firestore** for all data,
**Storage** for document files. There is no API server and no sample data: the app starts empty except for the admin
you create. Without the Firebase config it runs in **prototype mode** (no sign-in, data in the browser; see README).

## How it works

- **Sign-in:** email + password (Firebase Authentication). No public sign-up page: an admin adds each person in
  **Settings > Team > Add member** with name, email, role and an initial password, and shares the password with
  them securely. Anyone can change their own password from the account menu (**Change password**).
- **Who gets in:** a Firebase user whose `team/{uid}` record exists and is active. Anyone else signed in sees
  "No access to InfluenceHub". A deactivated member sees the same screen ("deactivated").
- **Data layer (`src/backend`):** the services (`src/services`) call an in-app API (`/api/v1/...`). There is no
  server: `http.ts` hands each request to `handleApiRequest` (`src/backend/index.ts`), which runs the business rules in
  `src/backend/handlers` (stages, claims, pool, scoping, permissions, duplicates, imports) over a working copy of the
  data. `src/backend/persistence.ts` keeps that copy in step with Firestore through live listeners (teammates' changes
  show up without reloading) and, after every request, writes back only the records that changed.
- **Access control:** `firestore.rules` and `storage.rules` (below). A write the rules refuse is undone locally and
  the user sees "You don't have permission to do this."
- **Not connected yet:** public profile lookup, **Sync now**, connect links and growth history need the social
  platforms' APIs. Until then they say so ("isn't connected yet") and accounts keep the stats people type in.

| Piece | Where |
|---|---|
| Firebase app, Auth instance | `src/lib/firebase.ts` |
| Firestore / Storage instances | `src/lib/firebase-data.ts` |
| Sign-in state, sign-out, change password | `src/lib/auth/` (`initAuth`, `useAuthUser`, `signIn`, `signOut`) |
| Login page, route guard, "No access" screen | `src/pages/login-page.tsx`, `src/components/layout/require-auth.tsx`, `app-shell.tsx` |
| Data layer and sync | `src/backend/` (`index.ts`, `persistence.ts`, `handlers/`) |
| Adding a member's sign-in account | `src/backend/sign-in-accounts.ts` |
| Access rules | `firestore.rules`, `storage.rules`, `firebase.json` |
| First admin | `scripts/seed-admin.mjs` (`npm run seed:admin`) |

## Set up a Firebase project (once)

1. Create a project at <https://console.firebase.google.com>.
2. **Authentication > Sign-in method:** enable **Email/Password**.
3. **Authentication > Settings > User actions:** keep **Enable create (sign-up)** on. Admins add members from the app,
   which creates their account in the browser (there is no server to do it). People who sign up on their own get no
   access: the rules only admit members with an active team record.
4. **Firestore Database:** create it (production mode).
5. **Storage:** create the default bucket (needed for document uploads; new buckets need the Blaze plan).
6. **Project settings > Your apps:** add a **Web app** and copy its config into `.env.local`:
   ```
   VITE_FIREBASE_API_KEY=...
   VITE_FIREBASE_AUTH_DOMAIN=<project>.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=<project>
   VITE_FIREBASE_STORAGE_BUCKET=<project>.firebasestorage.app
   VITE_FIREBASE_APP_ID=...
   ```
   These values are public (they are in the browser bundle); the rules are what protect the data.
7. **Deploy the rules** (Firebase CLI: `npm i -g firebase-tools`, `firebase login`, `firebase use <project>`):
   ```
   firebase deploy --only firestore:rules,storage
   ```
8. **Create the first admin** (below), then `npm run dev` and sign in.

## The first admin: `npm run seed:admin`

Needs a service account key: **Project settings > Service accounts > Generate new private key**. Keep the JSON
outside the repo (or name it `service-account*.json`, which is gitignored). In `.env.local` or the shell:

```
ADMIN_EMAIL=you@yourcompany.com
ADMIN_PASSWORD=at-least-8-characters
ADMIN_NAME=Your Name                      # optional
GOOGLE_APPLICATION_CREDENTIALS=C:/path/to/service-account.json
FIREBASE_PROJECT_ID=<project>             # optional when the key names it
```

The script (idempotent; never prints the password):
- creates the Firebase user, or updates the password if the email exists;
- sets the custom claim `role: 'admin'`;
- writes `team/{uid}` = `{ email, name, role: 'admin', is_active: true, created_at, updated_at }`;
- adds the default categories if the `categories` collection is empty (configuration, not sample data).

Add everyone else from **Settings > Team**.

## Firestore layout

Every record is stored as the app's TypeScript type (`src/types/index.ts`), with the document id as its `id`.

| Collection | Contents |
|---|---|
| `team/{uid}` | `User` (keyed by Firebase uid): name, email, role, is_active, created_at |
| `categories` | name, is_active |
| `influencers` | `Influencer` (accounts embedded; the documents summary is derived, not stored) |
| `calls`, `packages`, `activities`, `saved_views` | `CallLog`, `Package`, `Activity`, `SavedView` |
| `documents` | `InfluencerDocument` + `deleted_at` (soft delete) + `storage_key` (file path in Storage) |
| `settings/pool`, `settings/instagram` | pool guards; Instagram integration settings |
| `dismissed_duplicates/{pairId}` | duplicate pairs a manager marked "not the same creator" |

Document files: Storage `documents/{influencerId}/{uploadId}-{fileName}`.

## What the rules do and don't enforce

`firestore.rules`: signed-in users read their own team record; everything else needs an active team record.
Admins change team, categories and settings; managers and admins delete influencers; members read and write the rest.
`storage.rules`: members read document files and upload PDF / JPG / PNG / DOCX / XLSX up to 20 MB; files are never
changed or deleted.

Finer rules run in the data layer, in the user's browser: an executive seeing only their own influencers and the
pool, stage rules, claim limits, who may reassign. A team member who bypasses the app with their own Firebase
credentials could read all workspace data and make changes the app wouldn't. For an internal team that's usually
acceptable; to close it, move the handlers behind a server (e.g. Cloud Functions) or add per-field rules.

Scheduled rules (auto-release of stale claims, connect-link expiry) have no scheduler: they run at the start of every
request, in whoever's browser makes it.

## Limits to know

- Each signed-in browser keeps a live copy of the workspace (all collections). Fine for an internal team with
  thousands of records; for much more, move the handlers to a server or query per screen.
- Two people editing the same record at once: the last save wins.
- CSV imports are read in the browser and never stored; exports are generated in the browser.

## Troubleshooting

- **"Sign-in isn't available" / "Firebase isn't configured":** the `VITE_FIREBASE_*` values are missing from
  `.env.local` (dev) or the build environment. Restart `npm run dev` after editing env files.
- **"No access to InfluenceHub" for the admin:** `team/{uid}` is missing or inactive. Re-run `npm run seed:admin`.
- **"You don't have permission to do this" everywhere:** the rules aren't deployed (`firebase deploy --only
  firestore:rules,storage`), or the team record isn't active.
- **Adding a member fails with "Firebase doesn't allow creating accounts":** turn on Email/Password and "Enable
  create (sign-up)" (setup steps 2–3).
- **Document upload fails:** Storage isn't set up, `VITE_FIREBASE_STORAGE_BUCKET` is missing, or storage rules aren't
  deployed. Previewing files in the app may also need CORS on the bucket (`gsutil cors set`) if the browser blocks it.
- **Requests still answered by an old mock:** an earlier version registered `mockServiceWorker.js` on this origin.
  DevTools > Application > Service workers > Unregister, then reload.
