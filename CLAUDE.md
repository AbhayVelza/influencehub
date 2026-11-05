# InfluenceHub — Frontend (React)

Internal CRM for managing influencers. All six frontend phases, the Unassigned Pool, multi-platform accounts
(with duplicate detection), Documents (insights summaries, agreements), the dd/MM/yyyy date format and Firebase
email + password sign-in (no public sign-up; admins add members) are built. Data lives in Firestore; there is no API
server and no sample data. Before calling any change done, run `npm run lint`, `npm run typecheck`, `npm run build`.
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
- `docs/auth.md`: Firebase setup, sign-in, the data layer, Firestore layout, rules and their limits, seed script

## Tech stack
Vite + React 19 + TypeScript, Tailwind, shadcn/ui, lucide-react, React Router, TanStack Query,
TanStack Table, Recharts, dnd-kit, react-hook-form + zod, date-fns (display in Asia/Kolkata), sonner,
Firebase (Auth, Firestore, Storage; firebase-admin for `scripts/seed-admin.mjs`), MSW's `getResponse` router (in-app
API, no service worker).

**UX**: light/dark; desktop-first, usable at 1024px; skeletons + empty + error states everywhere;
numbers 12.4K / 1.2M; dates dd/MM/yyyy; relative times; toasts; "/" focuses search; same stage colors everywhere.

## Rules
- All API calls only through `src/services` → `src/services/http.ts` → `handleApiRequest` (`src/backend/index.ts`):
  the handlers in `src/backend/handlers` hold the business rules over `db`, a live Firestore copy kept by
  `src/backend/persistence.ts` (writes back only what changed after each request). Never read or write Firestore from
  components. New collections need `persistence.ts` and `firestore.rules`. No sample or invented data anywhere.
- Sign-in: everything goes through `src/lib/auth` (`signIn`, `signOut`, `changePassword`, `useAuthUser`). Sign out only
  via its `signOut`: the auth change calls `resetSession` (`src/lib/session.ts`: cancels requests, clears the query +
  mutation cache, remounts the routes). Team records are keyed by Firebase uid. Never commit secrets: .env is
  committed (empty placeholders); Firebase config, ADMIN_* and service-account keys go in .env.local.
- Modes (`src/lib/mode.ts`): no Firebase config = PROTOTYPE (no sign-in, `src/lib/auth/local.ts` "Acting as";
  `db` saved to IndexedDB by `src/backend/local-store.ts`, files too); Firebase config = Firestore
  (`firestore-store.ts`). `src/backend/persistence.ts` picks the store. Keep both working.
- Every production chunk stays under 500 kB (vendor groups in vite.config); the sign-in page loads no data layer.

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
