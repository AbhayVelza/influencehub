# InfluenceHub — Project Overview

Everything about the project in one place. For deeper detail, each section points to the file that owns it.

---

## 1. What it is

InfluenceHub is an **internal CRM for managing influencers**: finding creators, calling them, onboarding them and
shipping them packages. It is used by an internal team (executives, managers, admins). There is no public sign-up
and no sample data: a new workspace starts with one admin and the default categories.

**Business flow:** gather data → call → onboard → send package.

---

## 2. Pipeline stages

| Stage | Colour | How a creator gets there |
|---|---|---|
| Data Gathered | slate | Added manually or by CSV |
| Contacted | blue | A call logged with outcome **Interested** |
| Onboarded | violet | A **current agreement** and at least one **insights summary** on file |
| Package Sent | amber | A package with courier + tracking number |
| Delivered | green | The package arrived (a **returned** package moves them back to Onboarded) |
| On Hold | gray | Side stage; resumes to the previous stage |
| Rejected | red | Side stage; only managers/admins can reopen (→ Data Gathered) |

- **Call outcomes:** no answer / call back → follow-up · not interested → Rejected · interested → Contacted.
- Two follow-ups can't be booked for the same minute across the workspace.
- **Admins** can override any move, with a required reason.
- Stage rules: `src/lib/stages.ts`. UI stage moves go through `useStageMover`. Colours: `STAGE_META`.

---

## 3. Roles and permissions

| | Executive | Manager | Admin |
|---|:---:|:---:|:---:|
| View, add, edit, log calls, packages, standard stage moves | own influencers | all | all |
| Unassigned Pool | preview + Claim | full details + Assign | full details + Assign |
| Release to the pool (reason required) | own | anyone's | anyone's |
| Upload documents | own | all | all |
| Delete documents (soft) | | ✓ | ✓ |
| Reassign, delete, reopen rejected, CSV import/export, review & merge duplicates | | ✓ | ✓ |
| Stage override, Settings (team, categories, integrations, pool guards) | | | ✓ |

The server enforces all of this; the UI only hides what a role can't do. Code: `src/lib/permissions.ts` (`useCan`).

---

## 4. Features (screens)

| Screen | What it does |
|---|---|
| **Sign-in** | Server mode: email + password; admins add members with an initial password; everyone can change theirs. Prototype: "Acting as" |
| **Dashboard** | KPIs, pipeline funnel, by-category and top-cities charts, my follow-ups, activity feed |
| **Influencers** | Filterable, sortable table; saved views; bulk actions; CSV import/export; filters in the URL with live counts |
| **Influencer detail** | Stage stepper, social accounts with per-platform stats, calls, packages, documents, activity |
| **Add / Import** | Manual entry (several platform accounts per creator) or CSV with preview and duplicate warnings |
| **Unassigned Pool** | Creators with no owner. Executives claim; managers assign (also in bulk). Optional claim limit + auto-release |
| **Possible duplicates** | Side-by-side pairs with confidence and reasons; merge or dismiss (manager/admin) |
| **Pipeline** | Kanban board (drag and drop) |
| **Calls & Follow-ups** | Today / overdue / upcoming / history |
| **Packages** | All packages; status changes can move the creator's stage |
| **Documents** | Insights summaries and agreements (current + version history). PDF/JPG/PNG/DOCX/XLSX up to 20 MB |
| **Onboarded** | One tab per platform listing creators who are Onboarded / Package Sent / Delivered there |
| **Settings** (admin) | Team & roles, categories, pool guards, Instagram integration |

**Platforms:** Instagram, YouTube, TikTok, Facebook, Threads, Pinterest, LinkedIn, Snapchat. One creator can have
accounts on several platforms, each with its own stats.

**Not connected yet:** public profile lookup, "Sync now", connect links and growth history need the platforms'
APIs. Until then accounts keep the stats people type in.

