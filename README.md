# InfluenceHub — frontend

Internal CRM for finding, calling, onboarding and shipping packages to influencers.
React 19 + TypeScript + Vite. Two modes, picked by the build env:

- **Prototype mode** (no Firebase config, the default): no sign-in, all data saved in this browser. For demos and
  testing; `npm run dev` and it works.
- **Firebase mode** (`VITE_FIREBASE_*` set): email + password sign-in, data in Firestore, files in Storage.

There is no API server and no sample data: the app starts empty except for an admin.

## What it does

**Business flow:** gather data → call → onboard → send package.

Influencers are added manually or by CSV (public profile lookup and syncing need a platform API, not connected yet). One creator can have accounts on several
platforms (Instagram, YouTube, TikTok, Facebook, Threads, Pinterest, LinkedIn, Snapchat), each with its own stats.

| Stage | Meaning |
| --- | --- |
| Data Gathered → Contacted | Needs a call logged with outcome "Interested" |
| Contacted → Onboarded | Creator agreed; needs a current agreement on file |
| Onboarded → Package Sent | Needs a package with courier and tracking number |
| Package Sent → Delivered | Package arrived (a returned package moves them back to Onboarded) |
| On Hold / Rejected | Side stages. On Hold resumes to the previous stage; reopening Rejected is manager/admin only |

Call outcomes: no answer / call back create a follow-up, not interested rejects, interested moves to Contacted.
Admins can override any stage move, with a required reason.

## Features

- **Dashboard**: KPIs, pipeline funnel, by-category and top-cities charts, my follow-ups, activity feed.
- **Influencers**: filterable (category, platform, country → state → city, stage, owner, agreement, insights, reach), sortable table,
  saved views, bulk actions, CSV import / export. Filters live in the URL.
- **Influencer detail**: stage stepper, social accounts with per-platform stats (typed in for now; sync, connect
  links, growth history and recent posts need a platform API), calls, packages, activity log.
- **Add / Import**: manual entry and CSV with a preview (profile lookup is not connected yet).
- **Unassigned Pool**: influencers with no owner. Executives see a preview and claim; managers assign.
  Optional guards: claim limit and auto-release.
- **Possible duplicates** (manager/admin): side-by-side pairs with confidence and reasons; merge or dismiss.
  Duplicate warnings also appear before every add.
- **Documents**: insights summaries (many) and agreements (a new upload becomes current, older versions stay as
  history) per influencer, with a sidebar page for all of them. PDF / JPG / PNG / DOCX / XLSX up to 20 MB, upload
  progress, PDF and image preview, soft delete (manager/admin). Uploading ticks the onboarding checklist.
- **Onboarded**: a sidebar group with one tab per platform listing the creators who are onboarded there (Onboarded
  stage + an account on that platform; a docs column shows any missing agreement or insights), searchable and filterable.
- **Pipeline** kanban, **Calls & Follow-ups**, **Packages**.
- **Settings** (admin): Instagram integration, team (add members with an initial password, roles, deactivate),
  categories, pool guards.
- **Sign-in**: email + password, no public sign-up; everyone can change their password from the account menu.
- Light / dark theme, usable at 1024px, skeleton / empty / error states. Dates are `dd/MM/yyyy` and date-times
  `dd/MM/yyyy, hh:mm a` in Asia/Kolkata (the API stays ISO 8601).

## Tech stack

Vite, React 19, TypeScript, Tailwind, shadcn/ui, lucide-react, React Router, TanStack Query and Table, Recharts,
dnd-kit, react-hook-form + zod, date-fns, sonner, Firebase (Auth, Firestore, Storage), MSW's request router (in-app
API, no service worker), oxlint.

## Project layout

```
src/
  components/   layout shell, route guard, shared UI, shadcn/ui
  features/     account, add-influencer, calls, dashboard, documents, duplicates, influencers, packages, pipeline, pool, settings
  pages/        one component per route
  services/     the only place that calls the in-app API
  backend/      the data layer: API handlers (business rules) over a live Firestore copy; see docs/auth.md
  lib/          firebase, auth, schemas (zod), platforms, stages, permissions, formatting, session
  types/        data types, the source of truth for the contract
scripts/        seed-admin.mjs (first admin in Firebase)
firestore.rules, storage.rules, firebase.json   access rules (firebase deploy)
```

