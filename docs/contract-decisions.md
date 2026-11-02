# Contract decisions

The backend must match these. Source of truth for types: `src/types/index.ts`.
Record any new API decision here. Dates and documents: `dates-and-documents.md`.

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
- Admin override (a move outside the standard transitions) skips the call/package/agreement requirements but needs a
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
  `onboarded_without_agreement` = assigned influencers in onboarded / package_sent / delivered with no current agreement.
- CSV import: `POST /imports/csv/presign {filename}` → `{upload_url, key}`; client PUTs the file to `upload_url`;
  `POST /imports/csv {key, mapping, fetch_profiles, on_duplicate: skip|update}` → job. Columns: name (required),
  category, phone, email, city, state, country, tags, notes, created_at (optional "added on" date, see Dates) and one
  handle column per platform (at least one mapped; each row needs ≥1 handle). Job result `{total_rows, created, updated, duplicates, failed, errors[{row,
  handle, message}], profiles {synced, failed} | null}`. `row` = 1-based file line (header = line 1). Rows are
  validated with the same rules as the forms (`src/lib/csv-import.ts`); unknown/missing category → "Other"; a row
  repeating an account from earlier in the file is a duplicate; a row with any account already in the CRM is that
  creator: `skip` counts it as a duplicate, `update` overwrites mapped non-empty fields, merges tags and adds its
  new accounts (never its `created_at`). `fetch_profiles` syncs the lookup accounts afterwards. Client limits: 2 MB, 5,000 rows.
  Import/presign are manager/admin only. The preview flags rows matching existing creators (duplicates check).
- Export CSV columns: name, category, total_reach, phone, email, city, state, country, stage, assigned_to, tags,
  created_at (dd/MM/yyyy), then one column per platform (handles joined with "; ").
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
