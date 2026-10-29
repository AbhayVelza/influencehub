// Domain types. These mirror the backend data model exactly — keep them in sync.

export type Stage =
  | 'data_gathered'
  | 'contacted'
  | 'onboarded'
  | 'package_sent'
  | 'delivered'
  | 'on_hold'
  | 'rejected'

export type CallOutcome = 'interested' | 'not_interested' | 'call_back' | 'no_answer' | 'wrong_number'

export type PackageStatus = 'preparing' | 'sent' | 'in_transit' | 'delivered' | 'returned'

export type AccountType = 'business' | 'creator' | 'personal' | 'unknown'

export type Platform = 'instagram' | 'youtube' | 'tiktok' | 'facebook' | 'threads' | 'pinterest' | 'linkedin' | 'snapchat'

/**
 * How an account's stats arrive. lookup: we fetch public data (Instagram, YouTube, Threads, Facebook Pages).
 * connect: the creator authorises us via a connect link (TikTok, Pinterest). manual: typed in (LinkedIn,
 * Snapchat, and personal Instagram / Facebook profiles).
 */
export type SyncMethod = 'lookup' | 'connect' | 'manual'

/** Connect-method accounts only. `expired` = a link was sent and lapsed unused. */
export type ConnectStatus = 'not_connected' | 'link_sent' | 'connected' | 'expired'

export type SyncStatus = 'synced' | 'pending' | 'not_synced' | 'error'

export type Role = 'admin' | 'manager' | 'executive'

export type CategoryName =
  | 'Fashion'
  | 'Beauty'
  | 'Food'
  | 'Tech'
  | 'Travel'
  | 'Fitness'
  | 'Lifestyle'
  | 'Gaming'
  | 'Finance'
  | 'Parenting'
  | 'Other'

/** ISO-8601 timestamp (UTC). Displayed in Asia/Kolkata. */
export type ISODateString = string

export interface Address {
  line1: string
  line2: string | null
  city: string
  state: string
  postal_code: string
  country: string
}

export interface OnboardingChecklist {
  called: boolean
  terms_agreed: boolean
  address_collected: boolean
  ig_connected: boolean
}

// Per-platform stats. Every value is null until synced / entered.
export interface PlatformMetrics {
  instagram: {
    followers: number | null
    following: number | null
    posts: number | null
    /** Percentage, e.g. 3.4 means 3.4%. */
    engagement_rate: number | null
    avg_likes: number | null
    avg_comments: number | null
    account_type: AccountType | null
  }
  youtube: {
    subscribers: number | null
    total_views: number | null
    video_count: number | null
    /** Average views over the last 10 videos. */
    avg_views_recent: number | null
    /** ISO 3166-1 alpha-2, e.g. "IN". */
    channel_country: string | null
  }
  tiktok: { followers: number | null; following: number | null; total_likes: number | null; video_count: number | null }
  facebook: { page_followers: number | null; page_likes: number | null; page_category: string | null }
  threads: { followers: number | null; avg_likes_recent: number | null; avg_replies_recent: number | null }
  pinterest: { followers: number | null; monthly_views: number | null; pin_count: number | null; board_count: number | null }
  linkedin: { followers: number | null; connections: number | null }
  snapchat: { subscribers: number | null }
}

interface SocialAccountBase {
  id: string
  influencer_id: string
  /** Lowercase, no leading @. Unique per platform across the CRM. */
  handle: string
  profile_url: string
  /** Exactly one account per influencer is primary (shown first, used for avatar and "Primary account"). */
  is_primary: boolean
  sync_method: SyncMethod
  /** manual accounts are always `not_synced`; connect accounts sync once connected. */
  sync_status: SyncStatus
  last_synced_at: ISODateString | null
  /** Connect-method accounts only; null otherwise. */
  connect_status: ConnectStatus | null
  connect_link_expires_at: ISODateString | null
  display_name: string | null
  profile_pic_url: string | null
  bio: string | null
  /** Links from the profile (link in bio etc.), used for cross-platform matching. */
  links: string[]
  is_verified: boolean
  created_at: ISODateString
}

export type SocialAccount = { [P in Platform]: SocialAccountBase & { platform: P; metrics: PlatformMetrics[P] } }[Platform]

