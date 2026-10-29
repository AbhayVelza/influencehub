# InfluenceHub — Frontend (React)

Internal CRM for managing influencers. All six frontend phases and the Unassigned Pool are built. Before calling any change done,
run `npm run lint`, `npm run typecheck` and `npm run build`, and check it in the browser for each role
(use the "View as" switcher). Docs: this file and README.md only. Never add features beyond this spec
without asking; record any API decision you make in "Contract decisions" below.

## Business flow
Gather data → call → onboard → send package.
Stages: data_gathered → contacted → onboarded → package_sent → delivered. Side stages: on_hold, rejected.
Add via IG username / manual / CSV. Business/Creator IG → auto-fetch; Personal/not found → manual entry
with "Not synced" badge. Calls: no answer / call back → follow-up; not interested → rejected;
interested → contacted. Package returned → back to onboarded.

## Data model (must match backend exactly)
- **Stage** (value · label · color): data_gathered·Data Gathered·slate | contacted·Contacted·blue |
  onboarded·Onboarded·violet | package_sent·Package Sent·amber | delivered·Delivered·green |
  on_hold·On Hold·gray | rejected·Rejected·red
- **Transitions**: data_gathered → contacted/on_hold/rejected; contacted → onboarded/on_hold/rejected;
  onboarded → package_sent/on_hold/rejected; package_sent → delivered/onboarded (returned);
  on_hold → previous stage/rejected; rejected → data_gathered (manager/admin only). Admin can override.
  → contacted requires a call log with outcome "interested"; → package_sent requires a package with
  courier + tracking number.
- **CallOutcome**: interested, not_interested, call_back, no_answer, wrong_number
- **PackageStatus**: preparing, sent, in_transit, delivered, returned
- **AccountType**: business, creator, personal, unknown · **SyncStatus**: synced, pending, not_synced, error
- **Role**: admin, manager, executive
- **Categories**: Fashion, Beauty, Food, Tech, Travel, Fitness, Lifestyle, Gaming, Finance, Parenting, Other
- **Influencer**: id, name, category, instagram_handle (lowercase, no @, unique), profile_url, phone (E.164,
  default +91), email, address {line1, line2, city, state, postal_code, country}, city, state, country,
  followers, following, posts_count, engagement_rate (%), bio, is_verified, account_type, profile_pic_url,
  ig_sync_status, last_synced_at, stage, assigned_to, tags[], notes,
  onboarding_checklist {called, terms_agreed, address_collected, ig_connected}, created_at, updated_at
- **CallLog**: id, influencer_id, called_by, outcome, notes, follow_up_date, follow_up_done, created_at
- **Package**: id, influencer_id, items [{name, qty}], address, courier, tracking_number, status, sent_at, delivered_at
- **Activity**: id, influencer_id, actor, type, payload, created_at. Types: created, updated, stage_changed, assigned,
  call_logged, package_created, package_updated, ig_synced, claimed `{}`, released `{from, reason, auto?}`
- **FollowerSnapshot**: followers, following, engagement_rate, captured_at
- **MediaItem**: thumbnail, permalink, likes, comments, posted_at
- **Permissions**: executive = view/add/edit/call/package/change stage on **their own** influencers, see the pool
  (preview only), claim from it, release their own to it; manager += see everything, assign/reassign, release anyone's,
  reopen rejected, delete, import/export; admin += override stages, manage team, categories, integrations, pool guards.

