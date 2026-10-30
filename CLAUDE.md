# InfluenceHub — Frontend (React)

Internal CRM for managing influencers. All six frontend phases, the Unassigned Pool and multi-platform accounts
(with duplicate detection) are built. Before calling any change done, run `npm run lint`, `npm run typecheck`,
`npm run build` and `npm run test:e2e`, and check it in the browser for each role (use the "View as" switcher).
Docs: this file and README.md only. Never add features beyond this spec without asking; record any API decision
you make in "Contract decisions" below.

## Business flow
Gather data → call → onboard → send package.
Stages: data_gathered → contacted → onboarded → package_sent → delivered. Side stages: on_hold, rejected.
Add via public profile lookup / manual / CSV; one creator can have accounts on several platforms. Calls: no answer /
call back → follow-up; not interested → rejected; interested → contacted. Package returned → back to onboarded.

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
- **Platform**: instagram, youtube, tiktok, facebook, threads, pinterest, linkedin, snapchat
- **SyncMethod** (default per platform): `lookup` = instagram, youtube, threads, facebook (public Pages);
  `connect` = tiktok, pinterest; `manual` = linkedin, snapchat, and personal Instagram / Facebook profiles.
  **ConnectStatus** (connect accounts): not_connected, link_sent, connected, expired.
- **SocialAccount**: id, influencer_id, platform, handle (lowercase, no @; unique per platform), profile_url,
  is_primary, sync_method, sync_status, last_synced_at, connect_status, connect_link_expires_at, display_name,
  profile_pic_url, bio, links[], is_verified, created_at, **metrics** (per platform, every value nullable):
  instagram {followers, following, posts, engagement_rate %, avg_likes, avg_comments, account_type} ·
  youtube {subscribers, total_views, video_count, avg_views_recent, channel_country} ·
  tiktok {followers, following, total_likes, video_count} · facebook {page_followers, page_likes, page_category} ·
  threads {followers, avg_likes_recent, avg_replies_recent} · pinterest {followers, monthly_views, pin_count,
  board_count} · linkedin {followers, connections} · snapchat {subscribers}.
  Labels, audience metric and URL patterns live in `src/lib/platforms.ts` (`PLATFORM_META`).