**UX rules:** light/dark theme; desktop-first, usable at 1024px; skeleton, empty and error states everywhere;
numbers as 12.4K / 1.2M; dates `dd/MM/yyyy` and date-times `dd/MM/yyyy, hh:mm a` in Asia/Kolkata; relative times;
toasts; "/" focuses search; filters collapsed behind a "Filters" button.

Screen-by-screen detail: `docs/screens.md`.

---

## 5. Architecture

### Two modes (chosen by the build env, `src/lib/mode.ts`)

| | Prototype mode | Server mode |
|---|---|---|
| When | `VITE_API_SERVER` unset | `VITE_API_SERVER=true` |
| Data | This browser's IndexedDB | PostgreSQL behind the API server |
| Files | This browser | PostgreSQL (`files` table) |
| Use | Demos and testing (`npm run dev`, no setup) | The real, shared workspace |

Server mode has custom sign-in (email + password, scrypt hashes, HttpOnly session cookie; `server/auth.ts`).
Prototype mode has none: the account menu's **Acting as** picks which team member you are.

### How a request flows (server mode)

```
Browser (React app)
  component → feature hook (TanStack Query) → src/services/* → src/services/http.ts
      │  fetch /api/v1/... with the session cookie
      ▼
API server (server/main.ts, Hono, Node)
  1. queue: one request at a time
  2. check the session (401) and that the member is active (403)
  3. run the business rules: src/backend/handlers (via MSW's getResponse router)
  4. save only what changed, in one transaction (server/pg-store.ts)
      ▼
PostgreSQL (one table per collection, one JSONB row per record; files in `files`)
```

In **prototype mode** `http.ts` calls `handleApiRequest` (`src/backend/index.ts`) in the browser instead: the
**same handlers**, saved to IndexedDB by `src/backend/local-store.ts`.

### Key design decisions

- **One set of business rules** (`src/backend/handlers`) runs both in the browser and on the server, so they must
  not use `window`.
- The server keeps the **whole workspace in memory** (`db`, not the files), loads it at start-up and, after each
  request, writes only changed records. A request that fails part-way saves nothing.
- **Single instance, one request at a time:** the server is the only writer, so rules like "one owner per creator"
  and "unique handle per platform" hold for everyone. Never run two instances.
- **Document files** are PUT to `/api/v1/files/<key>` (only keys handed out by the presign step) and served from there.
- Background jobs (CSV import/export) run when first polled (`GET /jobs/{id}`), inside that request, so their
  changes are saved like any other request.
- Every production chunk stays under 500 kB.

---

## 6. Tech stack

| Area | Tools |
|---|---|
| App | Vite, React 19, TypeScript, Tailwind, shadcn/ui, lucide-react, React Router |
| Data & forms | TanStack Query, TanStack Table, react-hook-form + zod |
| UI extras | Recharts (charts), dnd-kit (kanban), date-fns (+ `@date-fns/tz`), sonner (toasts) |
| Server | Node 22, Hono (`@hono/node-server`), PostgreSQL (`postgres`; data and files), MSW `getResponse` router (no service worker) |
| Tooling | oxlint, TypeScript (`tsc -b`) |

---

## 7. Project layout

```
src/
  components/   layout shell, route guard, shared UI (common/), shadcn/ui (ui/)
  features/     account, add-influencer, calls, dashboard, documents, duplicates, influencers,
                onboarded, packages, pipeline, pool, settings
  pages/        one component per route
  services/     the only place that calls the API (http.ts + one file per area)
  backend/      business rules: handlers/, domain.ts, db.ts (working copy), jobs.ts, local-store.ts (prototype)
  lib/          auth (sign-in / acting member), schemas (zod), platforms, stages, permissions, format (dates), session, mode
  types/        data types (index.ts) — the source of truth for the API contract
server/
  main.ts           HTTP server: request queue, files, static app, /health
  auth.ts           sign-in, sessions, passwords, first admin
  pg-store.ts       loads/saves the working copy to PostgreSQL
  schema.sql        tables (created automatically on start)
docs/                    detailed docs (see section 14)
vite.config.ts / vite.server.config.ts   app build / server build
```

---

## 8. Data model (summary)

