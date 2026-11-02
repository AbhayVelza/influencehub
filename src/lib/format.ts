import { TZDate } from '@date-fns/tz'
import { addDays, format, formatDistanceToNowStrict, isValid, set } from 'date-fns'
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

// Every date shown in the app goes through the formatters below (Asia/Kolkata). API values stay ISO 8601.
const DATE_PATTERN = 'dd/MM/yyyy'
const TIME_PATTERN = 'hh:mm a'
const DATE_TIME_PATTERN = `${DATE_PATTERN}, ${TIME_PATTERN}`
const CHART_DATE_PATTERN = 'dd/MM'

function formatIst(iso: string | null | undefined, pattern: string): string {
  if (!iso) return '—'
  const date = toZoned(iso)
  return date ? format(date, pattern) : '—'
}

/** "28/10/2026" in Asia/Kolkata. */
export const formatDate = (iso: string | null | undefined) => formatIst(iso, DATE_PATTERN)

/** "28/10/2026, 04:30 PM" in Asia/Kolkata. */
export const formatDateTime = (iso: string | null | undefined) => formatIst(iso, DATE_TIME_PATTERN)

/** "04:30 PM" in Asia/Kolkata. */
export const formatTime = (iso: string | null | undefined) => formatIst(iso, TIME_PATTERN)

/** "28/10" for chart axes. */
export const formatChartDate = (iso: string | null | undefined) => formatIst(iso, CHART_DATE_PATTERN)

/** A calendar date without a time (API `yyyy-MM-dd`, e.g. a signing date) → "28/10/2026". No timezone shift. */
export function formatDay(day: string | null | undefined): string {
  const match = day?.match(/^(\d{4})-(\d{2})-(\d{2})/)
  return match ? `${match[3]}/${match[2]}/${match[1]}` : '—'
}

/** "2 hours ago" / "in 3 days". Show it through `RelativeTime`, which keeps the exact date-time in a tooltip. */
export function formatRelative(iso: string | null | undefined): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (!isValid(date)) return '—'
  return formatDistanceToNowStrict(date, { addSuffix: true })
}

// ---------------------------------------------------------------------------
// Date inputs: people type dd/MM/yyyy; forms and the API keep yyyy-MM-dd / ISO timestamps.

export const DATE_INPUT_FORMAT = 'dd/MM/yyyy'
export const DATE_TIME_INPUT_FORMAT = 'dd/MM/yyyy, hh:mm a'

function isRealDate(y: number, m: number, d: number): boolean {
  const date = new Date(Date.UTC(y, m - 1, d))
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
}

const pad = (n: number) => String(n).padStart(2, '0')

/** A wall-clock time in Asia/Kolkata → UTC ISO timestamp ("…Z"), the same shape the API returns. */
function istToIso(y: number, m: number, d: number, hour: number, minute: number): string {
  return new Date(new TZDate(y, m - 1, d, hour, minute, APP_TIMEZONE).getTime()).toISOString()
}

/** "28/10/2026" (also "28-10-2026", "28.10.2026", "1/2/2026") → "2026-10-28"; null when it isn't a real date. */
export function parseDateInput(text: string): string | null {
  const match = text.trim().match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/)
  if (!match) return null
  const [d, m, y] = [Number(match[1]), Number(match[2]), Number(match[3])]
  return isRealDate(y, m, d) ? `${y}-${pad(m)}-${pad(d)}` : null
}

/** "2026-10-28" → "28/10/2026" (for a date input's text). */
export function dayToInput(day: string | null | undefined): string {
  const formatted = formatDay(day)
  return formatted === '—' ? '' : formatted
}

/** "28/10/2026, 05:30 PM" (comma optional; "17:30" works too) read as Asia/Kolkata → ISO timestamp; null when invalid. */
export function parseDateTimeInput(text: string): string | null {
  const match = text.trim().match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}),?\s+(\d{1,2}):(\d{2})\s*([ap]m)?$/i)
  if (!match) return null
  const [d, m, y, rawHour, minute] = [Number(match[1]), Number(match[2]), Number(match[3]), Number(match[4]), Number(match[5])]
  const meridiem = match[6]?.toLowerCase()
  if (!isRealDate(y, m, d) || minute > 59) return null
  let hour = rawHour
  if (meridiem) {
    if (hour < 1 || hour > 12) return null
    hour = (hour % 12) + (meridiem === 'pm' ? 12 : 0)
  } else if (hour > 23) return null
  return istToIso(y, m, d, hour, minute)
}

/** The IST midnight starting a yyyy-MM-dd date, as an ISO timestamp. */
function dayStartIso(day: string): string {
  const [y, m, d] = day.split('-').map(Number)
  return istToIso(y, m, d, 0, 0)
}

/**
 * A CSV cell holding a date: dd/MM/yyyy (optionally with a time) or ISO 8601, → ISO timestamp; null when invalid.
 * Dates without a time, and times without an offset, are read as Asia/Kolkata.
 */
export function parseImportDate(text: string): string | null {
  const value = text.trim()
  const typed = parseDateTimeInput(value)
  if (typed) return typed
  const day = parseDateInput(value)
  if (day) return dayStartIso(day)
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)(Z|[+-]\d{2}:?\d{2})?)?$/)
  if (!iso || !isRealDate(Number(iso[1]), Number(iso[2]), Number(iso[3]))) return null
  const [, y, m, d, time, offset] = iso
  if (!time) return dayStartIso(`${y}-${m}-${d}`)
  const date = new Date(offset ? value.replace(' ', 'T') : `${y}-${m}-${d}T${time}+05:30`)
  return isValid(date) ? date.toISOString() : null
}

/** ISO timestamp → "28/10/2026, 05:30 PM" (for a date-time input's text), in Asia/Kolkata. */
export function isoToDateTimeInput(iso: string | null | undefined): string {
  const text = formatDateTime(iso)
  return text === '—' ? '' : text
}

/** A date-time input value for "now + N days at HH:00" in Asia/Kolkata (follow-up shortcuts). */
export function dateTimeInputFromNow(days: number, hour: number): string {
  const base = addDays(new TZDate(Date.now(), APP_TIMEZONE), days)
  return format(set(base, { hours: hour, minutes: 0, seconds: 0, milliseconds: 0 }), "dd/MM/yyyy, hh:mm a")
}

// ---------------------------------------------------------------------------
// Machine keys (not displayed)

/** The calendar date of any Date, as yyyy-MM-dd (in the date's own timezone: pass a TZDate for IST). */
export function toDayKey(date: Date): string {
  return format(date, 'yyyy-MM-dd')
}

/** Today's calendar date in Asia/Kolkata as yyyy-MM-dd. */
export function todayKey(now: Date = new Date()): string {
  return toDayKey(new TZDate(now, APP_TIMEZONE))
}

/** Calendar date of a timestamp in Asia/Kolkata as yyyy-MM-dd. */
export function dayKey(iso: string): string {
  return toDayKey(new TZDate(iso, APP_TIMEZONE))
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