/** Enough to show and link an account: "@riyastyle on Instagram". */
export interface AccountRef {
  platform: Platform
  handle: string
  profile_url: string
}

export interface Influencer {
  id: string
  name: string
  category: string
  /** E.164, default country code +91. */
  phone: string | null
  email: string | null
  address: Address | null
  city: string | null
  state: string | null
  country: string | null
  /** The primary account's picture. */
  profile_pic_url: string | null
  /** True when any account is verified. */
  is_verified: boolean
  /** Primary first. At least one. */
  accounts: SocialAccount[]
  /** Sum of each account's audience (followers / subscribers / page followers); null when none is known. */
  total_reach: number | null
  stage: Stage
  /** User id. */
  assigned_to: string | null
  tags: string[]
  notes: string | null
  onboarding_checklist: OnboardingChecklist
  created_at: ISODateString
  updated_at: ISODateString
}

export interface CallLog {
  id: string
  influencer_id: string
  /** User id. */
  called_by: string
  outcome: CallOutcome
  notes: string | null
  follow_up_date: ISODateString | null
  follow_up_done: boolean
  created_at: ISODateString
}

export interface PackageItem {
  name: string
  qty: number
}

export interface Package {
  id: string
  influencer_id: string
  items: PackageItem[]
  address: Address
  courier: string | null
  tracking_number: string | null
  status: PackageStatus
  sent_at: ISODateString | null
  delivered_at: ISODateString | null
}

export type ActivityType =
  | 'created'
  | 'updated'
  | 'stage_changed'
  | 'assigned'
  | 'call_logged'
  | 'package_created'
  | 'package_updated'
  /** Payload `{platform, handle, audience}`; actor null (sync job). */
  | 'account_synced'
  /** Payload `{platform, handle}`. */
  | 'account_added'
  /** Payload `{platform, handle, emailed_to}`. */
  | 'connect_link_sent'
  /** On the surviving record. Payload `{merged_id, merged_name}`. */
  | 'merged'
  /** Taken from the Unassigned Pool. Payload `{}`; the actor is the new owner. */
  | 'claimed'
  /** Returned to the pool. Payload `{from, reason, auto?}`; `auto: true` (actor null) for auto-release. */
  | 'released'

export interface Activity {
  id: string
  influencer_id: string
  /** User id, or null for system actions. */
  actor: string | null
  type: ActivityType
  payload: Record<string, unknown>
  created_at: ISODateString
}

/** One account's audience (followers / subscribers / page followers) at a point in time. */
export interface AccountSnapshot {
  audience: number
  captured_at: ISODateString
}

export interface MediaItem {
  thumbnail: string
  permalink: string
  likes: number
  comments: number
  posted_at: ISODateString
}

export interface User {
  id: string
  name: string
  email: string
  role: Role
  is_active: boolean
  created_at: ISODateString
}

export interface Category {
  id: string
  name: string
  is_active: boolean
  /** Influencers currently in this category (a category in use can't be deleted). */
  influencer_count: number
}

// ---------------------------------------------------------------------------
// API envelopes

export interface Paginated<T> {
  items: T[]
  total: number
  page: number
  page_size: number
}

export interface ApiErrorBody {
  error: { code: string; message: string }
}

/** Compact influencer reference embedded in call / package / activity rows. */
export interface InfluencerSummary {
  id: string
  name: string
  primary_account: AccountRef | null
  profile_pic_url: string | null
  phone: string | null
  stage: Stage
  assigned_to: string | null
}

export interface CallLogWithInfluencer extends CallLog {
  influencer: InfluencerSummary
}

export interface PackageWithInfluencer extends Package {
  influencer: InfluencerSummary
}

export interface ActivityWithInfluencer extends Activity {
  influencer: InfluencerSummary
}

// ---------------------------------------------------------------------------
// Request params / bodies

export type InfluencerSortKey = 'name' | 'total_reach' | 'city' | 'stage' | 'created_at' | 'updated_at'

/** `followers` ascending, `-followers` descending. */
export type InfluencerSort = InfluencerSortKey | `-${InfluencerSortKey}`

export interface InfluencerFilters {
  q?: string
  category?: string[]
  country?: string[]
  state?: string[]
  city?: string[]
  stage?: Stage[]
  assigned_to?: string[]
  /** Has an account on any of these platforms. */
  platform?: Platform[]
  /** Total reach range. */
  reach_min?: number
  reach_max?: number
}