## Tech stack
Vite + React 19 + TypeScript, Tailwind, shadcn/ui, lucide-react, React Router, TanStack Query,
TanStack Table, Recharts, dnd-kit, react-hook-form + zod, date-fns (display in Asia/Kolkata), sonner,
MSW (mock API). Later: openapi-typescript and aws-amplify (backend prompt's final phase).

## API contract (MSW mocks it now)
Base `VITE_API_URL` + `/api/v1`. Lists → `{ items, total, page, page_size }`. Errors → `{ error: { code, message } }`.
- GET /influencers (q, category[], country[], state[], city[], stage[], assigned_to[], followers_min,
  followers_max, sort, page, page_size) · GET /influencers/filter-options?country=&state= (cascading, with counts)
- POST /influencers · GET/PATCH/DELETE /influencers/{id} · GET /influencers/check-handle?handle=
- POST /influencers/{id}/stage {to, reason} · POST /influencers/bulk {ids, action, value}
- GET /influencers/{id}/activity · /snapshots · /media · POST /influencers/{id}/sync → {job_id}
- GET/POST /influencers/{id}/calls · GET /calls/follow-ups?bucket=today|overdue|upcoming|history · POST /calls/{id}/done
- GET/POST/PATCH /packages · GET /pipeline · GET /dashboard/summary
- POST /instagram/lookup {username} → {job_id} · POST /imports/csv/presign · POST /imports/csv → {job_id}
- POST /exports/influencers → {job_id} · GET /jobs/{id} → {status, progress, result, error}
- GET /me · GET/POST/PATCH /team · GET/POST/PATCH /categories · GET/POST/DELETE /saved-views
- GET /pool (same filters, sort and pagination as /influencers) · GET /pool/filter-options · GET /pool/{id} ·
  GET /pool/expiring · POST /influencers/{id}/claim · POST /influencers/{id}/release {reason} ·
  POST /influencers/bulk action `claim` · GET/PATCH /settings/pool {claim_limit, auto_release_days}
Async actions return job_id; UI polls GET /jobs/{id} every 2 s.

## Contract decisions (backend must match; source of truth for types is `src/types/index.ts`)
- Multi-value query params are repeated keys: `?stage=a&stage=b`.
- Sorting: `sort=field` ascending, `sort=-field` descending (nulls last).
- Job statuses: `queued | running | succeeded | failed`; `progress` 0–100; `error {code, message}` when failed.
- `POST /instagram/lookup` returns `409 {error: {code: "already_exists"}}` immediately if the handle is in the CRM;
  other lookup failures come back as failed jobs (`personal_account`, `not_found`, `rate_limited`).
- Logging a call (`POST /influencers/{id}/calls`) marks that influencer's open follow-ups as done.
- Admin override (a move outside the standard transitions) skips the call/package requirements but needs a
  `reason`; without one → `422 reason_required`. Activity payload: `{from, to, reason, override: true}`.
  Bulk `change_stage` has no reason field, so it can't override.
- `POST /influencers/bulk` actions: `change_stage` (value = stage), `assign` (value = user id or null; manager/admin),
  `claim` (no value; per-row `already_claimed` / `claim_limit_reached`), `sync` (returns `job_id`; job result
  `{synced, failed[{id, message}]}`), `delete` (manager/admin).
  Response: `{succeeded[ids], failed[{id, code, message}], job_id|null}`; per-row failures don't fail the request.
  Per-row messages don't include the influencer's name (the UI adds it).
- **Executive scoping** (server-side): executives only ever get influencers they own. Every `/influencers…`
  endpoint (list, filter-options, detail, PATCH, stage, calls, activity, snapshots, media, sync), `/pipeline`,
  `/packages`, `/calls/follow-ups`, `/calls/{id}/done`, `/dashboard/summary` and bulk rows treat anything else as
  missing (404 / left out). Unassigned influencers reach executives only through `/pool`.
- **Unassigned Pool**: `GET /pool` = influencers with `assigned_to = null`, same params as `/influencers`
  (`assigned_to` ignored). Managers/admins get full `Influencer` rows; executives get `PoolInfluencerPreview`
  (id, name, category, instagram_handle, profile_url, profile_pic_url, is_verified, followers, city, state,
  country, stage, created_at) — never phone, email, address, notes, tags, checklist or calls — and their `q`
  matches name / handle / city only. `GET /pool/{id}` is the same shape, 404 unless unassigned.
  `GET /pool/filter-options` = filter-options over the pool.
- **Owner changes**: managers/admins set any `assigned_to` (PATCH, bulk `assign`). Executives can't PATCH or bulk
  `assign` owners (403); on `POST /influencers` they may set themselves or null (null = straight into the pool).
- **Claim** `POST /influencers/{id}/claim` (any role): atomic — succeeds only while unassigned (or already mine,
  idempotent 200); else `409 already_claimed` ("Already claimed by a teammate"). Returns the full influencer,
  sets owner = me, writes a `claimed` activity. Claim limit (below) → `409 claim_limit_reached`.
- **Release** `POST /influencers/{id}/release {reason}`: executives their own only (others are 404), managers and
  admins anyone's. Reason required (`422 reason_required`); already unassigned → `409 not_assigned`. 204; writes
  `released {from, reason}`. Managers' owner menu uses this too (no "unassign" without a reason in the UI).
- **Duplicates**: handles are normalised everywhere (forms, lookup, CSV, API): full Instagram URLs and a leading `@`
  are stripped, then lowercased. `GET /influencers/check-handle` → `{available, influencer_id, conflict}` with
  `conflict` = `exists` (visible to you) | `in_pool` (unassigned) | `assigned_to_other` (an executive's teammate
  owns it; `influencer_id` is null so nothing leaks). `POST /influencers` → 409 `handle_taken` / `in_pool` /
  `assigned_to_other`; `POST /instagram/lookup` → 409 `already_exists` / `in_pool` / `assigned_to_other`.
  The UI offers "Claim it" for `in_pool`.
- **Pool guards** `GET/PATCH /settings/pool` (admin, else 403) `{claim_limit, auto_release_days}`, both null (off)
  by default; claim_limit 1–500, auto_release_days 1–90. Claim limit: an executive may own at most N influencers
  in `data_gathered`; claiming one more `data_gathered` influencer → 409 (other stages aren't limited, nor are
  managers/admins). Auto-release: see Backend notes. `GET /pool/expiring` = my claims the job will release by
  tomorrow (IST) `{influencer: InfluencerSummary, claimed_at, release_at}[]` — shown in notifications.
- `GET /dashboard/summary` kpis add `pool` (unassigned count, everyone) and `claimed_this_week` (claims since Monday
  00:00 IST; null for executives). For executives every other figure covers only their own influencers.
- CSV import: `POST /imports/csv/presign {filename}` → `{upload_url, key}`; client PUTs the file to `upload_url`;
  `POST /imports/csv {key, mapping, fetch_instagram, on_duplicate: skip|update}` → job. Job result
  `{total_rows, created, updated, duplicates, failed, errors[{row, instagram_handle, message}],
  instagram {synced, failed} | null}`. `row` = 1-based file line (header = line 1). Rows are validated with
  the same rules as the forms (`src/lib/csv-import.ts`); unknown/missing category → "Other"; repeated
  handles within the file count as duplicates; `update` overwrites only mapped non-empty fields and merges
  tags. Client limits: 2 MB, 5,000 rows. Import/presign are manager/admin only.
- `GET /calls/follow-ups` accepts `mine=true`: only calls I made or on influencers I own (also used for the
  dashboard's "my follow-ups"). Executives only see their own influencers anyway, so only managers/admins get the
  toggle. Embedded `influencer` summaries include `assigned_to`.
- `GET /pipeline` cards include `category`; `days_in_stage` = calendar days since the last move into the stage.
- `GET /packages` accepts `sent_from` / `sent_to` (yyyy-MM-dd, IST calendar day of `sent_at`; unsent packages
  never match a date range).
- `PATCH /packages/{id}`: when status changes to `delivered` / `returned` and the influencer is in
  `package_sent`, the server moves them to `delivered` / `onboarded` (standard transition, activity reason
  "Package delivered" / "Package returned"). Otherwise the stage is untouched. The UI confirms first.
- Notifications have no endpoint of their own: they combine overdue + due-today follow-ups and `GET /pool/expiring`.
- `GET/PATCH /settings/instagram` (admin only, else 403). GET → `{ connected, business_account {username,
  ig_user_id} | null, token_status (valid|expiring|expired), token_expires_at, sync_interval_hours (3|6|12|24),
  api_usage_pct, last_runs[≤20] {started_at, finished_at|null, status (running|succeeded|partial|failed),
  synced, failed} }`. PATCH accepts `{ sync_interval_hours }` and returns the full object.
- `GET /dashboard/summary`: `top_cities` = top 10 by influencer count; `recent_activity` = latest 20;
  `my_follow_ups` = today + overdue, scoped like `mine=true`; "contacted this week" counts moves since Monday 00:00 IST.
- Team: `POST /team {email, role, name?}` (name derived from the email when omitted; 409 `email_taken`).
  `PATCH /team/{id}` → 422 `self_change` when you change your own role / deactivate yourself, 422 `last_admin`
  when it would leave no active admin.
- Categories carry `influencer_count`. `DELETE /categories/{id}` (admin) → 409 `in_use` while any influencer
  uses it (deactivate instead); 204 otherwise. Renaming a category renames it on its influencers. Inactive
  categories stay on existing influencers but aren't offered for new ones.

## Backend notes (jobs the frontend relies on)
- **Auto-release job** (scheduled, e.g. hourly): when `auto_release_days` = N is set, an influencer whose current
  ownership came from a claim (its latest claimed/assigned/released activity is a `claimed` by the current owner)
  and has no call logged since `claimed_at` is released at `claimed_at + N days`: `assigned_to = null`, activity
  `released {from, reason: "No call logged within N days of claiming", auto: true}` with actor null. Assignments by a
  manager never auto-release. Notify the owner the day before (IST): the UI shows `GET /pool/expiring` in the bell;
  add email/push if wanted. The mock runs this job before every request (`runAutoRelease` in `src/mocks/domain.ts`).

## Screens
1. **App shell**: sidebar (Dashboard, Influencers, Unassigned Pool w/ count, Pipeline, Calls & Follow-ups w/
   due-today badge, Packages, Settings admin-only); top bar: global search, "+ Add Influencer", notifications, user menu w/ theme toggle.
2. **Dashboard**: KPIs (total, contacted this week, onboarded this month, packages in transit, follow-ups today),
   pipeline funnel (click → filtered list), by-category + top-cities bars, my follow-ups, activity feed.
3. **Influencers list (top priority)**: header w/ count + Import CSV / Export / + Add; search; Saved views;
   filters Category/Country/State/City/Stage/Assigned/Followers; active filter chips + Clear all; table;
   bulk bar (Change stage, Assign, Sync IG, Export); pagination.
   Columns: name+avatar+verified, category, @handle (opens profile), followers, phone (tel:), email (mailto:),
   city, state, country, stage badge, assigned to, sync status, last synced. Column visibility, sorting,
   pagination. Cascading Country → State → City multi-selects w/ search + counts. Filters in URL.
4. **Influencer detail**: header (avatar, name, verified, @handle, category, location, Stage ▾, Owner ▾,
   Log call, Create package, ⋯) + stage stepper. Left: Instagram panel (synced/pending/error/not-synced
   states, Sync now, stats, eng. rate, bio, growth chart, 6 recent posts). Right tabs: Overview (contact,
   address, tags, notes, onboarding checklist), Calls, Packages, Activity. Stage dropdown shows only allowed
   transitions and opens required modal. Inline-editable fields.
5. **Add / Import modal**: Fetch from Instagram (username → job → preview → add category/phone/email/location
   → save; errors: personal account, not found, rate limit, already in CRM); Manual (zod form);
   CSV (template download, upload, column mapping, preview w/ errors, progress, result summary).
6. **Pipeline kanban**: column per stage w/ counts; cards (avatar, name, handle, followers, owner, days in stage);
   dnd follows transition rules + triggers required modals; same filters as list.
7. **Calls & Follow-ups**: tabs today/overdue/upcoming/history. Log Call modal: outcome, notes, follow-up date,
   "Move to Contacted" when interested.
8. **Packages**: table w/ filters; create/edit drawer, address prefilled from influencer, copy tracking number.
9. **Settings (admin)**: Instagram integration status + sync frequency, team & roles, categories, pool guards.
10. **Unassigned Pool**: list filters (no owner filter) in the URL; row → preview drawer (not the profile).
   Executives: preview fields + Claim / bulk Claim. Managers/admins: full details + Assign to… / bulk assign.
   An executive opening an unassigned influencer's URL gets the preview with Claim; another's influencer is 404.

**UX**: light/dark; desktop-first, usable at 1024px; skeletons + empty + error states everywhere;
numbers 12.4K / 1.2M; relative times; toasts; "/" focuses search; same stage colors everywhere.

## Phases (all complete)
1. Scaffold, theme, app shell, routing, types, API client, MSW mocks + fixtures. 2. Influencers list.
3. Influencer detail. 4. Add / Import modal. 5. Pipeline, Calls, Packages. 6. Dashboard, Settings, polish.
Then: Unassigned Pool (claim / release / guards, executive scoping).

## Rules
- All API calls only through `src/services`; no hardcoded URLs (env vars).
- MSW toggled by `VITE_USE_MOCKS` (a build-time literal, see vite.config). Dev "View as" signs the mock API in
  as any active team member (`src/lib/mock-user.ts`); switching resets the query cache. Without it, production builds contain
  no MSW code, fixtures or worker script. Every production chunk stays under 500 kB (vendor groups in vite.config).

## Conventions (reuse, don't duplicate)
- Validation: `src/lib/schemas.ts` (forms, inline edits, CSV rows via `src/lib/csv-import.ts`, the mock API).
- Stage rules: `src/lib/stages.ts`; stage moves in the UI go through `useStageMover`
  (`src/features/influencers/stage-mover.tsx`): required modals, confirms, override reasons.
- Permissions: `src/lib/permissions.ts` (`useCan`). Stage colours: `STAGE_META` in `src/lib/constants.ts`.
- Pool: `features/pool` (`usePoolActions` for claim / bulk claim / assign with the right toasts, `PoolPreview`,
  `ReleaseDialog`). Duplicate notices: `features/add-influencer/already-in-crm.tsx` + `conflict.ts`.
- Shared UI: Log Call dialog (`features/calls`), Package drawer + status confirm (`features/packages`),
  influencer filter bar / search / chips (`features/influencers`), jobs via `useJob` or `waitForJob`.
- Dates display in Asia/Kolkata (`src/lib/format.ts`); datetime inputs are read as IST.
- Charts follow the dataviz rules: one validated series colour (`--chart-series-1`), thin marks, a table view.
