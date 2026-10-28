import { parseCompactNumber } from '@/lib/format'
import { fieldSchemas, MAX_TAGS, validateField } from '@/lib/schemas'
import { toCsvText } from '@/lib/csv'
import type { CsvColumnMapping, InfluencerCreate } from '@/types'

// CSV import rules shared by the preview (UI) and the mock API, so the preview predicts what the import does.

export type ImportField = keyof Pick<
  InfluencerCreate,
  'name' | 'instagram_handle' | 'category' | 'phone' | 'email' | 'city' | 'state' | 'country' | 'followers' | 'tags' | 'notes'
>

export const IMPORT_FIELDS: { key: ImportField; label: string; required?: boolean; aliases: string[] }[] = [
  { key: 'name', label: 'Name', required: true, aliases: ['name', 'full name', 'influencer', 'influencer name', 'creator'] },
  {
    key: 'instagram_handle',
    label: 'Instagram handle',
    required: true,
    aliases: ['instagram handle', 'instagram', 'handle', 'ig', 'ig handle', 'username', 'instagram username', 'profile', 'profile url', 'instagram url'],
  },
  { key: 'category', label: 'Category', aliases: ['category', 'niche', 'vertical', 'genre'] },
  { key: 'phone', label: 'Phone', aliases: ['phone', 'phone number', 'mobile', 'mobile number', 'contact', 'whatsapp'] },
  { key: 'email', label: 'Email', aliases: ['email', 'email address', 'e-mail', 'mail'] },
  { key: 'city', label: 'City', aliases: ['city', 'town'] },
  { key: 'state', label: 'State', aliases: ['state', 'province', 'region'] },
  { key: 'country', label: 'Country', aliases: ['country', 'nation'] },
  { key: 'followers', label: 'Followers', aliases: ['followers', 'follower count', 'followers count', 'audience'] },
  { key: 'tags', label: 'Tags', aliases: ['tags', 'labels', 'keywords'] },
  { key: 'notes', label: 'Notes', aliases: ['notes', 'note', 'comments', 'remarks'] },
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

export interface ValidatedImportRow {
  /** Ready-to-save values for the fields present in the row. */
  values: Partial<InfluencerCreate> & { name?: string; instagram_handle?: string; category: string }
  errors: Partial<Record<ImportField, string>>
  warnings: Partial<Record<ImportField, string>>
}

/** Validates one row with the same rules as the forms. Unknown or missing categories import as "Other". */
export function validateImportRow(raw: RawImportRow, categoryNames: string[]): ValidatedImportRow {
  const errors: ValidatedImportRow['errors'] = {}
  const warnings: ValidatedImportRow['warnings'] = {}
  const values: ValidatedImportRow['values'] = { category: 'Other' }

  const text = (key: 'name' | 'instagram_handle' | 'phone' | 'email' | 'city' | 'state' | 'country' | 'notes') => {
    const result = validateField(fieldSchemas[key], raw[key] ?? '')
    if (!result.ok) errors[key] = result.error
    else if (result.value !== null && result.value !== '') (values as Record<string, unknown>)[key] = result.value
  }
  text('name')
  text('instagram_handle')
  text('phone')
  text('email')
  text('city')
  text('state')
  text('country')
  text('notes')

  if (raw.category) {
    const match = categoryNames.find((c) => c.toLowerCase() === raw.category!.toLowerCase())
    if (match) values.category = match
    else warnings.category = `“${raw.category}” isn’t a category, will import as Other`
  }

  if (raw.followers) {
    const n = parseCompactNumber(raw.followers)
    if (n === undefined) errors.followers = 'Use a number like 12000, 12k or 1.2m'
    else values.followers = n
  }

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

  return { values, errors, warnings }
}

export function templateCsv(): string {
  return toCsvText(
    ['name', 'instagram_handle', 'category', 'phone', 'email', 'city', 'state', 'country', 'followers', 'tags', 'notes'],
    [
      ['Riya Shah', 'riyastyle', 'Fashion', '+91 98765 43210', 'riya@example.com', 'Pune', 'Maharashtra', 'India', '245k', 'micro; reels', 'Prefers WhatsApp'],
      ['Kabir Malhotra', 'https://www.instagram.com/kabirfitlife/', 'Fitness', '98111 22233', '', 'New Delhi', 'Delhi', 'India', '1.2m', '', ''],
    ],
  )
}