export interface InfluencerListParams extends InfluencerFilters {
  sort?: InfluencerSort
  page?: number
  page_size?: number
}

export interface FilterOption {
  value: string
  label: string
  count: number
}

export interface FilterOptions {
  categories: FilterOption[]
  countries: FilterOption[]
  /** Narrowed by the `country` param. */
  states: FilterOption[]
  /** Narrowed by the `country` and `state` params. */
  cities: FilterOption[]
  stages: FilterOption[]
  assigned_to: FilterOption[]
  platforms: FilterOption[]
}

/** A new account. Lookup data (from POST /lookup) can be passed through so it's saved as synced. */
export interface AccountCreate {
  platform: Platform
  handle: string
  /** Only `manual`, to keep a lookup platform's personal profile out of syncing. Defaults by platform. */
  sync_method?: 'manual'
  metrics?: Partial<PlatformMetrics[Platform]>
  display_name?: string | null
  profile_pic_url?: string | null
  bio?: string | null
  links?: string[]
  is_verified?: boolean
}

export type InfluencerCreate = Pick<Influencer, 'name' | 'category'> &
  Partial<Pick<Influencer, 'phone' | 'email' | 'address' | 'city' | 'state' | 'country' | 'assigned_to' | 'tags' | 'notes'>> & {
    /** At least one; the first is primary. */
    accounts: AccountCreate[]
  }

export type InfluencerUpdate = Partial<
  Omit<Influencer, 'id' | 'stage' | 'created_at' | 'updated_at' | 'accounts' | 'total_reach' | 'is_verified' | 'profile_pic_url'>
>

/** Manual accounts only: type the stats in. */
export interface AccountUpdate {
  metrics: Partial<PlatformMetrics[Platform]>
}

export interface ConnectLinkRequest {
  /** Also email the link to the influencer's email address. */
  send_email?: boolean
}

export interface ConnectLinkResponse {
  url: string
  expires_at: ISODateString
  /** The address it was emailed to, when `send_email` was set. */
  emailed_to: string | null
}

/**
 * Why a handle can't be added. `exists`: in the CRM and visible to you. `in_pool`: unassigned (claimable).
 * `assigned_to_other`: owned by a teammate an executive can't see (no id is returned).
 */
export type HandleConflict = 'exists' | 'in_pool' | 'assigned_to_other'

export interface CheckHandleResponse {
  available: boolean
  /** Null when available, or for `assigned_to_other`. */
  influencer_id: string | null
  conflict: HandleConflict | null
}

export interface StageChangeRequest {
  to: Stage
  /** Required when the move is an admin override (outside the standard transitions). */
  reason?: string
}

/** `delete` requires manager or admin. `claim` takes no value (owner = me). `sync` syncs every syncable account. */
export type BulkAction = 'change_stage' | 'assign' | 'sync' | 'delete' | 'claim'

export interface BulkRequest {
  ids: string[]
  action: BulkAction
  value?: string | null
}

export interface BulkResult {
  succeeded: string[]
  failed: { id: string; code: string; message: string }[]
  /** Present for async actions (sync). */
  job_id: string | null
}

export interface ReleaseRequest {
  /** Required; recorded in the activity log. */
  reason: string
}

export interface CallLogCreate {
  outcome: CallOutcome
  notes?: string | null
  follow_up_date?: ISODateString | null
}

export type FollowUpBucket = 'today' | 'overdue' | 'upcoming' | 'history'

export interface PackageListParams {
  q?: string
  status?: PackageStatus[]
  courier?: string[]
  influencer_id?: string
  /** Sent on or after this IST date (yyyy-MM-dd). */
  sent_from?: string
  /** Sent on or before this IST date (yyyy-MM-dd). */
  sent_to?: string
  page?: number
  page_size?: number
}

export type PackageCreate = Pick<Package, 'influencer_id' | 'items' | 'address'> &
  Partial<Pick<Package, 'courier' | 'tracking_number' | 'status'>>

export type PackageUpdate = Partial<Omit<Package, 'id' | 'influencer_id'>>

export interface PipelineCard {
  id: string
  name: string
  primary_account: AccountRef | null
  profile_pic_url: string | null
  total_reach: number | null
  category: string
  assigned_to: string | null
  stage: Stage
  days_in_stage: number
}