Source of truth: `src/types/index.ts`; full list in `docs/data-model.md`.

| Record | Main fields |
|---|---|
| **User** (team member) | id (`usr_…`), name, email, role, is_active, created_at |
| **Influencer** | name, category, phone, email, address, city/state/country, accounts[], total_reach, stage, assigned_to, tags, notes, onboarding_checklist |
| **SocialAccount** | platform, handle (unique per platform), sync method/status, per-platform metrics |
| **CallLog** | influencer_id, called_by, outcome, notes, follow_up_date, follow_up_done |
| **Package** | items, address, courier, tracking_number, status (preparing/sent/in_transit/delivered/returned) |
| **Document** | type (insights_summary / agreement), title, file info, period or signed/valid dates, is_current |
| **Activity** | influencer_id, actor, type, payload (full audit log) |

**Categories** (defaults): Fashion, Beauty, Food, Tech & Gadgets, Travel, Fitness & Lifestyle, Lifestyle,
Gaming & Esports, Finance, Art & Designs, Marketing & Business.

### PostgreSQL tables

Each table has `id` (app id), `seq` (creation order), `data` (the record as JSON), `updated_at`.

`team`, `categories`, `influencers`, `documents`, `calls`, `packages`, `activities`, `saved_views`,
`settings` (rows: `pool`, `instagram`, `migrations`), `dismissed_duplicates`.

Example: `select id, data->>'name' as name, data->>'stage' as stage from influencers;`
Don't edit rows while the server runs (it holds its own copy): stop it, edit, start it.

---

## 9. API (summary)

All paths under `/api/v1`. Lists return `{ items, total, page, page_size }`; errors return
`{ error: { code, message } }`. Async actions return a `job_id` that the UI polls every 2 s.

| Area | Endpoints |
|---|---|
| Influencers | list + filter-options, create, get/patch/delete, check-handle, stage move, bulk, activity, add account, merge |
| Accounts | edit metrics, sync, connect link, snapshots, media |
| Duplicates | check, list, dismiss |
| Calls | list/log per influencer, follow-ups by bucket, mark done |
| Packages / pipeline / dashboard | packages CRUD, `GET /pipeline`, `GET /dashboard/summary` |
| Documents | list per influencer and overall, presign, create, download URL, soft delete |
| Import / export / jobs | lookup, CSV presign → upload → import, export, `GET /jobs/{id}` |
| Team & settings | `/me`, `/team`, `/categories`, `/saved-views`, `/settings/pool` |
| Pool | list, filter-options, preview, expiring, claim, release, bulk claim/assign |

Full list: `docs/api-contract.md`. Exact behaviour: `docs/contract-decisions.md`.

---

## 10. Setup and running

### Prototype mode (no setup)

```bash
npm install
npm run dev        # http://localhost:3000 — you are the Admin
```

Account menu > **Reset prototype data** wipes the browser workspace.

### Server mode (PostgreSQL)

1. Create a PostgreSQL database and user (`docs/server.md`). Tables are created on first start.
2. `.env.local`: `DATABASE_URL=postgres://…` and `VITE_API_SERVER=true`.
3. `npm run server` (API on 3001; first start adds the owner admin and default categories) and `npm run dev`
   (app on 3000, forwards `/api`).

Sign in as the admin from `ADMIN_EMAIL` / `ADMIN_PASSWORD` (`.env.local`), then add people in Settings > Team.

**Production:** `npm run build` then `npm run server`: one process serves both the API and the built app. Put it behind HTTPS
(Caddy). Health check: `GET /health` (200 when PostgreSQL is reachable).

### Scripts

| Script | What it does |
|---|---|
| `npm run dev` | App dev server on port 3000 |
| `npm run build` | Type-check and build the app to `dist/` |
| `npm run preview` | Serve the production build on port 3000 |
| `npm run server:build` | Build the API server to `dist-server/` |
| `npm run server` | Build and start the API server (port 3001) |
| `npm start` | Start an already-built server |
| `npm run lint` / `npm run typecheck` | oxlint / TypeScript |