## Run it

### Prototype mode (demo / testing, no setup)

```bash
npm install
npm run dev          # http://localhost:3000, you're the Admin, no sign-in
```

- Everything you enter is saved in this browser (IndexedDB) and survives reloads; it isn't shared with other people
  or browsers. Document files are kept in the browser too.
- To try other roles: **Settings > Team & roles > Add member** (no password needed), then the account menu (top
  right) > **Acting as** to switch to them.
- Account menu > **Reset prototype data** wipes this browser's workspace and starts again.
- For a hosted demo, `npm run build` and serve `dist/` from any static host (set it to serve `index.html` for every
  path). Each visitor gets their own empty workspace.

### Firebase mode (real sign-in and shared data)

First set up a Firebase project, deploy the rules and create the first admin: [`docs/auth.md`](docs/auth.md).

```bash
npm install
# .env.local (gitignored): your Firebase web config, see .env.example
npm run seed:admin   # once: creates the first admin (needs ADMIN_* and a service account key, see docs/auth.md)
npm run dev          # http://localhost:3000, sign in as that admin
```

| Script | What it does |
| --- | --- |
| `npm run dev` | Dev server on port 3000 |
| `npm run build` | Type-check and build to `dist/` |
| `npm run preview` | Serve the production build on port 3000 |
| `npm run lint` / `npm run typecheck` | oxlint / TypeScript |
| `npm run seed:admin` | Create or update the first admin in Firebase (run again to reset their password) |

## Environment variables

| Variable | Meaning |
| --- | --- |
| `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID` | Firebase web app config (public values). All three set = Firebase mode; otherwise prototype mode. |
| `VITE_FIREBASE_STORAGE_BUCKET` | Storage bucket, needed for document uploads. |
| `VITE_FIREBASE_APP_ID` | Optional. |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME` (optional) | The first admin, for `npm run seed:admin` only. Secrets: `.env.local` or the shell. |
| `GOOGLE_APPLICATION_CREDENTIALS`, `FIREBASE_PROJECT_ID` (optional) | Service account key for `npm run seed:admin`. |

The committed `.env` holds empty placeholders only, so it must never hold a secret. Copy `.env.example` to
`.env.local` (gitignored) for your values; the shell overrides both.

## Sign in

Email and password; there is no public sign-up page and no reset email. An admin adds people in **Settings > Team >
Add member** with name, email, role and an initial password; each user can change it from the account menu (top
right) > **Change password**. Someone signed in but not on the team, or deactivated, sees "No access to InfluenceHub".

## Roles

| | Executive | Manager | Admin |
| --- | :---: | :---: | :---: |
| View, add, edit, log calls, packages, standard stage moves | own influencers | all | all |
| Unassigned Pool | preview, Claim | full details, Assign | full details, Assign |
| Release to the pool (reason required) | own | anyone's | anyone's |
| Upload documents | own | all | all |
| Delete documents (soft) |  | ✓ | ✓ |
| Reassign, delete, reopen rejected, import / export, review & merge duplicates |  | ✓ | ✓ |
| Stage override (with reason), Settings (incl. team and pool guards) |  |  | ✓ |

The data layer (`src/backend`) applies these and the UI hides what a role can't do; `firestore.rules` additionally
limits settings, team and categories to admins and influencer deletion to managers and admins (what the rules
don't cover: [`docs/auth.md`](docs/auth.md)). To try another role, add a member in Settings > Team and sign in as them.

## API

The services call an in-app API (`/api/v1/...`) that the data layer answers in the browser (`src/backend`); the
shapes are in `docs/api-contract.md`. Lists return `{ items, total, page, page_size }` and errors return
`{ error: { code, message } }`. Imports and exports return a `job_id` that the UI polls (`GET /jobs/{id}`).

## Checks

Before calling a change done, run `npm run lint`, `npm run typecheck` and `npm run build`. There is no automated
end-to-end suite yet (the earlier one ran against sample data, which is gone).

## More

`CLAUDE.md` holds the rules and conventions. `docs/` holds the data model, the API contract, every contract
decision the backend must match (including the exact name-similarity rule for duplicate detection) and
`docs/auth.md` (Firebase setup, sign-in, the data layer, rules, the seed script).
