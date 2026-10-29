import { formatCompact, formatNumber, formatPercent } from '@/lib/format'
import type { AccountRef, Influencer, Platform, SocialAccount, SyncMethod } from '@/types'

// Platform rules shared by the UI and the mock API: labels, default sync method, metrics, URLs.

export type MetricFormat = 'count' | 'percent' | 'text' | 'country' | 'account_type'

export interface MetricDef {
  key: string
  label: string
  format: MetricFormat
}

interface PlatformMeta {
  label: string
  /** Two-letter mark used in badges. */
  short: string
  /** Badge classes (light + dark). Full strings so Tailwind detects them. */
  badge: string
  defaultSyncMethod: SyncMethod
  /** The metric that counts toward Total reach. */
  audienceKey: string
  audienceLabel: string
  metrics: MetricDef[]
  /** Builds the profile URL from a handle. */
  url: (handle: string) => string
  /** Captures the handle from a profile URL on this platform. */
  urlPattern: RegExp
}

const count = (key: string, label: string): MetricDef => ({ key, label, format: 'count' })

export const PLATFORM_META: Record<Platform, PlatformMeta> = {
  instagram: {
    label: 'Instagram',
    short: 'IG',
    badge: 'bg-pink-50 text-pink-700 ring-pink-600/20 dark:bg-pink-400/10 dark:text-pink-300 dark:ring-pink-400/25',
    defaultSyncMethod: 'lookup',
    audienceKey: 'followers',
    audienceLabel: 'Followers',
    metrics: [
      count('followers', 'Followers'),
      count('following', 'Following'),
      count('posts', 'Posts'),
      { key: 'engagement_rate', label: 'Engagement rate', format: 'percent' },
      count('avg_likes', 'Avg likes'),
      count('avg_comments', 'Avg comments'),
      { key: 'account_type', label: 'Account type', format: 'account_type' },
    ],
    url: (h) => `https://www.instagram.com/${h}/`,
    urlPattern: /instagram\.com\/([^/?#\s]+)/i,
  },
  youtube: {
    label: 'YouTube',
    short: 'YT',
    badge: 'bg-red-50 text-red-700 ring-red-600/20 dark:bg-red-400/10 dark:text-red-300 dark:ring-red-400/25',
    defaultSyncMethod: 'lookup',
    audienceKey: 'subscribers',
    audienceLabel: 'Subscribers',
    metrics: [
      count('subscribers', 'Subscribers'),
      count('total_views', 'Total views'),
      count('video_count', 'Videos'),
      count('avg_views_recent', 'Avg views (last 10)'),
      { key: 'channel_country', label: 'Channel country', format: 'country' },
    ],
    url: (h) => `https://www.youtube.com/@${h}`,
    urlPattern: /youtube\.com\/(?:@|c\/|user\/)?([^/?#\s]+)/i,
  },
  tiktok: {
    label: 'TikTok',
    short: 'TT',
    badge: 'bg-zinc-100 text-zinc-800 ring-zinc-600/20 dark:bg-zinc-400/10 dark:text-zinc-200 dark:ring-zinc-400/25',
    defaultSyncMethod: 'connect',
    audienceKey: 'followers',
    audienceLabel: 'Followers',
    metrics: [count('followers', 'Followers'), count('following', 'Following'), count('total_likes', 'Total likes'), count('video_count', 'Videos')],
    url: (h) => `https://www.tiktok.com/@${h}`,
    urlPattern: /tiktok\.com\/@([^/?#\s]+)/i,
  },
  facebook: {
    label: 'Facebook',
    short: 'FB',
    badge: 'bg-blue-50 text-blue-700 ring-blue-600/20 dark:bg-blue-400/10 dark:text-blue-300 dark:ring-blue-400/25',
    defaultSyncMethod: 'lookup',
    audienceKey: 'page_followers',
    audienceLabel: 'Page followers',
    metrics: [count('page_followers', 'Page followers'), count('page_likes', 'Page likes'), { key: 'page_category', label: 'Page category', format: 'text' }],
    url: (h) => `https://www.facebook.com/${h}`,
    urlPattern: /(?:facebook|fb)\.com\/([^/?#\s]+)/i,
  },
  threads: {
    label: 'Threads',
    short: 'TH',
    badge: 'bg-neutral-100 text-neutral-800 ring-neutral-600/20 dark:bg-neutral-400/10 dark:text-neutral-200 dark:ring-neutral-400/25',
    defaultSyncMethod: 'lookup',
    audienceKey: 'followers',
    audienceLabel: 'Followers',
    metrics: [count('followers', 'Followers'), count('avg_likes_recent', 'Avg likes (recent)'), count('avg_replies_recent', 'Avg replies (recent)')],
    url: (h) => `https://www.threads.net/@${h}`,
    urlPattern: /threads\.(?:net|com)\/@([^/?#\s]+)/i,
  },
  pinterest: {
    label: 'Pinterest',
    short: 'PI',
    badge: 'bg-rose-50 text-rose-700 ring-rose-600/20 dark:bg-rose-400/10 dark:text-rose-300 dark:ring-rose-400/25',
    defaultSyncMethod: 'connect',
    audienceKey: 'followers',
    audienceLabel: 'Followers',
    metrics: [count('followers', 'Followers'), count('monthly_views', 'Monthly views'), count('pin_count', 'Pins'), count('board_count', 'Boards')],
    url: (h) => `https://www.pinterest.com/${h}/`,
    urlPattern: /pinterest\.[a-z.]+\/([^/?#\s]+)/i,
  },
  linkedin: {
    label: 'LinkedIn',
    short: 'IN',
    badge: 'bg-sky-50 text-sky-700 ring-sky-600/20 dark:bg-sky-400/10 dark:text-sky-300 dark:ring-sky-400/25',
    defaultSyncMethod: 'manual',
    audienceKey: 'followers',
    audienceLabel: 'Followers',
    metrics: [count('followers', 'Followers'), count('connections', 'Connections')],
    url: (h) => `https://www.linkedin.com/in/${h}`,
    urlPattern: /linkedin\.com\/in\/([^/?#\s]+)/i,
  },
  snapchat: {
    label: 'Snapchat',
    short: 'SC',
    badge: 'bg-yellow-50 text-yellow-800 ring-yellow-600/25 dark:bg-yellow-400/10 dark:text-yellow-200 dark:ring-yellow-400/25',
    defaultSyncMethod: 'manual',
    audienceKey: 'subscribers',
    audienceLabel: 'Subscribers',
    metrics: [count('subscribers', 'Subscribers')],
    url: (h) => `https://www.snapchat.com/add/${h}`,
    urlPattern: /snapchat\.com\/add\/([^/?#\s]+)/i,
  },
}

export const PLATFORMS = Object.keys(PLATFORM_META) as Platform[]
/** Platforms POST /lookup can fetch (Facebook: public Pages only). */
export const LOOKUP_PLATFORMS = PLATFORMS.filter((p) => PLATFORM_META[p].defaultSyncMethod === 'lookup')

export const SYNC_METHOD_LABEL: Record<SyncMethod, string> = {
  lookup: 'Public lookup',
  connect: 'Connected by the creator',
  manual: 'Entered manually',
}

/** Empty metrics for a platform: every key present, all null. */
export function emptyMetrics(platform: Platform): Record<string, null> {
  return Object.fromEntries(PLATFORM_META[platform].metrics.map((m) => [m.key, null]))
}

export function metricValue(account: Pick<SocialAccount, 'metrics'>, key: string): number | string | null {
  const value = (account.metrics as Record<string, unknown>)[key]
  return typeof value === 'number' || typeof value === 'string' ? value : null
}

/** The account's headline count (followers / subscribers / page followers). */
export function audienceOf(account: Pick<SocialAccount, 'platform' | 'metrics'>): number | null {
  const value = metricValue(account, PLATFORM_META[account.platform].audienceKey)
  return typeof value === 'number' ? value : null
}

/** Sum of known audiences; null when none is known. */
export function totalReach(accounts: Pick<SocialAccount, 'platform' | 'metrics'>[]): number | null {
  const known = accounts.map(audienceOf).filter((n): n is number => n !== null)
  return known.length ? known.reduce((a, b) => a + b, 0) : null
}

export function primaryAccount(influencer: Pick<Influencer, 'accounts'>): SocialAccount | null {
  return influencer.accounts.find((a) => a.is_primary) ?? influencer.accounts[0] ?? null
}

export const toRef = (a: Pick<SocialAccount, 'platform' | 'handle' | 'profile_url'>): AccountRef => ({
  platform: a.platform,
  handle: a.handle,
  profile_url: a.profile_url,
})

/** "@riyastyle" (LinkedIn slugs and Facebook page names read better without the @, but stay consistent). */
export const formatHandle = (ref: Pick<AccountRef, 'handle'> | null | undefined) => (ref ? `@${ref.handle}` : '—')

export function formatMetric(def: MetricDef, value: number | string | null): string {
  if (value === null) return '—'
  switch (def.format) {
    case 'count':
      return typeof value === 'number' ? formatCompact(value) : String(value)
    case 'percent':
      return typeof value === 'number' ? formatPercent(value, 2) : String(value)
    case 'account_type':
      return String(value).charAt(0).toUpperCase() + String(value).slice(1)
    default:
      return String(value)
  }
}

/** Exact value for a tooltip, when the shown one is rounded. */
export const exactMetric = (def: MetricDef, value: number | string | null) =>
  def.format === 'count' && typeof value === 'number' ? formatNumber(value) : undefined

/**
 * "@RiyaStyle", "youtube.com/@riya", "https://www.instagram.com/riyastyle/?hl=en" → "riyastyle". With a platform,
 * only that platform's URLs are unpacked. Format isn't checked here; fieldSchemas.handle does that.
 */
export function normalizeHandle(value: string, platform?: Platform): string {
  const trimmed = value.trim()
  const patterns = platform ? [PLATFORM_META[platform].urlPattern] : PLATFORMS.map((p) => PLATFORM_META[p].urlPattern)
  let fromUrl: string | undefined
  for (const pattern of patterns) {
    fromUrl = trimmed.match(pattern)?.[1]
    if (fromUrl) break
  }
  return (fromUrl ?? trimmed).replace(/^@+/, '').replace(/\/+$/, '').toLowerCase()
}

/** The platform a pasted profile URL belongs to, if any. */
export function platformOfUrl(value: string): Platform | null {
  return PLATFORMS.find((p) => PLATFORM_META[p].urlPattern.test(value)) ?? null
}

/** Profile links mentioned in a bio or link list, e.g. "YT: youtube.com/@riyavlogs" → YouTube @riyavlogs. */
export function findLinkedAccounts(texts: (string | null | undefined)[], except?: { platform: Platform; handle: string }): AccountRef[] {
  const found: AccountRef[] = []
  for (const text of texts) {
    if (!text) continue
    for (const token of text.split(/[\s,|]+/)) {
      const platform = platformOfUrl(token)
      if (!platform) continue
      const handle = normalizeHandle(token, platform)
      if (!handle || (except && except.platform === platform && except.handle === handle)) continue
      if (!found.some((f) => f.platform === platform && f.handle === handle)) {
        found.push({ platform, handle, profile_url: PLATFORM_META[platform].url(handle) })
      }
    }
  }
  return found
}
