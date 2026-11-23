# 1. Data schema

Every record InfluenceHub keeps: its fields, types, whether a field can be empty, allowed values, validation, and
where the value comes from. This is the logical model. The relational tables built from it are in
`03-database-structure.md`, and the links between records are in `02-relationships.md`.

Sources of truth: `src/types/index.ts` (shapes), `src/lib/schemas.ts` (validation), `src/backend/db.ts` (what is
stored and what is derived), `src/lib/documents.ts` (file rules). If this document and the code disagree, the code
wins. Fix this document.

---

## 1.1 Conventions 

| Topic | Rule |
|---|---|
| IDs | Text: `<prefix>_<20 hex chars>` from `nextId()` in `src/backend/db.ts`, for example `inf_3f9a…`. They are never reused. |
| Timestamps | ISO-8601 in UTC (`ISODateString`). They are shown in Asia/Kolkata (IST) as dd/MM/yyyy. |
| Calendar dates | `yyyy-MM-dd` with no time, used by document periods and agreement dates. They are typed and shown as dd/MM/yyyy. |
| Text | Trimmed. An optional text field that is left empty is stored as `null`, never `""`. |
| Counts | Whole numbers ≥ 0, or `null` when unknown. Users can type them as `12000`, `12k` or `1.2m`. |
| Percentages | Stored as numbers: `3.4` means 3.4%. |
| Phone | E.164 (`^\+[1-9]\d{7,14}$`). With no country code, `+91` is added and leading zeros are dropped. |
| Handle | Lowercase, no leading `@`, matching `^[a-z0-9._-]{1,60}$`. Profile URLs are unpacked to the handle. Unique per platform across the whole CRM. |
| Soft delete | A `deleted_at` timestamp keeps the row so history still resolves. It is used for team members and documents. |
| Derived values | Calculated on every read and never edited directly. Each one is marked **derived** below. |

### ID prefixes

| Prefix | Record | Prefix | Record |
|---|---|---|---|
| `usr` | Team member (User) | `call` | Call log |
| `cat` | Category | `pkg` | Package |
| `inf` | Influencer | `act` | Activity |
| `acc` | Social account | `doc` | Document |
| `view` | Saved view | `job` | Background job (memory only) |
| `up` | Pending upload key (memory only) | | |

A duplicate pair's id is built from the two influencer ids. It has no prefix of its own.

---

## 1.2 Enumerations

| Enum | Values | Notes |
|---|---|---|
| `Stage` | `data_gathered`, `contacted`, `onboarded`, `package_sent`, `delivered`, `on_hold`, `rejected` | The first five make up the pipeline in order. `on_hold` and `rejected` are side stages. |
| `CallOutcome` | `interested`, `not_interested`, `call_back`, `no_answer`, `wrong_number` | |
| `PackageStatus` | `preparing`, `sent`, `in_transit`, `delivered`, `returned` | Every status except `preparing` counts as shipped. |
| `Platform` | `instagram`, `youtube`, `tiktok`, `facebook`, `threads`, `pinterest`, `linkedin`, `snapchat` | |
| `SyncMethod` | `lookup`, `connect`, `manual` | `lookup`: Instagram, YouTube, Threads, Facebook Pages. `connect`: TikTok, Pinterest. `manual`: LinkedIn, Snapchat, and personal Instagram or Facebook profiles. |
| `SyncStatus` | `synced`, `pending`, `not_synced`, `error` | A manual account is always `not_synced`. |
| `ConnectStatus` | `not_connected`, `link_sent`, `connected`, `expired` | Used by connect-method accounts only. Otherwise it is null. |
| `AccountType` | `business`, `creator`, `personal`, `unknown` | Instagram only. |
| `Role` | `admin`, `manager`, `executive`, `brand_specialist` | |
| `ActivityType` | `created`, `updated`, `stage_changed`, `assigned`, `call_logged`, `package_created`, `package_updated`, `account_synced`, `account_added`, `connect_link_sent`, `merged`, `claimed`, `released`, `document_uploaded`, `document_deleted` | The payload of each type is listed in §1.9. |
| `DocumentType` | `insights_summary`, `agreement` | |
| `TokenStatus` | `valid`, `expiring`, `expired` | Instagram integration. |
| `SyncIntervalHours` | `168` | Auto-sync every 7 days, the only option (admins refresh on demand with Sync profiles). |
| `SyncRunStatus` | `running`, `succeeded`, `partial`, `failed` | |
| `JobStatus` | `queued`, `running`, `succeeded`, `failed` | Jobs live in memory only. |

