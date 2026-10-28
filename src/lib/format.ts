import { TZDate } from '@date-fns/tz'
import { format, formatDistanceToNowStrict, isValid } from 'date-fns'
import { APP_TIMEZONE } from '@/lib/constants'

const compactFormatter = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 })
const fullFormatter = new Intl.NumberFormat('en-IN')

/** 12400 → "12.4K", 1200000 → "1.2M". */
export function formatCompact(value: number | null | undefined): string {
  if (value == null) return '—'
  return compactFormatter.format(value)
}

/** Grouped with Indian separators: 1245000 → "12,45,000". */
export function formatNumber(value: number | null | undefined): string {
  if (value == null) return '—'
  return fullFormatter.format(value)
}

export interface FollowerRange {
  min?: number
  max?: number
}

/** { min: 10000, max: 100000 } → "10K–100K"; open ends → "1M+" / "≤ 10K". */
export function formatFollowerRange({ min, max }: FollowerRange): string {
  if (min != null && max != null) return `${formatCompact(min)}–${formatCompact(max)}`
  if (min != null) return `${formatCompact(min)}+`
  if (max != null) return `≤ ${formatCompact(max)}`
  return ''
}

/** Accepts "25000", "25,000", "25k", "1.2m". Undefined when it isn't a number. */
export function parseCompactNumber(text: string): number | undefined {
  const match = text.trim().toLowerCase().replace(/,/g, '').match(/^(\d+(?:\.\d+)?)\s*([km])?$/)
  if (!match) return undefined
  const n = Number(match[1]) * (match[2] === 'm' ? 1_000_000 : match[2] === 'k' ? 1_000 : 1)
  return Math.round(n)
}

export function formatPercent(value: number | null | undefined, digits = 1): string {
  if (value == null) return '—'
  return `${value.toFixed(digits)}%`
}

function toZoned(iso: string): TZDate | null {
  const date = new TZDate(iso, APP_TIMEZONE)
  return isValid(date) ? date : null
}

/** Formats a timestamp in Asia/Kolkata. Default: "28 Oct 2026". */
export function formatDate(iso: string | null | undefined, pattern = 'd MMM yyyy'): string {
  if (!iso) return '—'
  const date = toZoned(iso)
  return date ? format(date, pattern) : '—'
}

/** "28 Oct 2026, 4:30 PM" in Asia/Kolkata. */
export function formatDateTime(iso: string | null | undefined): string {
  return formatDate(iso, 'd MMM yyyy, h:mm a')
}

/** "2 hours ago" / "in 3 days". */
export function formatRelative(iso: string | null | undefined): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (!isValid(date)) return '—'
  return formatDistanceToNowStrict(date, { addSuffix: true })
}

/** ISO timestamp → value for <input type="datetime-local">, in Asia/Kolkata. */
export function isoToLocalInput(iso: string | null | undefined): string {
  if (!iso) return ''
  return format(new TZDate(iso, APP_TIMEZONE), "yyyy-MM-dd'T'HH:mm")
}

/** <input type="datetime-local"> value, read as Asia/Kolkata time → ISO timestamp. */
export function localInputToIso(value: string): string | null {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/)
  if (!match) return null
  const [, y, mo, d, h, mi] = match.map(Number)
  return new TZDate(y, mo - 1, d, h, mi, APP_TIMEZONE).toISOString()
}

/** Today's calendar date in Asia/Kolkata as yyyy-MM-dd. */
export function todayKey(now: Date = new Date()): string {
  return format(new TZDate(now, APP_TIMEZONE), 'yyyy-MM-dd')
}

/** Calendar date of a timestamp in Asia/Kolkata as yyyy-MM-dd. */
export function dayKey(iso: string): string {
  return format(new TZDate(iso, APP_TIMEZONE), 'yyyy-MM-dd')
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  const first = parts[0]?.[0] ?? ''
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : ''
  return (first + last).toUpperCase()
}

export function formatLocation(parts: (string | null | undefined)[]): string {
  return parts.filter(Boolean).join(', ') || '—'
}
