import { toCsvText } from '@/lib/csv'
import { parseCompactNumber, parseImportDate } from '@/lib/format'
import { PLATFORM_META, PLATFORMS } from '@/lib/platforms'
import { fieldSchemas, handleSchema, MAX_TAGS, validateField } from '@/lib/schemas'
import type { AccountCreate, CsvColumnMapping, CsvImportField, InfluencerCreate, Platform } from '@/types'

// CSV import rules shared by the preview (UI) and the data layer (src/backend), so the preview predicts what the import does.

export type ImportField = CsvImportField

const PLATFORM_ALIASES: Record<Platform, string[]> = {
  instagram: ['instagram', 'instagram handle', 'ig', 'ig handle', 'instagram username', 'instagram url', 'handle', 'username'],
  youtube: ['youtube', 'youtube handle', 'youtube channel', 'yt', 'youtube url'],
  tiktok: ['tiktok', 'tiktok handle', 'tt', 'tiktok url'],
  facebook: ['facebook', 'facebook page', 'fb', 'facebook url'],
  threads: ['threads', 'threads handle'],
  pinterest: ['pinterest', 'pinterest handle'],
  linkedin: ['linkedin', 'linkedin url', 'linkedin profile'],
  snapchat: ['snapchat', 'snap', 'snapchat handle'],
}

export const IMPORT_FIELDS: { key: ImportField; label: string; required?: boolean; handle?: boolean; aliases: string[] }[] = [
  { key: 'name', label: 'Name', required: true, aliases: ['name', 'full name', 'influencer', 'influencer name', 'creator'] },
  { key: 'category', label: 'Category', aliases: ['category', 'niche', 'vertical', 'genre'] },
  { key: 'phone', label: 'Phone', aliases: ['phone', 'phone number', 'mobile', 'mobile number', 'contact', 'whatsapp'] },
  { key: 'email', label: 'Email', aliases: ['email', 'email address', 'e-mail', 'mail'] },
  { key: 'city', label: 'City', aliases: ['city', 'town'] },
  { key: 'state', label: 'State', aliases: ['state', 'province', 'region'] },
  { key: 'country', label: 'Country', aliases: ['country', 'nation'] },
  ...PLATFORMS.map((p) => ({ key: p, label: PLATFORM_META[p].label, handle: true, aliases: PLATFORM_ALIASES[p] })),
  {
    key: 'instagram_followers',
    label: 'Instagram followers',
    aliases: ['instagram followers', 'ig followers', 'followers', 'follower count', 'instagram follower count', 'insta followers'],
  },
  { key: 'tags', label: 'Tags', aliases: ['tags', 'labels', 'keywords'] },
  { key: 'notes', label: 'Notes', aliases: ['notes', 'note', 'comments', 'remarks'] },
  { key: 'created_at', label: 'Added on', aliases: ['created at', 'created', 'added on', 'date added', 'added', 'date'] },
]

const squash = (header: string) => header.trim().toLowerCase().replace(/[_\-.]+/g, ' ').replace(/\s+/g, ' ')

/** Maps each field to the first CSV header whose name matches one of its aliases. */
export function autoMatchColumns(headers: string[]): CsvColumnMapping {
  const mapping: CsvColumnMapping = {}
  const used = new Set<string>()
  for (const field of IMPORT_FIELDS) {
    const header = headers.find((h) => !used.has(h) && field.aliases.includes(squash(h)))
    if (header) {
      mapping[field.key] = header
      used.add(header)
    }
  }
  return mapping
}

/** What's missing before an import can start: a name column and at least one handle column. */
export function missingMappings(mapping: CsvColumnMapping): string[] {
  const missing: string[] = []
  if (!mapping.name) missing.push('Name')
  if (!PLATFORMS.some((p) => mapping[p])) missing.push('at least one platform handle')
  return missing
}

export type RawImportRow = Partial<Record<ImportField, string>>

