import type {
  AccountType,
  CallOutcome,
  CategoryName,
  PackageStatus,
  Role,
  Stage,
  SyncIntervalHours,
  SyncStatus,
} from '@/types'

export const APP_TIMEZONE = 'Asia/Kolkata'
export const DEFAULT_COUNTRY_CODE = '+91'
export const JOB_POLL_INTERVAL_MS = 2000
export const DEFAULT_PAGE_SIZE = 25

interface StageMeta {
  label: string
  color: 'slate' | 'blue' | 'violet' | 'amber' | 'green' | 'gray' | 'red'
  /** Badge classes (light + dark). */
  badge: string
  /** Solid dot / bar class. */
  dot: string
  /** Hex for charts. */
  hex: string
}

// Full class strings are spelled out so Tailwind can detect them.
export const STAGE_META: Record<Stage, StageMeta> = {
  data_gathered: {
    label: 'Data Gathered',
    color: 'slate',
    badge: 'bg-slate-100 text-slate-700 ring-slate-600/20 dark:bg-slate-400/10 dark:text-slate-300 dark:ring-slate-400/25',
    dot: 'bg-slate-500',
    hex: '#64748b',
  },
  contacted: {
    label: 'Contacted',
    color: 'blue',
    badge: 'bg-blue-50 text-blue-700 ring-blue-600/20 dark:bg-blue-400/10 dark:text-blue-300 dark:ring-blue-400/25',
    dot: 'bg-blue-500',
    hex: '#3b82f6',
  },
  onboarded: {
    label: 'Onboarded',
    color: 'violet',
    badge: 'bg-violet-50 text-violet-700 ring-violet-600/20 dark:bg-violet-400/10 dark:text-violet-300 dark:ring-violet-400/25',
    dot: 'bg-violet-500',
    hex: '#8b5cf6',
  },
  package_sent: {
    label: 'Package Sent',
    color: 'amber',
    badge: 'bg-amber-50 text-amber-800 ring-amber-600/25 dark:bg-amber-400/10 dark:text-amber-300 dark:ring-amber-400/25',
    dot: 'bg-amber-500',
    hex: '#f59e0b',
  },
  delivered: {
    label: 'Delivered',
    color: 'green',
    badge: 'bg-green-50 text-green-700 ring-green-600/20 dark:bg-green-400/10 dark:text-green-300 dark:ring-green-400/25',
    dot: 'bg-green-500',
    hex: '#22c55e',
  },
  on_hold: {
    label: 'On Hold',
    color: 'gray',
    badge: 'bg-gray-100 text-gray-600 ring-gray-500/20 dark:bg-gray-400/10 dark:text-gray-400 dark:ring-gray-400/25',
    dot: 'bg-gray-400',
    hex: '#9ca3af',
  },
  rejected: {
    label: 'Rejected',
    color: 'red',
    badge: 'bg-red-50 text-red-700 ring-red-600/20 dark:bg-red-400/10 dark:text-red-300 dark:ring-red-400/25',
    dot: 'bg-red-500',
    hex: '#ef4444',
  },
}

/** Main funnel order. */
export const PIPELINE_STAGES: Stage[] = ['data_gathered', 'contacted', 'onboarded', 'package_sent', 'delivered']
export const SIDE_STAGES: Stage[] = ['on_hold', 'rejected']
export const ALL_STAGES: Stage[] = [...PIPELINE_STAGES, ...SIDE_STAGES]

export const CALL_OUTCOME_META: Record<CallOutcome, { label: string; badge: string }> = {
  interested: { label: 'Interested', badge: 'bg-green-50 text-green-700 dark:bg-green-400/10 dark:text-green-300' },
  not_interested: { label: 'Not interested', badge: 'bg-red-50 text-red-700 dark:bg-red-400/10 dark:text-red-300' },
  call_back: { label: 'Call back', badge: 'bg-blue-50 text-blue-700 dark:bg-blue-400/10 dark:text-blue-300' },
  no_answer: { label: 'No answer', badge: 'bg-amber-50 text-amber-800 dark:bg-amber-400/10 dark:text-amber-300' },
  wrong_number: { label: 'Wrong number', badge: 'bg-gray-100 text-gray-600 dark:bg-gray-400/10 dark:text-gray-400' },
}
export const CALL_OUTCOMES = Object.keys(CALL_OUTCOME_META) as CallOutcome[]

export const PACKAGE_STATUS_META: Record<PackageStatus, { label: string; badge: string }> = {
  preparing: { label: 'Preparing', badge: 'bg-slate-100 text-slate-700 dark:bg-slate-400/10 dark:text-slate-300' },
  sent: { label: 'Sent', badge: 'bg-amber-50 text-amber-800 dark:bg-amber-400/10 dark:text-amber-300' },
  in_transit: { label: 'In transit', badge: 'bg-blue-50 text-blue-700 dark:bg-blue-400/10 dark:text-blue-300' },
  delivered: { label: 'Delivered', badge: 'bg-green-50 text-green-700 dark:bg-green-400/10 dark:text-green-300' },
  returned: { label: 'Returned', badge: 'bg-red-50 text-red-700 dark:bg-red-400/10 dark:text-red-300' },
}
export const PACKAGE_STATUSES = Object.keys(PACKAGE_STATUS_META) as PackageStatus[]

/** Suggestions for the courier field (free text is allowed). */
export const COURIERS = [
  'Delhivery',
  'Blue Dart',
  'DTDC',
  'Ecom Express',
  'XpressBees',
  'India Post',
  'Shiprocket',
  'DHL Express',
  'FedEx',
  'Aramex',
]

export const ACCOUNT_TYPE_LABEL: Record<AccountType, string> = {
  business: 'Business',
  creator: 'Creator',
  personal: 'Personal',
  unknown: 'Unknown',
}

export const SYNC_STATUS_META: Record<SyncStatus, { label: string; dot: string }> = {
  synced: { label: 'Synced', dot: 'bg-green-500' },
  pending: { label: 'Pending', dot: 'bg-amber-500' },
  not_synced: { label: 'Not synced', dot: 'bg-gray-400' },
  error: { label: 'Sync error', dot: 'bg-red-500' },
}

export const SYNC_INTERVAL_OPTIONS: SyncIntervalHours[] = [3, 6, 12, 24]

export const ROLE_LABEL: Record<Role, string> = {
  admin: 'Admin',
  manager: 'Manager',
  executive: 'Executive',
}

export const DEFAULT_CATEGORIES: CategoryName[] = [
  'Fashion',
  'Beauty',
  'Food',
  'Tech',
  'Travel',
  'Fitness',
  'Lifestyle',
  'Gaming',
  'Finance',
  'Parenting',
  'Other',
]
