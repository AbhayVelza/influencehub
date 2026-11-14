# InfluenceHub — Frontend (React)

Internal CRM for managing influencers. All six frontend phases, the Unassigned Pool, multi-platform accounts
(with duplicate detection), Documents (insights summaries, agreements), the dd/MM/yyyy date format and team
management (admins add members) are built. There is no sign-in yet ("Acting as" in the account menu; Firebase removed). Data lives in PostgreSQL behind the API
server in `server/` (prototype mode: in the browser); no sample data. Before calling any change done, run
`npm run lint`, `npm run typecheck`, `npm run build`, `npm run server:build`.
Docs: this file, README.md and `docs/`. Never add features beyond this spec without asking; record any API decision
you make in `docs/contract-decisions.md` (dates and documents: `docs/dates-and-documents.md`).

## Business flow
Gather data → call → onboard → send package.
Stages: data_gathered → contacted → onboarded → package_sent → delivered. Side stages: on_hold, rejected.
Add manually / by CSV (lookup and sync aren't connected to a platform API yet); one creator can have accounts on several platforms. Calls: no answer /
call back → follow-up; not interested → rejected; interested → contacted. Package returned → back to onboarded.

## Detail lives in docs/ (read only what the task touches)
- `docs/data-model.md`: types, stages and transitions, permissions (source of truth: `src/types/index.ts`)
- `docs/api-contract.md`: endpoints
- `docs/contract-decisions.md`: API behaviour the handlers implement (accounts, duplicates, pool, CSV, jobs)
- `docs/dates-and-documents.md`: dd/MM/yyyy rules; documents upload, scoping, the Onboarded rule
- `docs/screens.md`: what each screen contains, and the build phases
- `docs/server.md`: PostgreSQL setup, the API server, acting member, table layout, files, limits

## Tech stack
Vite + React 19 + TypeScript, Tailwind, shadcn/ui, lucide-react, React Router, TanStack Query,
TanStack Table, Recharts, dnd-kit, react-hook-form + zod, date-fns (display in Asia/Kolkata), sonner,
PostgreSQL (`postgres`; data and document files), Hono
(API server), MSW's `getResponse` router (routes API calls to the handlers, in the browser and on the server; no
service worker).

**UX**: light/dark; desktop-first, usable at 1024px; skeletons + empty + error states everywhere;
numbers 12.4K / 1.2M; dates dd/MM/yyyy; relative times; toasts; "/" focuses search; same stage colors everywhere.

## Rules
- All API calls only through `src/services` → `src/services/http.ts`, which calls the API server (`server/main.ts`) or,
  in prototype mode, `handleApiRequest` (`src/backend/index.ts`) in the browser. Both run the same handlers
  (`src/backend/handlers`: the business rules) over `db`, a working copy that a store loads and saves (only what
  changed, after each request). Never query the database from components. New collections need `server/pg-store.ts`,
  `server/schema.sql` and `src/backend/local-store.ts`. No sample or invented data anywhere.
- The server answers one request at a time and is the only writer to PostgreSQL: run a single instance. `src/backend`
  and what it imports must run in both the browser and Node (no `window`).
- No sign-in yet: the acting member lives in `src/lib/auth` (`currentAuthUid`, `switchUser`, which calls
  `resetSession` in `src/lib/session.ts`: cancels requests, clears the query + mutation cache, remounts the routes).
  Requests send it as `X-Acting-As`; `resolveActingUid` (`src/backend/db.ts`) falls back to an active admin. Never
  commit secrets: .env is committed (empty placeholders); DATABASE_URL goes in .env.local.
- Modes (`src/lib/mode.ts`): `VITE_API_SERVER=true` = the API server over PostgreSQL (`server/pg-store.ts`; files in
  the `files` table); otherwise PROTOTYPE (`db` and files saved to IndexedDB by `src/backend/local-store.ts`).
  `src/backend/index.ts` uses the local store; `server/main.ts` the PostgreSQL one. Keep both working.
- Every production chunk stays under 500 kB (vendor groups in vite.config).

## Conventions (reuse, don't duplicate)
- Validation: `src/lib/schemas.ts` (forms, inline edits, CSV rows via `src/lib/csv-import.ts`, the data layer).
- Platforms: `src/lib/platforms.ts` (labels, metrics, sync defaults, handle normalising, linked-account parsing,
  total reach); `PlatformMark` / `AccountLabel` in `components/common/platform-badge.tsx`.
- Stage rules: `src/lib/stages.ts`; stage moves in the UI go through `useStageMover`
  (`src/features/influencers/stage-mover.tsx`): required modals, confirms, override reasons.
- Permissions: `src/lib/permissions.ts` (`useCan`). Stage colours: `STAGE_META` in `src/lib/constants.ts`.
- Pool: `features/pool` (`usePoolActions` for claim / bulk claim / assign with the right toasts, `PoolPreview`,
  `ReleaseDialog`). Handle conflicts: `features/add-influencer/already-in-crm.tsx` + `conflict.ts`; account rows:
  `account-row.tsx` + `account-input.ts`. Duplicates: `features/duplicates` (`DuplicateWarning`, `MergeDialog`).
- Shared UI: filters sit behind `CollapsibleFilters` (a "Filters" button; collapsed by default); Log Call dialog (`features/calls`), Package drawer + status confirm (`features/packages`),
  influencer filter bar / search / chips (`features/influencers`), jobs via `useJob` or `waitForJob`.
- Dates: every displayed date goes through `src/lib/format.ts` (`formatDate`, `formatDateTime`, `formatTime`,
  `formatChartDate`, `formatDay`; never `date-fns` `format` or `toLocale…String` in components). Relative times use
  `RelativeTime` (`components/common/relative-time.tsx`); inputs use `DateInput` / `DateTimeInput`
  (`components/common/date-input.tsx`) with `parseDateInput` / `parseDateTimeInput` or the `dateField` zod schemas.
- Documents: `features/documents` (`DocumentUploadDialog`, `useDocumentActions` for preview / download / delete,
  `DocFlags`), file rules and labels in `src/lib/documents.ts`, queries in `features/documents/queries.ts`.
- Charts follow the dataviz rules: one validated series colour (`--chart-series-1`), thin marks, a table view.
