# InfluenceHub — Frontend (React)

Internal CRM for managing influencers. All six frontend phases, the Unassigned Pool, multi-platform accounts
(with duplicate detection), Documents (insights summaries, agreements) and the dd/MM/yyyy date format are built.
Before calling any change done, run `npm run lint`, `npm run typecheck`,
Docs: this file, README.md and `docs/`. Never add features beyond this spec without asking; record any API decision
you make in `docs/contract-decisions.md` (dates and documents: `docs/dates-and-documents.md`).

## Business flow
Gather data → call → onboard → send package.
Stages: data_gathered → contacted → onboarded → package_sent → delivered. Side stages: on_hold, rejected.
Add via public profile lookup / manual / CSV; one creator can have accounts on several platforms. Calls: no answer /
call back → follow-up; not interested → rejected; interested → contacted. Package returned → back to onboarded.

## Detail lives in docs/ (read only what the task touches)
- `docs/data-model.md`: types, stages and transitions, permissions (source of truth: `src/types/index.ts`)
- `docs/api-contract.md`: endpoints
- `docs/contract-decisions.md`: API behaviour the backend must match (accounts, duplicates, pool, CSV, jobs)
- `docs/dates-and-documents.md`: dd/MM/yyyy rules; documents upload, scoping, the Onboarded rule
- `docs/screens.md`: what each screen contains, and the build phases

## Tech stack
Vite + React 19 + TypeScript, Tailwind, shadcn/ui, lucide-react, React Router, TanStack Query,
TanStack Table, Recharts, dnd-kit, react-hook-form + zod, date-fns (display in Asia/Kolkata), sonner,
MSW (mock API), Playwright Test (e2e). Later: openapi-typescript and aws-amplify (backend prompt's final phase).

**UX**: light/dark; desktop-first, usable at 1024px; skeletons + empty + error states everywhere;
numbers 12.4K / 1.2M; dates dd/MM/yyyy; relative times; toasts; "/" focuses search; same stage colors everywhere.

## Rules
- All API calls only through `src/services`; no hardcoded URLs (env vars).
- MSW toggled by `VITE_USE_MOCKS` (a build-time literal, see vite.config). Dev "View as" signs the mock API in
  as any active team member (`src/lib/mock-user.ts`). Switching user / role and signing out must call `resetSession`
  (`src/lib/session.ts`: cancels requests, clears the query + mutation cache, remounts the routes). Without
  VITE_USE_MOCKS, production builds contain no MSW code, fixtures or worker script. Every production chunk stays
  under 500 kB (vendor groups in vite.config).
- E2E: `npm run test:e2e` (Playwright, `e2e/`) starts or reuses the dev server on port 5199 with mocks; each test gets
  fresh mock data and fails on any console error. Navigate in-app after changing data (a reload resets the mocks).
  `e2e/a11y.spec.ts` runs axe (`@axe-core/playwright`) on every main page: no serious or critical violations.

## Conventions (reuse, don't duplicate)
- Validation: `src/lib/schemas.ts` (forms, inline edits, CSV rows via `src/lib/csv-import.ts`, the mock API).
- Platforms: `src/lib/platforms.ts` (labels, metrics, sync defaults, handle normalising, linked-account parsing,
  total reach); `PlatformMark` / `AccountLabel` in `components/common/platform-badge.tsx`.
- Stage rules: `src/lib/stages.ts`; stage moves in the UI go through `useStageMover`
  (`src/features/influencers/stage-mover.tsx`): required modals, confirms, override reasons.
- Permissions: `src/lib/permissions.ts` (`useCan`). Stage colours: `STAGE_META` in `src/lib/constants.ts`.
- Pool: `features/pool` (`usePoolActions` for claim / bulk claim / assign with the right toasts, `PoolPreview`,
  `ReleaseDialog`). Handle conflicts: `features/add-influencer/already-in-crm.tsx` + `conflict.ts`; account rows:
  `account-row.tsx` + `account-input.ts`. Duplicates: `features/duplicates` (`DuplicateWarning`, `MergeDialog`).
- Shared UI: Log Call dialog (`features/calls`), Package drawer + status confirm (`features/packages`),
  influencer filter bar / search / chips (`features/influencers`), jobs via `useJob` or `waitForJob`.
- Dates: every displayed date goes through `src/lib/format.ts` (`formatDate`, `formatDateTime`, `formatTime`,
  `formatChartDate`, `formatDay`; never `date-fns` `format` or `toLocale…String` in components). Relative times use
  `RelativeTime` (`components/common/relative-time.tsx`); inputs use `DateInput` / `DateTimeInput`
  (`components/common/date-input.tsx`) with `parseDateInput` / `parseDateTimeInput` or the `dateField` zod schemas.
- Documents: `features/documents` (`DocumentUploadDialog`, `useDocumentActions` for preview / download / delete,
  `DocFlags`), file rules and labels in `src/lib/documents.ts`, queries in `features/documents/queries.ts`.
- Charts follow the dataviz rules: one validated series colour (`--chart-series-1`), thin marks, a table view.