---

## 1.3 Team member (`User`), prefix `usr`

| Field | Type | Null? | Rules / source |
|---|---|---|---|
| `id` | text | no | `usr_…` |
| `name` | text | no | Required, 1–100 characters. |
| `email` | text | no | Required and must be a valid email address. Unique among members that aren't deleted (case-insensitive). |
| `role` | `Role` | no | |
| `location` | text | yes | City or office, at most 80 characters. |
| `is_active` | boolean | no | Inactive members can't be acted as and don't appear in owner pickers. |
| `created_at` | timestamp | no | Set by the server. |
| `deleted_at` | timestamp | yes | Set when an admin deletes a member, which is only allowed after the member is deactivated. The row is hidden from the team list but kept so history still shows the name. |

## 1.4 Category, prefix `cat`

| Field | Type | Null? | Rules / source |
|---|---|---|---|
| `id` | text | no | `cat_…` |
| `name` | text | no | 1–50 characters. Unique (case-insensitive). |
| `is_active` | boolean | no | Inactive categories are hidden from pickers but stay on influencers that already use them. |
| `influencer_count` | integer | no | **Derived**: the number of influencers in this category. A category in use can't be deleted. |

Default names: Fashion, Beauty, Food, Tech & Gadgets, Travel, Fitness & Lifestyle, Lifestyle, Gaming & Esports,
Finance, Art & Designs, Marketing & Business. Influencers currently store the category **name**, not its id. In the
relational design this becomes a foreign key (see `03-database-structure.md`).

## 1.5 Influencer, prefix `inf`

| Field | Type | Null? | Rules / source |
|---|---|---|---|
| `id` | text | no | `inf_…` |
| `name` | text | no | 1–100 characters. |
| `category` | text | no | 1–50 characters. Must be an existing category name. |
| `phone` | text | yes | E.164. |
| `email` | text | yes | At most 200 characters. Holds **an address or a contact note** (for example "managed by @agency"), see `normalizeEmailField`. |
| `address` | `Address` | yes | Shipping address (§1.6). It is required before a package can be created. |
| `city`, `state`, `country` | text | yes | Each at most 80 characters. Location used for filters. Separate from the address. |
| `profile_pic_url` | text | yes | **Derived**: the primary account's picture. |
| `is_verified` | boolean | no | **Derived**: true when any account is verified. |
| `accounts` | `SocialAccount[]` | no | At least one. Exactly one is primary and is listed first (§1.7). |
| `total_reach` | integer | yes | **Derived**: the sum of every account's audience. `null` when none is known. Shown as "Total followers". |
| `stage` | `Stage` | no | New records start at `data_gathered`. Changes follow the stage rules (`src/lib/stages.ts`). |
| `assigned_to` | user id | yes | `null` means the influencer is in the **Unassigned Pool**. |
| `tags` | text[] | no | At most 20 tags. Each is 1–30 characters, lowercase, and uses letters, numbers, spaces, `-` or `_`. |
| `notes` | text | yes | At most 2000 characters. |
| `onboarding_checklist` | `OnboardingChecklist` | no | §1.6 |
| `documents` | `DocumentSummary` | yes | **Derived**: `{insights_count, has_agreement}` from documents that aren't deleted. `null` while the influencer is in the pool. |
| `ever_onboarded` | boolean | — | **Derived**: true when the stage is Onboarded or later now, or a `stage_changed` activity ever moved the influencer there. Once true, admin overrides are blocked. |
| `created_at`, `updated_at` | timestamp | no | Set by the server. |

