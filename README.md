# InfluenceHub — frontend

Internal CRM for finding, calling, onboarding and shipping packages to influencers.
React 19 + TypeScript + Vite. Two modes, picked by the build env:

- **Server mode** (`VITE_API_SERVER=true`): data and document files in PostgreSQL behind the API server in `server/`.
  Setup: [`docs/server.md`](docs/server.md).
- **Prototype mode** (the default): no server, all data saved in this browser. For demos and testing.

There is **no sign-in yet**: the account menu's **Acting as** picks which team member you are. No sample data: the
app starts empty except for an admin. One-page overview of the whole project: [`docs/project-overview.md`](docs/project-overview.md).

## What it does

**Business flow:** gather data → call → onboard → send package.

Influencers are added manually or by CSV (public profile lookup and syncing need a platform API, not connected yet).
One creator can have accounts on several platforms (Instagram, YouTube, TikTok, Facebook, Threads, Pinterest,
LinkedIn, Snapchat), each with its own stats.

| Stage | Meaning |
| --- | --- |
| Data Gathered → Contacted | Needs a call logged with outcome "Interested" |
| Contacted → Onboarded | Creator agreed; needs a current agreement and an insights summary on file |
| Onboarded → Package Sent | Needs a package with courier and tracking number |
| Package Sent → Delivered | Package arrived (a returned package moves them back to Onboarded) |
| On Hold / Rejected | Side stages. On Hold resumes to the previous stage; reopening Rejected is manager/admin only |

Call outcomes: no answer / call back create a follow-up, not interested rejects, interested moves to Contacted.
Admins can override any stage move, with a required reason.

## Features

- **Dashboard**: KPIs, pipeline funnel, by-category and top-cities charts, my follow-ups, activity feed.
- **Influencers**: filterable (category, platform, country → state → city, stage, owner, agreement, insights, reach),
  sortable table, saved views, bulk actions, CSV import / export. Filters live in the URL.
- **Influencer detail**: stage stepper, social accounts with per-platform stats, calls, packages, documents, activity.
- **Add / Import**: manual entry and CSV with a preview.
- **Unassigned Pool**: influencers with no owner. Executives see a preview and claim; managers assign.
  Optional guards: claim limit and auto-release.
- **Possible duplicates** (manager/admin): side-by-side pairs with confidence and reasons; merge or dismiss.
- **Documents**: insights summaries and agreements (current + version history). PDF / JPG / PNG / DOCX / XLSX up to
  20 MB, upload progress, preview, soft delete (manager/admin).
- **Onboarded**: one tab per platform listing the creators onboarded there.
- **Pipeline** kanban, **Calls & Follow-ups**, **Packages**.
- **Settings** (admin): Instagram integration, team (add members, roles, deactivate), categories, pool guards.
- Light / dark theme, usable at 1024px, skeleton / empty / error states. Dates are `dd/MM/yyyy` and date-times
  `dd/MM/yyyy, hh:mm a` in Asia/Kolkata (the API stays ISO 8601).

## Tech stack

Vite, React 19, TypeScript, Tailwind, shadcn/ui, lucide-react, React Router, TanStack Query and Table, Recharts,
dnd-kit, react-hook-form + zod, date-fns, sonner, MSW's request router (no service worker), oxlint.
API server: Node, Hono, PostgreSQL (`postgres`).

## Project layout

```
src/
  components/   layout shell, shared UI, shadcn/ui
  features/     add-influencer, calls, dashboard, documents, duplicates, influencers, onboarded, packages,
                pipeline, pool, settings
  pages/        one component per route
  services/     the only place that calls the API
  backend/      the business rules (API handlers) over a working copy of the data
  lib/          acting member (auth), schemas (zod), platforms, stages, permissions, formatting, session, mode
  types/        data types, the source of truth for the contract
server/         the API server: runs src/backend's handlers over PostgreSQL (main.ts, pg-store.ts, schema.sql)
```

## Run it

### Prototype mode (no setup)

```bash
npm install
npm run dev          # http://localhost:3000, you're the Admin
```

Everything is saved in this browser (IndexedDB). Account menu > **Reset prototype data** starts again.

### Server mode (PostgreSQL)

Create the database and fill `.env.local` ([`docs/server.md`](docs/server.md)), then:

```bash
npm install
npm run server       # API on http://localhost:3001 (creates tables, adds the owner admin on first start)
npm run dev          # app on http://localhost:3000
```

To try other roles: **Settings > Team & roles > Add member**, then account menu > **Acting as**.

| Script | What it does |
| --- | --- |
| `npm run dev` | App dev server on port 3000 |
| `npm run build` | Type-check and build the app to `dist/` |
| `npm run preview` | Serve the production build on port 3000 |
| `npm run server:build` / `npm run server` / `npm start` | Build / build and start / start the API server (port 3001) |
| `npm run lint` / `npm run typecheck` | oxlint / TypeScript |

## Environment variables

| Variable | Meaning |
| --- | --- |
| `VITE_API_SERVER` | `true` = server mode; otherwise prototype mode |
| `VITE_API_URL` | Only when the API server is on another origin than the app |
| `DATABASE_URL` | PostgreSQL connection string for the server (secret) |
| `PORT`, `STATIC_DIR`, `CORS_ORIGIN` | Server port (3001), built app folder (`dist`), allowed origins |

The committed `.env` holds empty placeholders only. Put your values in `.env.local` (gitignored).

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

The data layer (`src/backend`) applies these and the UI hides what a role can't do.

## API

The services call `/api/v1/...`: the API server, or the data layer in the browser in prototype mode. Shapes are in
`docs/api-contract.md`. Lists return `{ items, total, page, page_size }`, errors `{ error: { code, message } }`.
Imports and exports return a `job_id` that the UI polls (`GET /jobs/{id}`).

## Checks

Before calling a change done, run `npm run lint`, `npm run typecheck`, `npm run build` and `npm run server:build`.
There is no automated end-to-end suite yet.

## More

`CLAUDE.md` holds the rules and conventions. `docs/` holds the project overview, data model, API contract, contract
decisions, dates and documents, screens and `docs/server.md` (PostgreSQL and the API server).
