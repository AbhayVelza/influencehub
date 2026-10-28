# InfluenceHub — Frontend (React)

Internal CRM for managing influencers. Work in phases. After each phase: run `npm run lint` +
`npm run typecheck`, summarize, and STOP. Do not create other documentation files.
Never add features beyond this spec without asking.

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
- **Activity**: id, influencer_id, actor, type, payload, created_at
- **FollowerSnapshot**: followers, following, engagement_rate, captured_at
- **MediaItem**: thumbnail, permalink, likes, comments, posted_at
- **Permissions**: executive = view/add/edit/call/package/change stage; manager += reopen rejected,
  reassign, delete, import/export; admin += override stages, manage team, categories, integrations.

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
  `sync` (returns `job_id`; job result `{synced, failed[{id, message}]}`), `delete` (manager/admin).
  Response: `{succeeded[ids], failed[{id, code, message}], job_id|null}`; per-row failures don't fail the request.
  Per-row messages don't include the influencer's name (the UI adds it).
- Changing `assigned_to` (PATCH or bulk `assign`), including on an unassigned influencer, is manager/admin
  only → `403 forbidden` for executives.
- Notifications have no endpoint: they're derived from overdue + due-today follow-ups.
- `GET/PATCH /settings/instagram` (admin only, else 403). GET → `{ connected, business_account {username,
  ig_user_id} | null, token_status (valid|expiring|expired), token_expires_at, sync_interval_hours (3|6|12|24),
  api_usage_pct, last_runs[≤20] {started_at, finished_at|null, status (running|succeeded|partial|failed),
  synced, failed} }`. PATCH accepts `{ sync_interval_hours }` and returns the full object.

## Screens
1. **App shell**: sidebar (Dashboard, Influencers, Pipeline, Calls & Follow-ups w/ due-today badge,
   Packages, Settings admin-only); top bar: global search, "+ Add Influencer", notifications, user menu w/ theme toggle.
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
9. **Settings (admin)**: Instagram integration status + sync frequency, team & roles, categories.

**UX**: light/dark; desktop-first, usable at 1024px; skeletons + empty + error states everywhere;
numbers 12.4K / 1.2M; relative times; toasts; "/" focuses search; same stage colors everywhere.

## Phases
1. Scaffold, CLAUDE.md, theme, app shell, routing, TS types, API client in src/services, MSW handlers for
   all endpoints, 50 realistic mock influencers in `src/mocks/fixtures.json` (70% Indian cities, all stages
   and account types, plus calls, packages, 4 team members).
2. Influencers list (complete)
3. Influencer detail
4. Add / Import modal
5. Pipeline, Calls, Packages
6. Dashboard, Settings, polish pass

## Rules
- All API calls only through `src/services`; no hardcoded URLs (env vars).
- MSW toggled by `VITE_USE_MOCKS`.