**Also derived and never stored:** `claimed_at`, taken from the latest `claimed` activity whose actor is the current
owner, provided no later `assigned` or `released` activity exists. It drives auto-release and "expiring claims".

## 1.6 Embedded value objects

**`Address`** (on the influencer and copied into each package)

| Field | Type | Null? | Rules |
|---|---|---|---|
| `line1` | text | no | 1–200 characters |
| `line2` | text | yes | At most 200 characters |
| `city`, `state`, `country` | text | no | 1–80 characters each |
| `postal_code` | text | no | 1–12 characters |

**`OnboardingChecklist`** (on the influencer). Every field is a boolean and none can be null.

| Field | Set by |
|---|---|
| `called` | The user, or when a call is logged |
| `agreement_signed` | Ticks automatically when an agreement is uploaded |
| `insights_received` | Ticks automatically when an insights summary is uploaded |
| `address_collected` | The user |
| `ig_connected` | The user or the integration |

**`PackageItem`**: `name` (text, 1–120 characters) and `qty` (integer, 1–999).

## 1.7 Social account, prefix `acc`

Stored inside the influencer today. In the relational design it gets its own table.

| Field | Type | Null? | Rules / source |
|---|---|---|---|
| `id` | text | no | `acc_…` |
| `influencer_id` | influencer id | no | The owner. |
| `platform` | `Platform` | no | |
| `handle` | text | no | Normalised handle. **Unique per (platform, handle)** across the CRM. |
| `profile_url` | text | no | Built from the platform and the handle. |
| `is_primary` | boolean | no | Exactly one per influencer. |
| `sync_method` | `SyncMethod` | no | Comes from the platform's default, or `manual` for personal profiles. |
| `sync_status` | `SyncStatus` | no | |
| `last_synced_at` | timestamp | yes | |
| `connect_status` | `ConnectStatus` | yes | Non-null only when `sync_method = connect`. |
| `connect_link_expires_at` | timestamp | yes | When it lapses unused, the status becomes `expired`. This is checked at the start of each request. |
| `display_name` | text | yes | |
| `profile_pic_url` | text | yes | |
| `bio` | text | yes | |
| `links` | text[] | no | Links from the profile, used for duplicate matching across platforms. |
| `is_verified` | boolean | no | |
| `metrics` | object | no | One shape per platform (below). Each value is `null` until it is synced or typed in. |
| `created_at` | timestamp | no | |

**Metrics per platform.** The **audience** field (bold) is what feeds `total_reach`.

| Platform | Fields |
|---|---|
| instagram | **followers**, following, posts, engagement_rate (%), avg_likes, avg_comments, account_type (`AccountType`) |
| youtube | **subscribers**, total_views, video_count, avg_views_recent (last 10 videos), channel_country (ISO 3166-1 alpha-2) |
| tiktok | **followers**, following, total_likes, video_count |
| facebook | **page_followers**, page_likes, page_category (text) |
| threads | **followers**, avg_likes_recent, avg_replies_recent |
| pinterest | **followers**, monthly_views, pin_count, board_count |
| linkedin | **followers**, connections |
| snapchat | **subscribers** |

**Not stored yet:** `AccountSnapshot` (`audience`, `captured_at`) and `MediaItem` (`thumbnail`, `permalink`, `likes`,
`comments`, `posted_at`). The API returns empty lists for both until a platform API is connected. The relational
design reserves a table for snapshots.

## 1.8 Call log, prefix `call`

