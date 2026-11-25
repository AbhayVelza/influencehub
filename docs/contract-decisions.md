# Contract decisions

The backend must match these. Source of truth for types: `src/types/index.ts`.
Record any new API decision here. Dates and documents: `dates-and-documents.md`.

- Multi-value query params are repeated keys: `?stage=a&stage=b`.
- Sorting: `sort=field` ascending, `sort=-field` descending (nulls last). Sort keys: name, total_reach, followers (largest audience among the accounts on `platform[]`, any account when none; the Onboarded tabs' audience column),
  instagram_followers (the Instagram account's followers: the primary one if it's on Instagram, else the largest), city, stage,
  created_at, updated_at.
- Job statuses: `queued | running | succeeded | failed`; `progress` 0–100; `error {code, message}` when failed.
- **Accounts**: `total_reach` = sum of each account's audience metric (followers / subscribers / page_followers),
  null when none is known; `platform[]` filters influencers with an account on any of those platforms;
  `reach_min/max` filter on total_reach; `followers_min/max` filter on one account's audience: some account on a selected `platform[]` (any account when none is selected) within the range, unknown audiences never match (the Onboarded tabs' Followers filter, which is that platform's followers / subscribers / page followers). Combinable (AND) with everything else, and part of `filter-options`' filters like `reach_min/max`; `filter-options` adds `platforms` with counts (faceted, see Filter options); `q` also matches every
  account handle. Handles are normalised everywhere (forms, lookup, CSV, API): the platform's profile URL and a
  leading `@` are stripped, then lowercased (YouTube channel ids `UC…` keep their case; Facebook
  `/people/<name>/<id>` and `profile.php?id=<id>` links become the numeric id). No format or length rule:
  any non-empty text is a handle (decided 24/11/2026: real sheets hold short links and legacy names). `(platform, handle)` is unique across the CRM.
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
  **Only signal: the same Instagram handle** (normalised) → high, reason "Same Instagram account @handle". Email,
  phone, bio links, other platforms' handles and names are not compared (decided 18/11/2026); the request still
  accepts those fields so callers don't change. Same rule for `GET /duplicates` pairs.
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
- Logging a call (`POST /influencers/{id}/calls`) marks that influencer's open follow-ups as done, and triggers automated stage transitions based on outcome: `not_interested` moves to `rejected`; `no_answer` and `wrong_number` move to `on_hold`; `call_back` schedules a follow-up; `interested` enables moving to `contacted`. The automatic moves are standard moves only; the 201 body is the call plus `stage_change: {to, moved, message} | null` so the UI reports a refused move instead of claiming it.
- One call per time slot per executive (updated 14/11/2026): a `follow_up_date` on the same date and minute as
  another open follow-up for the same executive is refused with `409 time_taken` ("Another call is already scheduled for
  dd/MM/yyyy, hh:mm a. Pick a different time."). Different executives can schedule calls at the same time for different
  influencers. Done follow-ups free their slot; the same influencer's own open follow-up doesn't block, since logging
  the call completes it. The Log Call dialog shows the message on the follow-up field and stays open.
- Admin override (a move outside the standard transitions). One rule, `overrideBlockReason` / `getOverrideTargets` in
  `src/lib/stages.ts`, used by the server, the stage menu and the pipeline board. Targets: data_gathered, contacted,
  onboarded, on_hold, rejected only. None once the creator has **ever** been onboarded: Onboarded / Welcome Kit /
  Delivered now, or Rejected / On Hold after that (`ever_onboarded`, derived from the stage history on every read and
  sent on influencers and pipeline cards). None from On Hold while the stage before it is unknown (no record, or not
  loaded yet). Refusals are `422 invalid_transition` with the rule's own message. An override skips the call and
  insights requirements, but an override into Onboarded still needs a current agreement (`422 requirement_missing`;
  the UI uploads the agreement first, then asks for the reason). It needs a `reason`; without one → `422
  reason_required`. Activity payload: `{from, to, reason, override: true}`. (Decided 18/11/2026.)
  Bulk `change_stage` and every automatic move (call outcomes, Welcome Kit status) pass `allowOverride: false`:
  standard moves only, refused with a plain "Can’t move from X to Y".
- `POST /influencers/bulk` actions: `change_stage` (value = stage), `assign` (value = user id or null; manager/admin),
  `pool_assign` (value = an active user's id, else 422; manager/admin, else 403; assigns only rows that are still
  unassigned, checked per row like a claim, so a teammate's claim is never overwritten: per-row `not_in_pool` "No
  longer in the pool"; writes `assigned {from: null, to}`, never auto-released), `claim` (no value; per-row `already_claimed` / `claim_limit_reached`), `sync` (every syncable account; returns
  `job_id`; job result `{synced (accounts), failed[{id (influencer), message}]}`), `delete` (manager/admin).
  Response: `{succeeded[ids], failed[{id, code, message}], job_id|null}`; per-row failures don't fail the request.
  Per-row messages don't include the influencer's name (the UI adds it).
- **Executive scoping** (server-side): executives only ever get influencers they own. Every `/influencers…` and
  `/accounts…` endpoint, `/pipeline`, `/packages`, `/calls/follow-ups`, `/calls/{id}/done`, `/dashboard/summary`
  and bulk rows treat anything else as missing (404 / left out). Unassigned influencers reach executives only
  through `/pool`.
- **Onboarded tabs** (no new endpoint, no stored `onboarded` flag): a platform's tab is `GET /influencers` with
  `stage=onboarded&stage=package_sent&stage=delivered&platform=<p>` plus the user's own filters (including
  `agreement` / `insights`); the counts on `/onboarded` are the same request with `page_size=1` (read `total`), one per
  platform. "Onboarded" means onboarded or later: creators stay on the tabs after moving to Welcome Kit / Delivered
  (changed 05/11/2026; before, only the Onboarded stage counted), with a Stage column; documents aren't required (changed 03/11/2026: creators moved to
  Onboarded without them were missing from the tabs), the docs column shows what's missing. Executive scoping above
  applies unchanged. The backend must keep these filters
  combinable (AND) and accept `page_size=1`.