/** Pulls the mapped cells out of one CSV row (trimmed; unmapped/empty cells are left out). */
export function mapImportRow(row: string[], headers: string[], mapping: CsvColumnMapping): RawImportRow {
  const raw: RawImportRow = {}
  for (const field of IMPORT_FIELDS) {
    const column = mapping[field.key]
    if (!column) continue
    const index = headers.indexOf(column)
    const value = index === -1 ? '' : (row[index] ?? '').trim()
    if (value) raw[field.key] = value
  }
  return raw
}

type ImportErrorKey = ImportField | 'accounts'

export interface ValidatedImportRow {
  /** Ready-to-save values for the fields present in the row. `created_at` is an ISO timestamp. */
  values: Partial<Omit<InfluencerCreate, 'accounts'>> & { name?: string; category: string; created_at?: string }
  /** One per handle cell, in platform order. */
  accounts: AccountCreate[]
  errors: Partial<Record<ImportErrorKey, string>>
  warnings: Partial<Record<ImportErrorKey, string>>
}

/** Validates one row with the same rules as the forms. The category must match an active category (any case). */
export function validateImportRow(raw: RawImportRow, categoryNames: string[]): ValidatedImportRow {
  const errors: ValidatedImportRow['errors'] = {}
  const warnings: ValidatedImportRow['warnings'] = {}
  const values: ValidatedImportRow['values'] = { category: '' }
  const accounts: AccountCreate[] = []

  const text = (key: 'name' | 'phone' | 'email' | 'city' | 'state' | 'country' | 'notes') => {
    const result = validateField(fieldSchemas[key], raw[key] ?? '')
    if (!result.ok) errors[key] = result.error
    else if (result.value !== null && result.value !== '') (values as Record<string, unknown>)[key] = result.value
  }
  text('name')
  text('phone')
  text('email')
  text('city')
  text('state')
  text('country')
  text('notes')

  if (raw.created_at) {
    const created = parseImportDate(raw.created_at)
    if (created) values.created_at = created
    else errors.created_at = 'Use dd/MM/yyyy or an ISO date like 2026-10-28'
  }

  for (const platform of PLATFORMS) {
    const cell = raw[platform]
    if (!cell) continue
    const result = validateField(handleSchema(platform), cell)
    if (!result.ok) errors[platform] = result.error
    else accounts.push({ platform, handle: result.value })
  }

  // Instagram followers: typed-in stats for the row's Instagram account (kept as entered, not synced).
  if (raw.instagram_followers) {
    const followers = parseCompactNumber(raw.instagram_followers)
    const instagram = accounts.find((a) => a.platform === 'instagram')
    if (followers === undefined) errors.instagram_followers = 'Use a number like 12400, 12,400 or 12.4K'
    else if (!instagram) warnings.instagram_followers = 'No Instagram handle in this row: followers are skipped'
    else {
      instagram.metrics = { followers }
      instagram.sync_method = 'manual'
    }
  }
  if (accounts.length === 0 && !PLATFORMS.some((p) => errors[p])) errors.accounts = 'Add at least one social handle'

  const match = raw.category ? categoryNames.find((c) => c.toLowerCase() === raw.category!.toLowerCase()) : undefined
  if (match) values.category = match
  else if (!raw.category) errors.category = 'Category is required'
  else errors.category = `“${raw.category}” isn’t a category. Use one of: ${categoryNames.join(', ')}`

  if (raw.tags) {
    const tags: string[] = []
    for (const part of raw.tags.split(/[;|]/)) {
      if (!part.trim()) continue
      const result = validateField(fieldSchemas.tag, part)
      if (!result.ok) {
        errors.tags = `${part.trim()}: ${result.error}`
        break
      }
      if (!tags.includes(result.value)) tags.push(result.value)
    }
    if (tags.length > MAX_TAGS) errors.tags = `At most ${MAX_TAGS} tags`
    else if (!errors.tags && tags.length) values.tags = tags
  }

  return { values, accounts, errors, warnings }
}

export function templateCsv(): string {
  return toCsvText(
    ['name', 'category', 'phone', 'email', 'city', 'state', 'country', 'instagram', 'instagram followers', 'youtube', 'tiktok', 'facebook', 'tags', 'notes'],
    [],
  )
}