| Field | Type | Null? | Rules / source |
|---|---|---|---|
| `id` | text | no | `call_…` |
| `influencer_id` | influencer id | no | |
| `called_by` | user id | no | The acting member. |
| `outcome` | `CallOutcome` | no | |
| `notes` | text | yes | At most 1000 characters. |
| `follow_up_date` | timestamp | yes | Required when the outcome is `call_back`. Must be in the future when the call is logged. |
| `follow_up_done` | boolean | no | Starts as false. Set by `POST /calls/{id}/done`. |
| `created_at` | timestamp | no | |

The stage effect of an outcome is returned in the API response (`stage_change`) and is not stored on the call:
`not_interested` moves the influencer to Rejected, `no_answer` and `wrong_number` move it to On Hold, and
`interested` can move it to Contacted.

## 1.9 Activity, prefix `act`

An append-only log. It is never edited and never deleted, except that a merge re-points it to the surviving record.

| Field | Type | Null? | Rules / source |
|---|---|---|---|
| `id` | text | no | `act_…` |
| `influencer_id` | influencer id | no | |
| `actor` | user id | yes | `null` for system actions (sync job, auto-release). |
| `type` | `ActivityType` | no | |
| `payload` | JSON | no | Its shape depends on the type (below). |
| `created_at` | timestamp | no | The order of creation matters: `seq` keeps it. |

| Type | Payload |
|---|---|
| `stage_changed` | `{from, to, reason?, override?}` |
| `assigned` | `{from, to}` |
| `account_synced` | `{platform, handle, audience}` (actor is null) |
| `account_added` | `{platform, handle}` |
| `connect_link_sent` | `{platform, handle, emailed_to}` |
| `merged` | `{merged_id, merged_name}`, recorded on the surviving record |
| `claimed` | `{}`; the actor is the new owner |
| `released` | `{from, reason, auto?}`; `auto: true` with a null actor for auto-release |
| `document_uploaded`, `document_deleted` | `{document_id, type, title}` |
| `created`, `updated`, `call_logged`, `package_created`, `package_updated` | Details of the change |

## 1.10 Package, prefix `pkg`

| Field | Type | Null? | Rules / source |
|---|---|---|---|
| `id` | text | no | `pkg_…` |
| `influencer_id` | influencer id | no | |
| `items` | `PackageItem[]` | no | At least one item. |
| `address` | `Address` | no | A **copy** of the address at the time the package is created, so it doesn't change if the influencer's address changes later. |
| `courier` | text | yes | At most 60 characters. **Required once shipped.** |
| `tracking_number` | text | yes | At most 60 characters. **Required once shipped.** |
| `status` | `PackageStatus` | no | |
| `sent_at` | timestamp | yes | Set when the package ships. |
| `delivered_at` | timestamp | yes | Set when the package is delivered. |

## 1.11 Document, prefix `doc`

There are two kinds that share a base. They are soft-deleted.

| Field | Type | Null? | Rules / source |
|---|---|---|---|
| `id` | text | no | `doc_…` |
| `influencer_id` | influencer id | no | |
| `type` | `DocumentType` | no | |
| `title` | text | no | 1–120 characters. |
| `file_name` | text | no | Taken from the upload. |
| `content_type` | text | no | PDF, JPG, PNG, DOCX or XLSX (`src/lib/documents.ts`). |
| `size` | integer | no | Bytes. At most **20 MB**. |
| `uploaded_by` | user id | no | |
| `uploaded_at` | timestamp | no | |
| `notes` | text | yes | At most 1000 characters. |
| `storage_key` | text | no | The key in `files`. Stored only and never sent to the UI. |
| `deleted_at` | timestamp | yes | Soft delete. A deleted document is never served. |
| **insights_summary only** | | | |
| `period_start`, `period_end` | date | no | `period_start ≤ period_end`. |
| `platform` | `Platform` | yes | `null` means not tied to one platform. |
| **agreement only** | | | |
| `signed_on` | date | no | |
| `valid_until` | date | yes | `valid_until ≥ signed_on`. |
| `is_current` | boolean | no | A new upload becomes current. Older versions stay as history. At most one current agreement per influencer. |