export interface PipelineColumn {
  stage: Stage
  count: number
  items: PipelineCard[]
}

export interface PipelineResponse {
  columns: PipelineColumn[]
}

export interface DashboardSummary {
  kpis: {
    total: number
    /** Influencers with no owner. */
    pool: number
    /** Claims since Monday 00:00 IST. Null for executives. */
    claimed_this_week: number | null
    contacted_this_week: number
    onboarded_this_month: number
    packages_in_transit: number
    follow_ups_today: number
  }
  funnel: { stage: Stage; count: number }[]
  by_category: { category: string; count: number }[]
  top_cities: { city: string; count: number }[]
  my_follow_ups: CallLogWithInfluencer[]
  recent_activity: ActivityWithInfluencer[]
}

// ---------------------------------------------------------------------------
// Async jobs

export type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed'

export interface Job<TResult = unknown> {
  id: string
  status: JobStatus
  /** 0–100 */
  progress: number
  result: TResult | null
  error: { code: string; message: string } | null
}

export interface JobRef {
  job_id: string
}

/** Result of POST /lookup once the job succeeds. */
export type LookupProfile = {
  [P in Platform]: {
    platform: P
    handle: string
    profile_url: string
    display_name: string
    bio: string | null
    links: string[]
    profile_pic_url: string | null
    is_verified: boolean
    metrics: PlatformMetrics[P]
    /** Other accounts found in the bio or links, e.g. a YouTube channel. */
    linked_accounts: AccountRef[]
  }
}[Platform]

export interface LookupRequest {
  /** A lookup-method platform: instagram, youtube, threads or facebook (public Pages). */
  platform: Platform
  username: string
}

/** Failed jobs carry the first three; the 409s come back immediately (see HandleConflict). */
export type LookupErrorCode =
  | 'personal_account'
  | 'not_found'
  | 'rate_limited'
  | 'already_exists'
  | 'in_pool'
  | 'assigned_to_other'

export interface CsvPresignResponse {
  upload_url: string
  key: string
}

/** CSV fields: the details plus one handle column per platform. */
export type CsvImportField =
  | 'name'
  | 'category'
  | 'phone'
  | 'email'
  | 'city'
  | 'state'
  | 'country'
  | 'tags'
  | 'notes'
  | Platform

/** Maps field → CSV column header. */
export type CsvColumnMapping = Partial<Record<CsvImportField, string>>

/** What to do with a row whose handle is already in the CRM. */
export type CsvDuplicatePolicy = 'skip' | 'update'

export interface CsvImportRequest {
  key: string
  mapping: CsvColumnMapping
  /** Sync every lookup-method account after the rows are saved. */
  fetch_profiles: boolean
  on_duplicate: CsvDuplicatePolicy
}

export interface CsvImportResult {
  total_rows: number
  created: number
  /** Existing influencers updated (on_duplicate = update). */
  updated: number
  /** Rows skipped because the handle already exists (in the CRM or earlier in the file). */
  duplicates: number
  failed: number
  /** Failed rows only. `row` is the 1-based line number in the file (header = 1). `handle` = the row's first handle. */
  errors: { row: number; handle: string | null; message: string }[]
  /** Present when fetch_profiles was requested. */
  profiles: { synced: number; failed: number } | null
}

export interface ExportRequest {
  filters?: InfluencerFilters
  ids?: string[]
}

export interface ExportResult {
  download_url: string
  row_count: number
}

export interface SyncResult {
  account_id: string
  audience: number | null
}

/** Result of the job started by a bulk `sync`. Counts accounts; failures carry the influencer id. */
export interface BulkSyncResult {
  synced: number
  failed: { id: string; message: string }[]
}

// ---------------------------------------------------------------------------
// Duplicates & merge

export type MatchConfidence = 'high' | 'medium' | 'low'

export interface DuplicateCheckRequest {
  name?: string | null
  email?: string | null
  phone?: string | null
  /** For the "similar name + same city" signal. */
  city?: string | null
  /** bio / links (e.g. from a lookup) let the server match handles mentioned there. */
  accounts: { platform: Platform; handle: string; bio?: string | null; links?: string[] }[]
  /** Adding an account to an existing influencer: don't match it with itself. */
  exclude_id?: string
}