---

## 11. Environment variables

The committed `.env` holds **empty placeholders only**. Real values go in `.env.local` (gitignored).

| Variable | Used by | Meaning |
|---|---|---|
| `VITE_API_SERVER` | App | `true` = server mode; otherwise prototype mode |
| `VITE_API_URL` | App | Only when the API is on another origin |
| `DATABASE_URL` | Server | PostgreSQL connection string (secret) |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME` | Server | First admin, set on start while they have no password (secret) |
| `PORT`, `STATIC_DIR`, `CORS_ORIGIN` | Server | Port (3001), built app folder (`dist`), allowed origins |

---

## 12. Development rules and conventions

From `CLAUDE.md` (the full rulebook):

- **API calls** only through `src/services` → `src/services/http.ts`. Never query the database from components.
- **Business rules** live in `src/backend/handlers`; they run in both browser and Node.
- **New collection** → update `server/pg-store.ts`, `server/schema.sql` and `src/backend/local-store.ts`.
- **Acting member** only via `src/lib/auth` (`currentAuthUid`, `switchUser`; switching resets the session).
- **Validation:** `src/lib/schemas.ts` (forms, inline edits, CSV rows, data layer).
- **Platforms:** `src/lib/platforms.ts`; **stages:** `src/lib/stages.ts` + `useStageMover`;
  **permissions:** `useCan`; **stage colours:** `STAGE_META`.
- **Dates:** always via `src/lib/format.ts` (`formatDate`, `formatDateTime`, …); inputs via `DateInput` /
  `DateTimeInput`; relative times via `RelativeTime`. Never `date-fns` `format` or `toLocale…String` in components.
- **Reuse shared pieces:** pool actions (`features/pool`), duplicates (`features/duplicates`), documents
  (`features/documents`), Log Call dialog, Package drawer, `CollapsibleFilters`, `useJob` / `waitForJob`.
- **Charts:** one series colour (`--chart-series-1`), thin marks, a table view.
- No sample or invented data anywhere. No features beyond the spec without asking. Record API decisions in
  `docs/contract-decisions.md`.
- **Before calling a change done:** `npm run lint`, `npm run typecheck`, `npm run build`, `npm run server:build`.

---

## 13. Limits and known gaps

- The whole workspace is in server memory: fine for thousands of records; for much more, move handlers to SQL.
- **One server instance only** — a second would overwrite the first one's changes.
- Jobs and a CSV waiting to be imported live in memory: a restart mid-import loses the job (finished imports are
  saved). Unpolled jobs are dropped after an hour.
- Sign-in lockouts (5 wrong passwords → 15 minutes) are in memory and reset on restart. No password-reset email: an admin sets a new password.
- Other people's changes appear on the next refetch, not instantly.
- Auto-release of stale claims and connect-link expiry run at the start of each request (no scheduler).
- Social platform APIs (lookup, sync, connect links, growth history) are not connected.
- No automated end-to-end test suite yet.

**Troubleshooting:** `docs/server.md`.

---

## 14. Where to find more

| File | Contents |
|---|---|
| `CLAUDE.md` | Rules and conventions for working on the code |
| `README.md` | Quick start, features, roles |
| `docs/data-model.md` | Types, stages, transitions, permissions |
| `docs/api-contract.md` | Every endpoint |
| `docs/contract-decisions.md` | Exact API behaviour (accounts, duplicates, pool, CSV, jobs) |
| `docs/dates-and-documents.md` | Date format rules; document upload, scoping, the Onboarded rule |
| `docs/screens.md` | What each screen contains; build phases |
| `docs/server.md` | PostgreSQL setup, API server, tables, files, limits, troubleshooting |

---

## 15. Project status (Nov 2026)

All six frontend phases are complete, plus the Unassigned Pool, multi-platform accounts with duplicate detection
and merge, Documents and Onboarded tabs. In Nov 2026 data moved to **PostgreSQL
behind the API server**. Work happens on the `data/abhay` branch; `main` is the base for pull requests.