**The Onboarded rule:** moving from Contacted to Onboarded needs a current agreement **and** at least one insights
summary.

## 1.12 File

| Field | Type | Null? | Rules |
|---|---|---|---|
| `key` | text | no | Primary key. Equals the document's `storage_key`. |
| `content_type` | text | no | |
| `data` | bytes | no | At most 20 MB. Never loaded into server memory with the workspace. |
| `created_at` | timestamp | no | |

## 1.13 Saved view, prefix `view`

| Field | Type | Null? | Rules |
|---|---|---|---|
| `id` | text | no | `view_…` |
| `name` | text | no | |
| `filters` | `InfluencerFilters` (JSON) | no | The same filters as `GET /influencers`. |
| `sort` | `InfluencerSort` | yes | A field name, or `-field` for descending: `name`, `total_reach`, `instagram_followers`, `followers`, `city`, `stage`, `created_at`, `updated_at`. |
| `created_by` | user id | no | Every member sees every view. An executive can delete only their own; managers and admins can delete any. |
| `created_at` | timestamp | no | |

## 1.14 Dismissed duplicate pair

| Field | Type | Rules |
|---|---|---|
| `id` | text | The pair id, built from the two influencer ids. A manager marked the pair as "not the same creator", and it is never suggested again. |

## 1.15 Settings (one row each)

**Pool settings** (`settings/pool`)

| Field | Type | Null? | Rules |
|---|---|---|---|
| `claim_limit` | integer | yes | 1–500. The most `data_gathered` influencers one executive may hold. `null` means no limit. |
| `auto_release_days` | integer | yes | 1–90. A claimed influencer with no call logged within this many days returns to the pool. `null` means off. |

**Instagram integration** (`settings/instagram`)

| Field | Type | Null? | Rules |
|---|---|---|---|
| `connected` | boolean | no | |
| `business_account` | `{username, ig_user_id}` | yes | `null` when not connected. |
| `token_status` | `TokenStatus` | no | |
| `token_expires_at` | timestamp | yes | |
| `sync_interval_hours` | `SyncIntervalHours` | no | Always 168 (7 days). DB check: `= 168`. |
| `api_usage_pct` | number | no | 0–100. |
| `last_runs` | `SyncRun[]` | no | Most recent first, at most 20. Each run has `{started_at, finished_at?, status, synced, failed}`. |

**Migrations** (`settings/migrations`): `categories_upgraded` (boolean) records the one-time data upgrades already
done.

## 1.16 Memory only (not persisted)

| Record | Why it isn't stored |
|---|---|
| `Job` (`job_…`): `status`, `progress`, `result`, `error` | CSV import, export and sync jobs. Lost on restart. Unpolled jobs are dropped after 1 hour. |
| `PendingUpload` | A document between the presign step and the save. |
| A CSV text waiting to be imported | It is read once and then discarded. |

These are candidates for tables later (see the gaps list in `docs/schema/`).

---

## 1.17 What changes in the relational design

| Today (jsonb) | Relational |
|---|---|
| Accounts are embedded in the influencer | A `social_accounts` table with a unique `(platform, handle)` |
| `category` holds the name | A `category_id` foreign key |
| `tags` is an array in the record | A `text[]` column, or an `influencer_tags` table (decided in `03-database-structure.md`) |
| `address` and `onboarding_checklist` are nested objects | Flat columns |
| Package `items` are nested | A `package_items` table |
| Platform metrics differ per platform | Common audience columns plus a typed jsonb `metrics` column |
| Derived fields (`total_reach`, `documents`, `ever_onboarded`, `claimed_at`) | Computed in SQL, a view, or kept columns maintained by the handlers |
| Settings rows | Typed single-row tables |
| No integrity in the database | Primary keys, foreign keys, unique and check constraints, and indexes |