/**
 * `full`: you can see it. `pool`: unassigned. `restricted`: an executive's teammate owns it, so nothing about it
 * is returned (id, summary and reasons are empty).
 */
export interface DuplicateMatch {
  influencer_id: string | null
  confidence: MatchConfidence
  reasons: string[]
  access: 'full' | 'pool' | 'restricted'
  influencer: {
    id: string
    name: string
    profile_pic_url: string | null
    primary_account: AccountRef | null
    city: string | null
    assigned_to: string | null
  } | null
}

export interface DuplicateCheckResponse {
  /** Strongest first. */
  matches: DuplicateMatch[]
}

/** An open pair for review (GET /duplicates, manager/admin). `id` is stable for the pair. */
export interface DuplicatePair {
  id: string
  confidence: MatchConfidence
  reasons: string[]
  influencers: [Influencer, Influencer]
}

/** Fields the merge dialog lets you pick per record. Everything else is combined (see CLAUDE.md). */
export type MergeField = 'name' | 'category' | 'phone' | 'email' | 'address' | 'location' | 'notes' | 'assigned_to'

export interface MergeRequest {
  keep_id: string
  merge_id: string
  /** Which record each value comes from; omitted fields keep the surviving record's value. */
  field_choices: Partial<Record<MergeField, 'keep' | 'merge'>>
}

// ---------------------------------------------------------------------------
// Instagram integration settings (admin only)

export type TokenStatus = 'valid' | 'expiring' | 'expired'

export type SyncIntervalHours = 3 | 6 | 12 | 24

export type SyncRunStatus = 'running' | 'succeeded' | 'partial' | 'failed'

export interface SyncRun {
  started_at: ISODateString
  /** Null while the run is in progress. */
  finished_at: ISODateString | null
  status: SyncRunStatus
  synced: number
  failed: number
}

export interface InstagramSettings {
  connected: boolean
  /** Null when not connected. */
  business_account: { username: string; ig_user_id: string } | null
  token_status: TokenStatus
  token_expires_at: ISODateString | null
  sync_interval_hours: SyncIntervalHours
  /** Share of the Instagram API rate limit used, 0–100. */
  api_usage_pct: number
  /** Most recent first, at most 20. */
  last_runs: SyncRun[]
}

export interface InstagramSettingsUpdate {
  sync_interval_hours: SyncIntervalHours
}

// ---------------------------------------------------------------------------
// Unassigned Pool

/** What an executive sees of an unassigned influencer before claiming it (no contact, address, notes or calls). */
export type PoolInfluencerPreview = Pick<
  Influencer,
  'id' | 'name' | 'category' | 'profile_pic_url' | 'is_verified' | 'total_reach' | 'city' | 'state' | 'country' | 'stage' | 'created_at'
> & {
  primary_account: AccountRef | null
  platforms: Platform[]
}

/** GET /pool and /pool/{id}: full influencers for managers and admins, previews for executives. */
export type PoolItem = Influencer | PoolInfluencerPreview

export interface PoolSettings {
  /** Most uncontacted (data_gathered) influencers one executive may hold; null = no limit. */
  claim_limit: number | null
  /** Claimed influencers with no call logged within this many days return to the pool; null = off. */
  auto_release_days: number | null
}

/** One of my claims that the auto-release job will return to the pool by tomorrow (IST). */
export interface ExpiringClaim {
  influencer: InfluencerSummary
  claimed_at: ISODateString
  release_at: ISODateString
}

// ---------------------------------------------------------------------------
// Team, categories, saved views

export interface TeamMemberCreate {
  email: string
  role: Role
  /** Optional; defaults to a name derived from the email. */
  name?: string
}

export type TeamMemberUpdate = Partial<Pick<User, 'name' | 'role' | 'is_active'>>

export interface CategoryCreate {
  name: string
}

export type CategoryUpdate = Partial<Pick<Category, 'name' | 'is_active'>>

export interface SavedView {
  id: string
  name: string
  filters: InfluencerFilters
  sort: InfluencerSort | null
  created_by: string
  created_at: ISODateString
}

export type SavedViewCreate = Pick<SavedView, 'name' | 'filters'> & { sort?: InfluencerSort | null }
