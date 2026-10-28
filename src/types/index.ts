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

export interface Influencer {
  id: string
  name: string
  category: string
  /** Lowercase, no leading @, unique. */
  instagram_handle: string
  profile_url: string
  /** E.164, default country code +91. */
  phone: string | null
  email: string | null
  address: Address | null
  city: string | null
  state: string | null
  country: string | null
  followers: number | null
  following: number | null
  posts_count: number | null
  /** Percentage, e.g. 3.4 means 3.4%. */
  engagement_rate: number | null
  bio: string | null
  is_verified: boolean
  account_type: AccountType
  profile_pic_url: string | null
  ig_sync_status: SyncStatus
  last_synced_at: ISODateString | null
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
  | 'ig_synced'

export interface Activity {
  id: string
  influencer_id: string
  /** User id, or null for system actions. */
  actor: string | null
  type: ActivityType
  payload: Record<string, unknown>
  created_at: ISODateString
}

export interface FollowerSnapshot {
  followers: number
  following: number
  engagement_rate: number
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
  instagram_handle: string
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

export type InfluencerSortKey =
  | 'name'
  | 'followers'
  | 'engagement_rate'
  | 'city'
  | 'stage'
  | 'created_at'
  | 'updated_at'
  | 'last_synced_at'

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
  followers_min?: number
  followers_max?: number
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
}

export type InfluencerCreate = Pick<Influencer, 'name' | 'category' | 'instagram_handle'> &
  Partial<
    Pick<
      Influencer,
      | 'phone'
      | 'email'
      | 'address'
      | 'city'
      | 'state'
      | 'country'
      | 'followers'
      | 'following'
      | 'posts_count'
      | 'engagement_rate'
      | 'bio'
      | 'is_verified'
      | 'account_type'
      | 'profile_pic_url'
      | 'assigned_to'
      | 'tags'
      | 'notes'
    >
  >

export type InfluencerUpdate = Partial<
  Omit<Influencer, 'id' | 'stage' | 'created_at' | 'updated_at' | 'ig_sync_status' | 'last_synced_at'>
>

export interface CheckHandleResponse {
  available: boolean
  influencer_id: string | null
}

export interface StageChangeRequest {
  to: Stage
  /** Required when the move is an admin override (outside the standard transitions). */
  reason?: string
}

/** `delete` requires manager or admin. */
export type BulkAction = 'change_stage' | 'assign' | 'sync' | 'delete'

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
  instagram_handle: string
  profile_pic_url: string | null
  followers: number | null
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

/** Result of POST /instagram/lookup once the job succeeds. */
export interface InstagramProfile {
  username: string
  name: string
  bio: string | null
  followers: number
  following: number
  posts_count: number
  engagement_rate: number
  is_verified: boolean
  account_type: AccountType
  profile_pic_url: string | null
  profile_url: string
}

export type InstagramLookupErrorCode = 'personal_account' | 'not_found' | 'rate_limited' | 'already_exists'

export interface CsvPresignResponse {
  upload_url: string
  key: string
}

/** Maps influencer field → CSV column header. */
export type CsvColumnMapping = Partial<Record<keyof InfluencerCreate, string>>

/** What to do with a row whose handle is already in the CRM. */
export type CsvDuplicatePolicy = 'skip' | 'update'

export interface CsvImportRequest {
  key: string
  mapping: CsvColumnMapping
  /** Look each imported handle up on Instagram after the rows are saved. */
  fetch_instagram: boolean
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
  /** Failed rows only. `row` is the 1-based line number in the file (header = 1). */
  errors: { row: number; instagram_handle: string | null; message: string }[]
  /** Present when fetch_instagram was requested. */
  instagram: { synced: number; failed: number } | null
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
  influencer_id: string
  followers: number | null
}

/** Result of the job started by a bulk `sync`. */
export interface BulkSyncResult {
  synced: number
  failed: { id: string; message: string }[]
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