- **Unassigned Pool**: `GET /pool` = influencers with `assigned_to = null`, same params as `/influencers`
  (`assigned_to` ignored). Managers/admins get full `Influencer` rows; executives get `PoolInfluencerPreview`
  (id, name, category, profile_pic_url, is_verified, primary_account {platform, handle, profile_url}, platforms[],
  total_reach, city, state, country, stage, created_at) — never phone, email, address, notes, tags, checklist,
  account details or calls — and their `q` matches name / handles / city only. `GET /pool/{id}` is the same shape,
  404 unless unassigned. `GET /pool/filter-options` = filter-options over the pool.
- **Bulk assign from the pool** (manager/admin): one or more people. Several share the selected influencers out
  round-robin in list order (one owner each, the shares differ by at most one). The UI sends one bulk `pool_assign`
  per person, so a failed request fails only that person's share. No multi-owner influencers.
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
  `onboarded_without_agreement` = assigned influencers in onboarded / package_sent / delivered with no current agreement.
- CSV import: `POST /imports/csv/presign {filename}` → `{upload_url, key}`; client PUTs the file to `upload_url`;
  `POST /imports/csv {key, mapping, fetch_profiles, on_duplicate: skip|update}` → job. Columns: name (required),
  category, phone, email, city, state, country, tags, notes, created_at (optional "added on" date, see Dates) and one
  handle column per platform (at least one mapped; each row needs ≥1 handle). Job result `{total_rows, created, updated, duplicates, failed, errors[{row,
  handle, message}], profiles {synced, failed} | null}`. `row` = 1-based file line (header = line 1). Rows are
  validated with the same rules as the forms (`src/lib/csv-import.ts`); a missing or unknown category is a row error (no fallback category).
  Placeholder cells (`-`, `—`, `N/A`, `none`, `nil`, `null`) count as empty; rows with no name and no handle (blank or
  section-heading rows) are skipped and left out of `total_rows`; tags split on `;`, `|` or `,`. Influencer text
  fields (name, city, state, country, email, notes, tags) have no length limit; a phone that isn't a number is kept as
  typed. A row
  repeating an account from earlier in the file is a duplicate; a row with any account already in the CRM is that
  creator: `skip` counts it as a duplicate, `update` overwrites mapped non-empty fields, merges tags and adds its
  new accounts (never its `created_at`). `fetch_profiles` turns the rows' accounts on connected platforms (GET /integrations) into lookup accounts and queues them for the background sync (`profiles.queued`); typed-in stats stay until the first sync. Client limits: 2 MB, 5,000 rows.
  Import/presign are manager/admin only. The preview flags rows matching existing creators (duplicates check).
- Export CSV columns: name, category, total_reach, phone, email, city, state, country, stage, assigned_to, tags,
  created_at (dd/MM/yyyy), then one column per platform (handles joined with "; ").