- **Influencer**: id, name, category, phone (E.164, default +91), email, address {line1, line2, city, state,
  postal_code, country}, city, state, country, profile_pic_url (primary account's), is_verified (any account),
  accounts[] (≥1, primary first), total_reach, stage, assigned_to, tags[], notes,
  onboarding_checklist {called, terms_agreed, address_collected, ig_connected}, created_at, updated_at
- **CallLog**: id, influencer_id, called_by, outcome, notes, follow_up_date, follow_up_done, created_at
- **Package**: id, influencer_id, items [{name, qty}], address, courier, tracking_number, status, sent_at, delivered_at
- **Activity**: id, influencer_id, actor, type, payload, created_at. Types: created, updated, stage_changed, assigned,
  call_logged, package_created, package_updated, claimed `{}`, released `{from, reason, auto?}`,
  account_synced `{platform, handle, audience}`, account_added `{platform, handle}`,
  connect_link_sent `{platform, handle, emailed_to}`, merged `{merged_id, merged_name, fields, stage_from?, stage_to?}`
- **AccountSnapshot**: audience, captured_at · **MediaItem**: thumbnail, permalink, likes, comments, posted_at
- **Permissions**: executive = view/add/edit/call/package/change stage on **their own** influencers, see the pool
  (preview only), claim from it, release their own to it; manager += see everything, assign/reassign, release anyone's,
  reopen rejected, delete, import/export, review & merge duplicates; admin += override stages, manage team,
  categories, integrations, pool guards.

## Tech stack
Vite + React 19 + TypeScript, Tailwind, shadcn/ui, lucide-react, React Router, TanStack Query,
TanStack Table, Recharts, dnd-kit, react-hook-form + zod, date-fns (display in Asia/Kolkata), sonner,
MSW (mock API), Playwright Test (e2e). Later: openapi-typescript and aws-amplify (backend prompt's final phase).

## API contract (MSW mocks it now)
Base `VITE_API_URL` + `/api/v1`. Lists → `{ items, total, page, page_size }`. Errors → `{ error: { code, message } }`.
- GET /influencers (q, category[], platform[], country[], state[], city[], stage[], assigned_to[], reach_min,
  reach_max, sort, page, page_size) · GET /influencers/filter-options?country=&state= (cascading, with counts)
- POST /influencers · GET/PATCH/DELETE /influencers/{id} · GET /influencers/check-handle?platform=&handle=
- POST /influencers/{id}/stage {to, reason} · POST /influencers/bulk {ids, action, value}
- GET /influencers/{id}/activity · POST /influencers/{id}/accounts · POST /influencers/merge
- PATCH /accounts/{id} {metrics} · POST /accounts/{id}/sync → {job_id} · POST /accounts/{id}/connect-link
  {send_email?} → {url, expires_at, emailed_to} · GET /accounts/{id}/snapshots · GET /accounts/{id}/media
- POST /duplicates/check · GET /duplicates · POST /duplicates/{id}/dismiss
- GET/POST /influencers/{id}/calls · GET /calls/follow-ups?bucket=today|overdue|upcoming|history · POST /calls/{id}/done
- GET/POST/PATCH /packages · GET /pipeline · GET /dashboard/summary
- POST /lookup {platform, username} → {job_id} · POST /imports/csv/presign · POST /imports/csv → {job_id}
- POST /exports/influencers → {job_id} · GET /jobs/{id} → {status, progress, result, error}
- GET /me · GET/POST/PATCH /team · GET/POST/PATCH /categories · GET/POST/DELETE /saved-views
- GET /pool (same filters, sort and pagination as /influencers) · GET /pool/filter-options · GET /pool/{id} ·
  GET /pool/expiring · POST /influencers/{id}/claim · POST /influencers/{id}/release {reason} ·
  POST /influencers/bulk action `claim` · GET/PATCH /settings/pool {claim_limit, auto_release_days}
Async actions return job_id; UI polls GET /jobs/{id} every 2 s.

## Contract decisions (backend must match; source of truth for types is `src/types/index.ts`)
- Multi-value query params are repeated keys: `?stage=a&stage=b`.
- Sorting: `sort=field` ascending, `sort=-field` descending (nulls last). Sort keys: name, total_reach,
  primary_followers (the primary account's audience metric: followers / subscribers / page_followers), city, stage,
  created_at, updated_at.
- Job statuses: `queued | running | succeeded | failed`; `progress` 0–100; `error {code, message}` when failed.
- **Accounts**: `total_reach` = sum of each account's audience metric (followers / subscribers / page_followers),
  null when none is known; `platform[]` filters influencers with an account on any of those platforms;
  `reach_min/max` filter on total_reach; `filter-options` adds `platforms` with counts; `q` also matches every
  account handle. Handles are normalised everywhere (forms, lookup, CSV, API): the platform's profile URL and a
  leading `@` are stripped, then lowercased; format `[a-z0-9._-]{1,60}`. `(platform, handle)` is unique across the CRM.
  Influencer PATCH can't change accounts or derived fields (`accounts`, `total_reach`, `is_verified`, `profile_pic_url`).
- `POST /influencers {…, accounts: AccountCreate[]}` (≥1, first = primary). `AccountCreate {platform, handle,
  sync_method?: 'manual', metrics?, display_name?, profile_pic_url?, bio?, links?, is_verified?}`: a lookup account
  sent with `metrics` (from POST /lookup) is saved `synced`; without, `pending` until synced. Connect accounts start
  `not_connected`; manual ones are always `not_synced`. `sync_method: 'manual'` downgrades a lookup platform
  (personal Instagram / Facebook profile).
- `POST /influencers/{id}/accounts` (AccountCreate) → 201 SocialAccount, writes `account_added`; 409 like create.
- `PATCH /accounts/{id} {metrics}`: manual accounts only (else 422 `not_manual`); unknown metric keys are dropped.
- `POST /accounts/{id}/sync` → job: lookup accounts, or connect accounts once connected; else 422 `not_syncable`.
  Job result `{account_id, audience}`; a personal profile becomes `manual` (job fails `personal_account`). Writes
  `account_synced` (actor null).
- **Connect links** `POST /accounts/{id}/connect-link {send_email?}`: connect accounts only (422 `not_connectable`;
  409 `already_connected`). Returns `{url, expires_at, emailed_to}`; the link lasts 7 days; status → `link_sent`
  (`expired` once lapsed); `send_email` needs the influencer's email (422 `no_email`). Writes `connect_link_sent`.
  The creator authorising via the link sets `connected` (backend OAuth callback).
- `POST /lookup {platform, username}` (instagram, youtube, threads, facebook Pages; else 422 `not_supported`) →
  job → `LookupProfile {platform, handle, profile_url, display_name, bio, links, profile_pic_url, is_verified,
  metrics, linked_accounts: AccountRef[]}`. `linked_accounts` = other profiles found in the bio or links
  (the UI offers "Also found: YouTube @x. Add it?"). 409 immediately when the account is in the CRM
  (`already_exists` / `in_pool` / `assigned_to_other`); other failures are failed jobs (`personal_account` — a
  personal Instagram or Facebook profile —, `not_found`, `rate_limited`).
- **Duplicate detection** (`POST /duplicates/check {name, email, phone, city, accounts[{platform, handle, bio?,
  links?}], exclude_id?}` → `{matches[{influencer_id, confidence, reasons[], access, influencer}]}`), strongest first.
  Signals: same email or phone → high; an account's handle / URL found in another account's bio or links (either
  direction) → high; the same platform + handle → high; the same handle on a different platform → medium; similar
  name + same city (both trimmed, lowercased) → low. **Similar name** (exact rule, `similarNames` in
  `src/mocks/duplicates.ts`): trim and lowercase both names; empty never matches; `n` = length in characters of the
  shorter one; match when Levenshtein distance (insert / delete / substitute, each cost 1) ≤ 1 if `n` ≤ 6, else ≤ 2.
  A match's confidence = its strongest signal.
  `access`: `full` (you can see it), `pool` (unassigned), `restricted` (an executive's teammate owns it:
  `influencer_id`, `influencer` and `reasons` are empty — the UI says only "matches a creator assigned to a
  teammate"). The UI calls it before every add (manual, lookup, add account, CSV preview rows) and offers
  "Add account to existing" (full matches) or "Create anyway"; it never blocks adding.
- **Possible duplicates** (manager/admin, else 403): `GET /duplicates` = open pairs `{id, confidence, reasons,
  influencers: [older, newer]}` across the whole CRM, strongest first; `id` is stable per pair.
  `POST /duplicates/{id}/dismiss` hides a pair for good (204).
- **Merge** `POST /influencers/merge {keep_id, merge_id, field_choices}` (manager/admin) → the surviving Influencer.
  `field_choices[field] = 'keep' | 'merge'` for name, category, phone, email, address, location (city/state/country
  together), notes, assigned_to; omitted = keep. Accounts are combined (an identical platform + handle once; the
  survivor's primary stays primary); calls, packages and activity move to the survivor; tags are joined;
  checklist items are kept if either has them; the more advanced stage wins (main pipeline order; on_hold/rejected
  rank below data_gathered; ties keep the survivor's). The duplicate is deleted; `merged` is logged on the survivor.
- Logging a call (`POST /influencers/{id}/calls`) marks that influencer's open follow-ups as done.
- Admin override (a move outside the standard transitions) skips the call/package requirements but needs a
  `reason`; without one → `422 reason_required`. Activity payload: `{from, to, reason, override: true}`.
  Bulk `change_stage` has no reason field, so it can't override.
- `POST /influencers/bulk` actions: `change_stage` (value = stage), `assign` (value = user id or null; manager/admin),
  `claim` (no value; per-row `already_claimed` / `claim_limit_reached`), `sync` (every syncable account; returns
  `job_id`; job result `{synced (accounts), failed[{id (influencer), message}]}`), `delete` (manager/admin).
  Response: `{succeeded[ids], failed[{id, code, message}], job_id|null}`; per-row failures don't fail the request.
  Per-row messages don't include the influencer's name (the UI adds it).
- **Executive scoping** (server-side): executives only ever get influencers they own. Every `/influencers…` and
  `/accounts…` endpoint, `/pipeline`, `/packages`, `/calls/follow-ups`, `/calls/{id}/done`, `/dashboard/summary`
  and bulk rows treat anything else as missing (404 / left out). Unassigned influencers reach executives only
  through `/pool`.
- **Unassigned Pool**: `GET /pool` = influencers with `assigned_to = null`, same params as `/influencers`
  (`assigned_to` ignored). Managers/admins get full `Influencer` rows; executives get `PoolInfluencerPreview`
  (id, name, category, profile_pic_url, is_verified, primary_account {platform, handle, profile_url}, platforms[],
  total_reach, city, state, country, stage, created_at) — never phone, email, address, notes, tags, checklist,
  account details or calls — and their `q` matches name / handles / city only. `GET /pool/{id}` is the same shape,
  404 unless unassigned. `GET /pool/filter-options` = filter-options over the pool.
- **Owner changes**: managers/admins set any `assigned_to` (PATCH, bulk `assign`). Executives can't PATCH or bulk
  `assign` owners (403); on `POST /influencers` they may set themselves or null (null = straight into the pool).
- **Claim** `POST /influencers/{id}/claim` (any role): atomic — succeeds only while unassigned (or already mine,
  idempotent 200); else `409 already_claimed` ("Already claimed by a teammate"). Returns the full influencer,
  sets owner = me, writes a `claimed` activity. Claim limit (below) → `409 claim_limit_reached`.
- **Release** `POST /influencers/{id}/release {reason}`: executives their own only (others are 404), managers and
  admins anyone's. Reason required (`422 reason_required`); already unassigned → `409 not_assigned`. 204; writes
  `released {from, reason}`. Managers' owner menu uses this too (no "unassign" without a reason in the UI).
- **Handle conflicts**: `GET /influencers/check-handle?platform=&handle=` → `{available, influencer_id, conflict}`
  with `conflict` = `exists` (visible to you) | `in_pool` (unassigned) | `assigned_to_other` (an executive's teammate
  owns it; `influencer_id` is null so nothing leaks). `POST /influencers` and `…/accounts` → 409 `handle_taken` /
  `in_pool` / `assigned_to_other`. The UI offers "Claim it" for `in_pool`.
- **Pool guards** `GET/PATCH /settings/pool` (admin, else 403) `{claim_limit, auto_release_days}`, both null (off)
  by default; claim_limit 1–500, auto_release_days 1–90. Claim limit: an executive may own at most N influencers
  in `data_gathered`; claiming one more `data_gathered` influencer → 409 (other stages aren't limited, nor are
  managers/admins). Auto-release: see Backend notes. `GET /pool/expiring` = my claims the job will release by
  tomorrow (IST) `{influencer: InfluencerSummary, claimed_at, release_at}[]` — shown in notifications.
- Embedded `InfluencerSummary` (calls, packages, activity, notifications) = `{id, name, primary_account
  {platform, handle, profile_url} | null, profile_pic_url, phone, stage, assigned_to}`. Pipeline cards carry
  `primary_account`, `total_reach` and `category`; `days_in_stage` = calendar days since the last move into the stage.
- `GET /dashboard/summary` kpis add `pool` (unassigned count, everyone) and `claimed_this_week` (claims since Monday
  00:00 IST; null for executives). For executives every other figure covers only their own influencers.
- CSV import: `POST /imports/csv/presign {filename}` → `{upload_url, key}`; client PUTs the file to `upload_url`;
  `POST /imports/csv {key, mapping, fetch_profiles, on_duplicate: skip|update}` → job. Columns: name (required),
  category, phone, email, city, state, country, tags, notes and one handle column per platform (at least one
  mapped; each row needs ≥1 handle). Job result `{total_rows, created, updated, duplicates, failed, errors[{row,
  handle, message}], profiles {synced, failed} | null}`. `row` = 1-based file line (header = line 1). Rows are
  validated with the same rules as the forms (`src/lib/csv-import.ts`); unknown/missing category → "Other"; a row
  repeating an account from earlier in the file is a duplicate; a row with any account already in the CRM is that
  creator: `skip` counts it as a duplicate, `update` overwrites mapped non-empty fields, merges tags and adds its
  new accounts. `fetch_profiles` syncs the lookup accounts afterwards. Client limits: 2 MB, 5,000 rows.
  Import/presign are manager/admin only. The preview flags rows matching existing creators (duplicates check).
- Export CSV columns: name, category, total_reach, phone, email, city, state, country, stage, assigned_to, tags,
  created_at, then one column per platform (handles joined with "; ").
- `GET /calls/follow-ups` accepts `mine=true`: only calls I made or on influencers I own (also used for the
  dashboard's "my follow-ups"). Executives only see their own influencers anyway, so only managers/admins get the
  toggle.
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
- **Connect-link expiry**: a `link_sent` account whose `connect_link_expires_at` has passed becomes `expired`
  (`expireConnectLinks` in `src/mocks/social.ts`, also run before every mock request).
- **Duplicate detection** runs server-side over the whole CRM (`src/mocks/duplicates.ts` is the reference);
  dismissed pair ids are stored so a pair never reappears.

## Screens
1. **App shell**: sidebar (Dashboard, Influencers, Unassigned Pool w/ count, Possible duplicates w/ count
   (manager/admin), Pipeline, Calls & Follow-ups w/ due-today badge, Packages, Settings admin-only); top bar: global
   search, "+ Add Influencer", notifications, user menu w/ theme toggle.
2. **Dashboard**: KPIs (total, pool, contacted this week, onboarded this month, packages in transit, follow-ups today),
   pipeline funnel (click → filtered list), by-category + top-cities bars, my follow-ups, activity feed.
3. **Influencers list**: header w/ count + Import CSV / Export / + Add; search; Saved views; filters
   Category/Platform/Country/State/City/Stage/Assigned/Total reach; chips; table; bulk bar; pagination. Columns:
   name+avatar+verified, category, primary account, platforms, total reach, primary followers, phone, email, city,
   state, country, stage, assigned to, sync (primary), last synced (primary). Filters in URL.
4. **Influencer detail**: header (avatar, name, primary account, category, platforms, total reach, location, Stage ▾,
   Owner ▾, Log call, Create package, ⋯) + stage stepper. Left: **Social accounts** — a list of accounts (tabs), each
   with its platform's stat cards (`PLATFORM_META` labels), method + status (Sync now / Send connect link (copy or
   email) / Edit stats), growth chart where snapshots exist, recent posts (Instagram, YouTube); + Add account (with
   duplicate check). Right tabs: Overview, Calls, Packages, Activity.
5. **Add / Import modal**: Look up a profile (platform + username → job → preview with the platform's stats, "Also
   found" linked accounts → details → duplicate check → save); Manual (several accounts, personal-profile toggle,
   audience for manual accounts); CSV (per-platform columns, preview w/ errors + "Possible duplicate" column).
   "Possible same creator" warning: Add account to existing / Create anyway; teammates' matches stay anonymous.
6. **Pipeline kanban** · 7. **Calls & Follow-ups** · 8. **Packages** (as before; handles show as primary account).
9. **Settings (admin)**: Instagram integration status + sync frequency, team & roles, categories, pool guards.
10. **Unassigned Pool**: list filters (no owner filter) in the URL; row → preview drawer (not the profile).
   Executives: preview fields + Claim / bulk Claim. Managers/admins: full details + Assign to… / bulk assign.
   An executive opening an unassigned influencer's URL gets the preview with Claim; another's influencer is 404.
11. **Possible duplicates** (manager/admin): pairs side by side with confidence + reasons; Merge (pick survivor,
   per-field values, owner if different; summary of combined accounts and resulting stage) or Dismiss.

**UX**: light/dark; desktop-first, usable at 1024px; skeletons + empty + error states everywhere;
numbers 12.4K / 1.2M; relative times; toasts; "/" focuses search; same stage colors everywhere.

## Phases (all complete)
1. Scaffold, theme, app shell, routing, types, API client, MSW mocks + fixtures. 2. Influencers list.
3. Influencer detail. 4. Add / Import modal. 5. Pipeline, Calls, Packages. 6. Dashboard, Settings, polish.
Then: Unassigned Pool; multi-platform accounts, Facebook, connect links, duplicate detection and merge.

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
- Dates display in Asia/Kolkata (`src/lib/format.ts`); datetime inputs are read as IST.
- Charts follow the dataviz rules: one validated series colour (`--chart-series-1`), thin marks, a table view.