- `GET /calls/follow-ups` accepts `mine=true`: only calls I made or on influencers I own (also used for the
  dashboard's "my follow-ups"). Executives only see their own influencers anyway, so only managers/admins get the
  toggle.
- `GET /packages` accepts `sent_from` / `sent_to` (yyyy-MM-dd, IST calendar day of `sent_at`; unsent packages
  never match a date range).
- `PATCH /packages/{id}` (when the status changes) and `POST /packages` (only when created as `delivered`) keep the stage in step: `delivered` moves an
  influencer in `onboarded` or `package_sent` to `delivered` (from `onboarded` via `package_sent`, the delivered package
  standing in for the courier + tracking requirement); `returned` moves
  `package_sent` back to `onboarded`. Standard transitions, activity reason "Welcome Kit delivered" / "Welcome Kit returned".
  Any other stage is untouched. The UI confirms first. (Changed 05/11/2026: delivered used to move only
  `package_sent`, leaving creators whose package was marked delivered stuck in Onboarded.)
- Notifications have no endpoint of their own: they combine overdue + due-today follow-ups and `GET /pool/expiring`.
- `GET/PATCH /settings/instagram` (admin only, else 403). GET → `{ connected, business_account {username,
  ig_user_id} | null, token_status (valid|expiring|expired), token_expires_at, sync_interval_hours (168: every 7 days, the only option),
  api_usage_pct, last_runs[≤20] {started_at, finished_at|null, status (running|succeeded|partial|failed),
  synced, failed} }`. PATCH accepts `{ sync_interval_hours }` and returns the full object.
- `GET /dashboard/summary`: `top_cities` = top 10 by influencer count; `recent_activity` = latest 20, admins only (others get `[]`);
  `my_follow_ups` = today + overdue, scoped like `mine=true`; "contacted this week" counts moves since Monday 00:00 IST.
  Trends, breakdowns and tables (`src/backend/dashboard.ts`, over what the caller can see): `onboarded_by_week` (moves
  onto Onboarded, last 12 Monday-weeks), `calls_by_day` (last 30 IST days), `by_platform` (creators with an account
  there; zeros dropped), `follower_bands` (total followers: under 10K, 10K–50K, 50K–100K, 100K–500K, 500K+; no
  count = left out), `packages_by_status`, `call_outcomes_30d`, `team` (managers/admins only, else null: per active
  non–Brand-Specialist member, owned now, calls since Monday, moves onto Onboarded this month by them, Welcome Kits
  sent this month to creators they own) and `recently_onboarded` (10 latest moves onto Onboarded, still onboarded or
  later).
- Team: see **Authentication & team** below.
- Categories carry `influencer_count`. `DELETE /categories/{id}` (admin) → 409 `in_use` while any influencer
  uses it (deactivate instead); 204 otherwise. Renaming a category renames it on its influencers. Inactive
  categories stay on existing influencers but aren't offered for new ones.

- **Filter options (dynamic refinement)** `GET /influencers/filter-options` and `GET /pool/filter-options` take the
  list's filters (`q`, `category[]`, `country[]`, `state[]`, `city[]`, `stage[]`, `assigned_to[]`, `platform[]`,
  `reach_min/max`, `followers_min/max`, `agreement`, `insights`; not sort / paging) and return `{categories, countries, states, cities,
  stages, assigned_to, platforms, agreement, insights}`, each `[{value, label, count}]`. Rules (reference:
  `filterOptionsFor` / `compileFilters` in `src/backend`):
  - Filters across facets are ANDed; values inside one facet are ORed.
  - **Faceted count**: `count` = influencers matching every active filter *except that facet's own*, so it is what
    ticking that option would show: the list `total` for `{other filters} + {this facet = option}`. `q` and reach
    narrow every facet. Executive scoping applies; executives' `q` in the pool matches name / handles / city only.
  - **Lists don't shrink**: option lists depend on the hierarchy only (`states` = states of the selected countries,
    `cities` = cities of the selected countries + states; all when none). An option that matches nothing stays in
    with `count: 0` (the UI dims it), so a selection can always be unticked. `stages`, `platforms`, `agreement`,
    `insights` always list every value. Sort: count desc then label; stages / platforms keep their fixed order.
  - Influencers without documents (the pool) count in neither `agreement` nor `insights` option.
  - The Onboarded tabs send their fixed rule (`stage`, `platform`) with the user's filters, so
    their counts are within that tab.
  - The UI refetches on every filter change and keeps showing the last counts, dimmed, until the new ones arrive.
  - **Performance (large datasets)**: compute all nine facets in one scan, not nine queries: for each row note which
    filters it fails; no failure → counts in every facet, exactly one failure → counts in that facet only, more →
    nowhere (`filterOptionsFor`). In a database: one aggregation with facet sub-pipelines (Mongo `$facet`, SQL
    `GROUPING SETS` / `FILTER (WHERE …)`), or per-facet queries run in parallel. Keep denormalised, indexed columns
    on the influencer row (`platforms[]`, `country`, `state`, `city`, `category`, `stage`, `assigned_to`,
    `total_reach`, `has_agreement`, `insights_count`, a lowercase search blob), so no counting joins accounts or
    documents. Cache by (user scope, normalised filters) with a short TTL (~30 s, the UI's `staleTime`) and drop
    the entries on any influencer / account / document / stage write; unfiltered counts can be pre-aggregated and
    kept up to date by those writes. Expect a response in the low hundreds of ms at ~100k influencers.

## Sign-in & team

Server mode (`server/auth.ts`): email + password sign-in, then an HttpOnly session cookie (`ih_session`, 30 days,
SameSite=Lax, Secure over HTTPS). Passwords are hashed with scrypt in `credentials`; sessions are stored hashed in
`sessions`; neither is ever in a team record or an API response. Prototype mode has no sign-in: requests act as the
member picked in "Acting as" (`resolveActingUid`, `src/backend/db.ts`, falls back to an active admin).

- `POST /auth/sign-in {email, password}` → 200 `User` + cookie · 401 `invalid_credentials` "Wrong email or password."
  (same reply for an unknown email) · 403 `inactive` · 429 `too_many_requests` after 5 wrong passwords for an email
  (15 minutes, in memory).
- `GET /auth/session` → the signed-in `User`, or 401. `POST /auth/sign-out` → 204 (deletes the session and cookie).
- `POST /auth/password {current_password, new_password}` → 204, signs you out everywhere else · 422 `wrong_password`
  · 422 `weak_password` (fewer than `MIN_PASSWORD_LENGTH` = 8 characters).
- `POST /auth/set-password {user_id, password}` (admin) → 204, signs that member out everywhere · 403 / 404 / 422.
- **Every other request** needs a session: none → 401 `unauthenticated`; a deactivated member → 403 `inactive`
  (the app shows "No access"; a 401 sends it back to /login).
- **First admin:** `ADMIN_EMAIL` / `ADMIN_PASSWORD` (/ `ADMIN_NAME`) at server start; a new workspace's owner takes
  that email. The password is only set when that admin has none.
- **Roles** come from the team record, never from the request. A request whose changes can't be saved is rolled back
  as a whole and answered `500 server_error`; a request over 30 MB is `413 payload_too_large`.
- `GET /me` → the acting `User`. `GET /team` is readable by every active member; only `POST` / `PATCH` are admin-only.
- **`POST /team`** (admin) `TeamMemberCreate {email, name, role, location?, password}` (password: server mode only).
  Email is trimmed and lowercased. Errors, in order: `422 weak_password` (server), `422 validation_error` (bad email,
  bad role, missing name, location over 80 characters), `409 email_taken`. Success → `201 User` (`id` = `usr_…`).
- **`PATCH /team/{id}`** `{name?, role?, location?, is_active?}` (no other field changes) → 422 `self_change` when you change your own role / deactivate
  yourself, 422 `last_admin` when it would leave no active admin. A deactivated member is refused on their next request (server mode) and can no longer be acted as (prototype).
- **`DELETE /team/{id}`** (admin) → 204. Errors, in order: 404 (unknown or already deleted), 422 `self_change`, 422
  `still_active` (deactivate first), 409 `owns_influencers` ("still owns N influencers. Reassign or release them
  first."). A soft delete: the record gets `deleted_at` and stays in `GET /team` so history (calls, packages,
  activity) still shows the name; the Settings list hides it, `PATCH` answers 404, and its email can be added again.
- **Uploads**: `POST /documents/presign` returns `upload_url` = `/api/v1/files/<key>` (prototype: `"local-file:<key>"`);
  `documentsApi.upload` PUTs the file there (the server checks the key came from a presign, stores it in the `files`
  table) and `POST /influencers/{id}/documents` saves the metadata (`storage_key`). `GET /documents/{id}/download`
  returns `{url}` = the same `/api/v1/files/<key>`, which serves the file. `POST /imports/csv/presign` returns
  `"local-upload:<key>"` (`src/lib/upload-targets.ts`).

## Brand Specialist role (`brand_specialist`)

Read-only access to onboarded creators, enforced by the handlers (not just hidden in the UI):
- `canSee` (`src/backend/domain.ts`) limits a Brand Specialist to creators in Onboarded, Welcome Kit or Delivered;
  anything else is 404, like an executive's unowned influencer.
- The pre-handler in `src/backend/handlers/index.ts` answers 403 to every request outside a GET allowlist: `/me`,
  `/team` (names for "Acting as"), `/categories`, `/dashboard/summary`, `/influencers`, `/influencers/filter-options`,
  `/influencers/{id}` and `/accounts/{id}/snapshots|media`. So no writes, pool, pipeline, calls, Welcome Kits,
  documents, activity, duplicates, saved views, imports or exports.
- `GET /dashboard/summary` keeps `kpis.total`, `kpis.onboarded_this_month`, `by_category` and `top_cities` (all over
  onboarded creators), plus `onboarded_by_week`, `by_platform`, `follower_bands` and `recently_onboarded`; the
  other KPIs are 0 (`claimed_this_week` null), `team` is null and `funnel`, `my_follow_ups`, `recent_activity`,
  `calls_by_day`, `packages_by_status` and `call_outcomes_30d` are empty.
- The influencer records still carry `stage` and `assigned_to`; the UI hides them (the Influencers list and Onboarded
  tabs drop the Stage, Assigned to and Docs columns; the profile shows no stage, owner or onboarding checklist).
- Roles are set through `POST /team` / `PATCH /team/{id}`, which need `team:manage` (admin only).

## Scheduled rules (no scheduler without a server)
- **Auto-release**: when `auto_release_days` = N is set, an influencer whose current ownership came from a claim (its
  latest claimed/assigned/released activity is a `claimed` by the current owner) and has no call logged since
  `claimed_at` is released at `claimed_at + N days`: `assigned_to = null`, activity `released {from, reason: "No call
  logged within N days of claiming", auto: true}` with actor null. Assignments by a manager never auto-release.
  Owners see claims expiring by tomorrow (IST) in the bell (`GET /pool/expiring`). Runs at the start of every request
  (`runAutoRelease` in `src/backend/domain.ts`).
- **Connect-link expiry**: a `link_sent` account whose `connect_link_expires_at` has passed becomes `expired`
  (`expireConnectLinks` in `src/backend/social.ts`, same timing). Connect links aren't issued until a platform API is
  connected.
- **Duplicate detection** runs over the whole workspace (`src/backend/duplicates.ts`); dismissed pair ids are stored
  (`dismissed_duplicates`) so a pair never reappears.

## Email field holds an address or a contact note

`Influencer.email` accepts free text (max 200), so a CSV or form can carry notes like "managed by @iplixmedia"
when a creator has no public address. `normalizeEmailField` (`src/lib/schemas.ts`) lowercases real addresses and keeps
anything else as typed. `EmailValue` shows a mailto link only for a real address. (Duplicate detection no longer compares emails at all;
it matches on the same Instagram handle only.)

## Upgrading the old default categories

When an admin lists categories (`GET /categories`), `upgradeLegacyCategories` (`src/backend/handlers/workspace.ts`)
renames Tech → Tech & Gadgets, Fitness → Fitness & Lifestyle, Gaming → Gaming & Esports (with their influencers),
adds any missing default, and deletes Other / Parenting when unused (deactivates them otherwise). It runs once per
workspace (settings row `migrations`), so it never undoes later admin edits.

## API server and PostgreSQL

- With `VITE_API_SERVER=true` the API is a real server (`server/`): the same handlers as prototype mode, over a working
  copy of the workspace loaded from PostgreSQL at start-up. After each request only the records that changed are
  written, in one transaction: a request is saved completely or not at all.
- Requests are answered one at a time and the server is the only writer, so the checks the handlers make (unique
  handle per platform, claim limits, one current agreement, follow-up slots) hold across the whole team. Run exactly
  one instance. Teammates' changes reach other browsers through the app's normal refetching, not a live push.
- Storage format (changed 19/11/2026): relational tables with primary and foreign keys, checks and indexes
  (`server/schema.sql`; records ↔ rows in `server/relational.ts`). Ids stay the app's ids; `seq` keeps creation order
  (the activity log relies on it; influencers load newest first, as the handlers keep them). Derived values the app
  computes (`platforms`, `has_agreement`, `insights_count`, `ever_onboarded`, `claimed_at`, …) are also written as
  kept columns for SQL use; the app never reads them back. Document files: the `files` table. A database on the old
  jsonb layout is refused at start-up until migrated (`npm run db:migrate`). Details: `server.md`.
- `POST /imports/csv/upload {key, text}` → 204 (manager / admin). Step 2 of a CSV import: the client posts the file's
  text under the key from the presign step. It waits in memory until `POST /imports/csv` reads it (at most 5 pending
  files; a restart drops them, and the import has to be started again). Jobs are in memory too.
- Auto-release and connect-link expiry still run at the start of every request (no scheduler yet).

## Server-side checks and limits (P1 backlog, 19/11/2026)

Rules the forms already applied are now also checked by the handlers, so every caller gets them (tests in `tests/`):

- **Tags** (`cleanTags`, create and PATCH): any number, each trimmed and lower case, any characters, not empty;
  repeats dropped. Otherwise 422 `validation_error`.
- **Calls:** `call_back` needs `follow_up_date`, and any follow-up must be in the future (422 `validation_error`).
- **Welcome Kits:** the address needs line 1, city, state, postal code and country; once the status is past
  `preparing`, courier and tracking number are required (422). PATCH changes only `items`, `address`, `courier`,
  `tracking_number`, `status`, `sent_at`, `delivered_at`; `id` and `influencer_id` in the body are ignored.
- **Documents:** saving the metadata (`POST /influencers/{id}/documents`) needs the file stored first (the API
  server's `PUT /files/…`, or the browser in prototype mode); otherwise 422 `upload_missing`.
- **Pipeline:** each column returns at most `PIPELINE_COLUMN_LIMIT` (200) cards, longest in the stage first; `count`
  is the whole column. Days in stage are calendar days in Asia/Kolkata on the server too.
- **Jobs:** a finished job's outcome is saved for an hour, so `GET /jobs/{id}` still answers after a restart.

## Instagram lookup and sync (Meta Business Discovery, 19/11/2026)

- `GET /integrations` → `{profile_lookup: Platform[]}`: platforms the API server can look up and sync now, in the
  app's platform order (`instagram` when `META_ACCESS_TOKEN` and `META_IG_USER_ID` are set, `youtube` when
  `YOUTUBE_API_KEY` is; `[]` in prototype mode). Screens show "Fetch public profiles" and **Auto-sync** only for
  these; **Auto-sync IG** (bulk bar) while Instagram is one of them.
- `POST /lookup` and `POST /accounts/{id}/sync` fetch through `server/meta.ts`. Errors: `not_found` (no Business or
  Creator account with that handle: personal profiles can't be looked up), `rate_limited`, `not_connected`
  (token expired or missing a permission), `unavailable`. A failed sync never changes the stats, picture, bio or
  `last_synced_at` (every platform; `tests/failed-sync.test.ts`). Sync now: `not_found` and `unavailable` set
  `sync_status: 'error'`; `rate_limited` and `not_connected` leave the status as it was. Background sync: `not_found`
  sets `error` (tried again after the sync interval); `rate_limited` / `unavailable` pause that platform 15 minutes and
  `not_connected` 6 hours, leaving the account queued (`pending`) so it's retried after the pause. An error for a
  handle renamed while the platform answered is dropped.
- Stats kept for Instagram: followers, following, posts, and from the last 12 posts `avg_likes`, `avg_comments`,
  `engagement_rate` = (avg likes + avg comments) / followers × 100 (posts with hidden likes are left out). Also the
  display name, picture, bio and website. `is_verified` and `account_type` aren't available.
- Bulk `sync` on a connected platform queues instead of fetching (`BulkSyncResult.queued`).
- `PATCH /accounts/{id} {sync_method: 'lookup'}` and bulk `auto_sync` switch typed-in (manual) accounts on a
  connected platform to auto-sync and queue them; bulk rows with nothing to switch fail with `nothing_to_switch`.
- Background sync (`server/sync-worker.ts`): one account about every 40 s, paused for 15 min when Meta reports 75% of
  the hourly allowance used or rate-limits; order: queued, never synced, then older than Settings → Instagram's
  interval. Accounts that fail wait one interval. Each hour with work is a row in Settings → Instagram → Recent runs.
- `POST /integrations/sync-all` (admin, `integrations:manage`; 20/11/2026, replaces `POST /settings/instagram/sync-all`,
  which is gone) → `{queued, switched}`: every account on a connected platform switched to auto-sync (typed-in ones;
  their numbers stay until synced) and queued; 409 `not_connected` when no platform is. Shown as **Sync profiles** on
  Influencers and Settings → Instagram.
- Meta's Business Discovery has no email, category or city for other accounts (verified 20/11/2026: `#100
  nonexisting field`). A sync fills the influencer's `email` from an address written in the bio, only when the email
  is empty; category and city stay typed in.

## Facebook Page lookup and sync (Graph API v21.0, 25/11/2026)

- Connected when `FACEBOOK_API_KEY` is set (a token of a separate Meta app, InfluenceHubv2, where Page Public
  Metadata Access is requested; no `META_IG_USER_ID` needed) and the start-up check (`GET /me?fields=id`)
  doesn't reject the token; an outage or rate limit at start-up still connects. The log says `Facebook Pages connected`
  or `Facebook Pages not connected: …`. Lookup, Sync now, bulk sync, Auto-sync, CSV "Fetch public profiles" and Sync
  profiles work as for Instagram (`setProfileSource('facebook', facebookSource)`).
- One call per Page: `GET /{username or numeric id}?fields=id,name,username,about,category,fan_count,followers_count,
  website,picture.type(large){url},verification_status`. Handles are a Page username (letters, numbers, dots, dashes,
  2–50) or a numeric id (5–25 digits); anything else is refused without calling Meta.
- Kept: `page_followers` = `followers_count`, `page_likes` = `fan_count`, `page_category` = `category`; name, about
  (bio), picture, `links` = the http(s) links in `website` (it can hold several), `is_verified` = `verification_status
  === 'blue_verified'`, `linked_accounts` from about + links. The saved handle is the Page's username (lower case), or
  its id when it has none. No recent posts: post data isn't part of Page Public Metadata Access.
- Access: Pages the token's user manages work with `pages_read_engagement`; any other public Page needs the app's
  **Page Public Metadata Access** feature (Meta App Review). Without it Meta answers `#10`/`#200`, or `#100` with no
  subcode naming `pages_read_engagement` / Page Public Metadata Access (seen 25/11/2026), shown as
  `not_connected` ("Meta hasn't approved Page Public Metadata Access…"), and the Facebook sync pauses 6 hours.
- Errors: `#803` and `#100` subcode 33 (missing, restricted or unreadable Page) → `not_found`; `#100` "on node type
  (User)" → `not_found` (a personal profile); `#190` → `not_connected`; Meta rate limits → `rate_limited`.
- Facebook and Instagram are separate Meta apps, each with its own hourly allowance (`X-App-Usage`, tracked per app in
  `server/meta.ts`): the Facebook loop runs every 60 s and pauses while its app is at 75% or more; Instagram's meter in
  Settings → Instagram shows only Instagram's app.

## YouTube lookup and sync (YouTube Data API v3, P3, 20/11/2026)

- Connected when `YOUTUBE_API_KEY` is set and the start-up check (`channels.list part=id forHandle=@youtube`, 1 quota
  unit) doesn't reject the key; a used-up quota or an outage at start-up still connects. The log says
  `YouTube connected` or `YouTube not connected: …`.
- `POST /lookup {platform: 'youtube'}`, Sync now, bulk sync, Auto-sync, CSV "Fetch public profiles" and Sync profiles
  work as for Instagram (each platform has its own profile source: `setProfileSource(platform, source)` in
  `src/backend/social.ts`). Handles are looked up as `@handle` (3–30 letters, numbers, dots, dashes, underscores);
  channel ids (`youtube.com/channel/UC…`, saved as typed) by `id`. Legacy `/c/` and `/user/` links are saved as that
  name and looked up as `@name` (which can miss, or find another channel). Other saved text (short links) is kept but
  can't sync. Lookup still refuses anything else (422), and only `youtube.com/@handle` links are offered as linked
  accounts (`PLATFORM_META.youtube.urlPattern`). Likewise Instagram `/p/`, `/reel/`, `/reels/`, `/stories/`, `/explore/`, `/tv/` and
  `/accounts/` links aren't profiles.
- 3 quota units per channel, never the 100-unit `search`: `channels.list part=snippet,statistics,contentDetails
  forHandle=@handle` → `playlistItems.list part=contentDetails` of the uploads playlist, `maxResults=10` →
  `videos.list part=snippet,statistics` for those ids. A channel with no videos costs 1 unit; an uploads playlist
  YouTube can't find counts as no videos.
- Kept: `subscribers` (null when the channel hides it, so the last known count stays and no snapshot is recorded),
  `total_views`, `video_count`, `avg_views_recent` = mean views of the latest uploads (up to 10; live and upcoming
  streams left out), `channel_country` (2 letters, else null); the title, description (bio), picture (high → medium →
  default), `links` = the channel's own custom URL (`https://www.youtube.com/@…`) when it has one; `linked_accounts` =
  profile links in the description (e.g. Instagram). `is_verified` isn't in the API (false).
- Recent posts = those videos, newest first: `thumbnail` (medium → high → default), `permalink`
  `https://www.youtube.com/watch?v=ID`, `likes` (null when hidden), `comments` (null when turned off), `posted_at`.
  History and posts are stored like Instagram's (below).
- Errors: no channel with that handle → `not_found`; `quotaExceeded` / `dailyLimitExceeded` → `rate_limited` and no
  background sync until midnight Pacific time (YouTube's quota day); `rateLimitExceeded` / 429 → `rate_limited`; a
  bad, expired or restricted key, or the API not enabled (`keyInvalid`, `API_KEY_INVALID`, `accessNotConfigured`,
  `SERVICE_DISABLED`, `API_KEY_*_BLOCKED`, 401) → `not_connected`; anything else → `unavailable`. The key is sent as
  the `key` parameter and never logged.
- Background sync (`server/sync-worker.ts`): its own loop, one channel about every 15 s (~240 an hour), same order
  and same interval as Instagram (Settings → Instagram's sync frequency applies to every platform: one setting). It
  stops for the day once the server has spent 8,000 of the 10,000 daily units (`YOUTUBE_BACKGROUND_UNITS`, counted
  per Pacific day by this process, from 0 after a restart), keeping ~2,000 (~660 channels) for Look up, Sync now and
  CSV fetches. So the background keeps to the interval for up to ~2,600 channel syncs a day: channels × 24 ÷ interval
  hours, e.g. ~2,600 channels at 24 h, ~330 at 3 h; beyond that accounts sync less often than the interval (oldest
  first) instead of using up the quota. 15 min pause after `rate_limited` / `unavailable`,
  6 h after `not_connected`. YouTube runs don't appear in Settings → Instagram → Recent runs, and Meta's usage meter
  doesn't count them.

## Follower history and recent posts (P3, 20/11/2026)

- `GET /accounts/{id}/snapshots` → `Paginated<AccountSnapshot>`, oldest first; `GET /accounts/{id}/media` →
  `Paginated<MediaItem>`, newest first (the order the platform lists them). Both 404 for an account the caller can't
  see; Brand Specialists may read them (onboarded creators only, as before).
- Written by every successful sync (Sync now, `syncAccount`, and the background sync, `server/sync-worker.ts`), after
  the profile is applied: a snapshot of the audience the platform returned (none when it returned no audience) and the
  posts it returned, replacing the previous ones (a platform that returns no posts leaves them). An account added from
  Look up (`AccountCreate` with `metrics`, on `POST /influencers` or `POST /influencers/{id}/accounts`) is saved as
  synced, so its audience becomes the first snapshot and the lookup's posts (`AccountCreate.recent_posts`, cleaned:
  https links only, at most 12, counts or null) its recent posts, written right after the request's save (the rows
  point at the account). Typed-in stats and CSV imports record nothing: their history starts with the first sync.
- **Snapshot retention (settles the open decision):** one snapshot per account per IST calendar day; a later sync the
  same day replaces that day's value (its `captured_at` is the latest sync's time). 365 days kept: older rows are
  dropped whenever a snapshot is recorded. Removing an account (or its influencer) removes its history and posts.
- Instagram posts (`server/meta.ts`, same single Business Discovery call, 12 posts): `permalink`, `posted_at` from
  `timestamp`; `thumbnail` = `thumbnail_url` (videos) or `media_url` (images, carousels: the first image), null when
  Meta gives neither (a video's file is never used); `likes` null when the creator hides likes, `comments` null when
  missing. Links other than https and posts without a permalink or timestamp are left out. Verified against a live
  account 20/11/2026. Image URLs are Meta's signed CDN links: they expire after some days and are refreshed by each sync.
- Stored outside the working copy (`src/backend/platform-data.ts`): PostgreSQL `account_snapshots` / `account_media`
  on the API server, IndexedDB stores `snapshots` / `media` in prototype mode (which has no platform connection, so
  they stay empty). A failure saving them is logged and doesn't fail the sync.

## Live updates (P3, 20/11/2026)

- `GET /events` (API server, `server/live.ts`): a Server-Sent Events stream for a signed-in, active member (the same
  session check as every route; 401 otherwise). Opening it takes one turn for the check only: the open stream never
  holds the request queue. It starts with `retry: 3000` and an event carrying the current number, then sends
  `data: {"v":<n>}` (n increases) after every save that changed data: any request, the background sync (Instagram,
  YouTube, including follower history and posts) and the scheduler (`pg-store.ts` `onDataSaved`). Bursts are joined:
  at most one event per 300 ms after a member's request. Saves made in the background sync's and the scheduler's turns
  (`server/main.ts` marks them) send at most one event per 60 s, the polling rate: each event makes every open screen
  refetch through the one-at-a-time queue, and a sync tick changes one account. A member's event covers a background
  one waiting. Events carry no data and no names, only the number. The number starts at the server's boot time
  (ms), not 0, so a browser reconnecting after a restart or deploy always sees a different number and refreshes.
- A `: ping` comment every 25 s keeps proxies from closing an idle stream; at each one the member's session is checked
  again and the stream is closed for someone signed out, deactivated or given a new password. At most 200 streams, 10
  per member (one per tab); more get 503 `too_many_streams`. Shutdown closes every stream first.
- The app (`src/lib/live.ts`, started by `RequireAuth` while someone is signed in; `resetSession` remounts it, so a
  new identity gets a new stream) refetches the active queries 250 ms after an event (one refetch per burst). It
  waits while one of its own changes is saving (an optimistic update would flicker) and while the tab is hidden
  (refreshes when shown). Only a visible tab holds a stream: hiding the tab closes it, showing it opens it again
  (over HTTP/1.1, as in local dev or `npm run server`, a browser allows about 6 connections per host, so a stream per
  open tab would leave none for API calls). After a reconnect it refreshes if the number changed meanwhile (the
  server's first event).
- Fallback: EventSource reconnects a dropped stream by itself (Vercel's rewrite may cut long streams). A refused or
  broken stream is retried after 5 s, doubling to 5 minutes, and at once when the browser comes back online. The
  existing `staleTime` / `refetchInterval` polling stays as it was, so a missing stream only makes updates slower.
- Your own changes also come back as an event, so the screen you changed refetches once more; accepted (no data in
  events to tell whose change it was).
- Prototype mode has no server: after a save, a tab tells the other tabs of the same browser (BroadcastChannel
  `influencehub-prototype-live`, message `{v}` only), which load the saved workspace again and refresh as above. The
  message is only a hint: each save also writes a new random revision beside the workspace (IndexedDB key `rev`);
  every request first loads the workspace again when the revision isn't the one its working copy came from
  (`local-store.ts` `reload`), and a save checks the revision and writes in one read-write transaction (IndexedDB runs
  those one at a time across tabs). If another tab saved while a request ran, nothing is written: the request is
  undone, the tab loads the newer workspace and answers 409 `changed_elsewhere` ("Another tab changed the data at
  the same moment. Try again."). So no tab ever writes over another's save. "Reset prototype data" in one tab empties
  the others' working copies too.

## Retention, the Rejected tab and data requests (P2, 20/11/2026)

- Rejected influencers are kept forever. `GET /influencers` leaves them out unless a `stage` filter is sent;
  `GET /influencers/rejected` (CRM access, not Brand Specialists) → every visible rejected influencer as
  `{id, name, instagram}`, newest first. The Rejected tab shows that list and downloads it as .xlsx (`src/lib/xlsx.ts`).
- Deleted documents stay restorable 30 days (`DELETED_DOCUMENT_DAYS`), then `purgeDeletedDocuments` drops the record
  and the API server deletes files no document points to (also those of deleted influencers), only when older than a day.
- `GET /influencers/{id}/export` (admins) → JSON of the influencer, calls, Welcome Kits, documents (metadata) and
  activity: a creator's data request. Erasing is Delete influencer (its files go with the next scheduler run).
- The API server's scheduler (`server/scheduler.ts`, every 5 min) runs auto-release, connect-link expiry and the
  purge even when nobody is using the app; the first two still run before every request too (prototype mode has no
  scheduler).

## Saved views (25/11/2026)

- Shared with the whole team; no limit on how many a member saves (any role). `PATCH /saved-views/{id}` {name?, filters?,
  sort?} renames a view and/or replaces its filters and sort (a key left out is kept; an empty name → 422). Executives
  edit and delete only their own views (403); managers and admins any. The Edit button (pencil per view in the Saved
  views menu) offers "Use the current filters and sort", ticked when what is on screen differs from the view.
