import { z } from 'zod'
import { ALL_STAGES, CALL_OUTCOMES, DEFAULT_COUNTRY_CODE, PACKAGE_STATUSES } from '@/lib/constants'
import { localInputToIso, parseCompactNumber } from '@/lib/format'

// Validation shared by every form and inline edit, so a value accepted in one place is accepted everywhere.

const E164 = /^\+[1-9]\d{7,14}$/
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const HANDLE = /^[a-z0-9._]{1,30}$/

/** "98765 43210" → "+919876543210"; keeps an explicit country code. Empty → null. */
export function normalizePhone(value: string | null | undefined): string | null {
  if (!value) return null
  const compact = value.replace(/[\s()-]/g, '')
  if (!compact) return null
  return compact.startsWith('+') ? compact : `${DEFAULT_COUNTRY_CODE}${compact.replace(/^0+/, '')}`
}

/**
 * "@RiyaStyle", "instagram.com/riyastyle", "https://www.instagram.com/riyastyle/?hl=en" → "riyastyle".
 * Format isn't checked here; fieldSchemas.instagram_handle does that.
 */
export function normalizeHandle(value: string): string {
  const trimmed = value.trim()
  const fromUrl = trimmed.match(/instagram\.com\/([^/?#\s]+)/i)?.[1]
  return (fromUrl ?? trimmed).replace(/^@+/, '').replace(/\/+$/, '').toLowerCase()
}

/** Trimmed text; empty becomes null. */
const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} must be at most ${max} characters`)
    .transform((v) => v || null)

const requiredText = (max: number, label: string) =>
  z.string().trim().min(1, `${label} is required`).max(max, `${label} must be at most ${max} characters`)

export const fieldSchemas = {
  name: requiredText(100, 'Name'),
  category: requiredText(50, 'Category'),
  instagram_handle: z
    .string()
    .transform(normalizeHandle)
    .pipe(z.string().regex(HANDLE, 'Use 1–30 letters, numbers, dots or underscores')),
  phone: z
    .string()
    .transform(normalizePhone)
    .refine((v) => v === null || E164.test(v), 'Enter a valid phone number, e.g. +91 98765 43210'),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .refine((v) => v === '' || EMAIL.test(v), 'Enter a valid email address')
    .transform((v) => v || null),
  city: optionalText(80, 'City'),
  state: optionalText(80, 'State'),
  country: optionalText(80, 'Country'),
  notes: optionalText(2000, 'Notes'),
  tag: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, 'Tag can’t be empty')
    .max(30, 'Tags must be at most 30 characters')
    .regex(/^[\p{L}\p{N} _-]+$/u, 'Tags can use letters, numbers, spaces, - and _'),
}

export const MAX_TAGS = 20

// ---------------------------------------------------------------------------
// Add influencer

/** Owner select: "" means unassigned. */
const ownerField = z.string().transform((v) => v || null)

/** Details the user adds on top of an Instagram profile (and the core of the manual form). */
export const influencerDetailsSchema = z.object({
  name: fieldSchemas.name,
  category: fieldSchemas.category,
  phone: fieldSchemas.phone,
  email: fieldSchemas.email,
  city: fieldSchemas.city,
  state: fieldSchemas.state,
  country: fieldSchemas.country,
  assigned_to: ownerField,
})

export type InfluencerDetailsInput = z.input<typeof influencerDetailsSchema>

export const manualInfluencerSchema = influencerDetailsSchema.extend({
  instagram_handle: fieldSchemas.instagram_handle,
  account_type: z.enum(['business', 'creator', 'personal', 'unknown']),
  /** Optional manual estimate, e.g. for personal accounts Instagram won't share. */
  followers: z
    .string()
    .trim()
    .refine((v) => v === '' || parseCompactNumber(v) !== undefined, 'Use a number like 12000, 12k or 1.2m')
    .transform((v) => (v ? parseCompactNumber(v)! : null)),
  notes: fieldSchemas.notes,
})

export type ManualInfluencerInput = z.input<typeof manualInfluencerSchema>

export const addressSchema = z.object({
  line1: requiredText(200, 'Address line 1'),
  line2: optionalText(200, 'Address line 2'),
  city: requiredText(80, 'City'),
  state: requiredText(80, 'State'),
  postal_code: requiredText(12, 'Postal code'),
  country: requiredText(80, 'Country'),
})

export type AddressFormInput = z.input<typeof addressSchema>

// ---------------------------------------------------------------------------
// Calls

export const callLogSchema = z
  .object({
    // A string (not an enum) so the form can start with nothing chosen.
    outcome: z.string().refine((v) => (CALL_OUTCOMES as string[]).includes(v), 'Choose an outcome'),
    notes: optionalText(1000, 'Notes'),
    /** datetime-local value, interpreted in Asia/Kolkata. */
    follow_up: z.string(),
    move_to_contacted: z.boolean(),
  })
  .superRefine((value, ctx) => {
    if (value.outcome === 'call_back' && !value.follow_up) {
      ctx.addIssue({ code: 'custom', path: ['follow_up'], message: 'Pick when to call back' })
    }
    if (value.follow_up) {
      const iso = localInputToIso(value.follow_up)
      if (!iso) ctx.addIssue({ code: 'custom', path: ['follow_up'], message: 'Enter a valid date and time' })
      else if (Date.parse(iso) < Date.now()) {
        ctx.addIssue({ code: 'custom', path: ['follow_up'], message: 'Pick a time in the future' })
      }
    }
  })

export type CallLogFormInput = z.input<typeof callLogSchema>

// ---------------------------------------------------------------------------
// Packages

const SHIPPED = new Set(['sent', 'in_transit', 'delivered', 'returned'])

export const packageSchema = z
  .object({
    items: z
      .array(
        z.object({
          name: requiredText(120, 'Item name'),
          qty: z.coerce.number<string | number>().int('Whole numbers only').min(1, 'At least 1').max(999, 'At most 999'),
        }),
      )
      .min(1, 'Add at least one item'),
    address: addressSchema,
    courier: optionalText(60, 'Courier'),
    tracking_number: optionalText(60, 'Tracking number'),
    status: z.enum(PACKAGE_STATUSES as [string, ...string[]]),
  })
  .superRefine((value, ctx) => {
    if (!SHIPPED.has(value.status)) return
    if (!value.courier) ctx.addIssue({ code: 'custom', path: ['courier'], message: 'Courier is required once shipped' })
    if (!value.tracking_number) {
      ctx.addIssue({ code: 'custom', path: ['tracking_number'], message: 'Tracking number is required once shipped' })
    }
  })

export type PackageFormInput = z.input<typeof packageSchema>

// ---------------------------------------------------------------------------
// Settings

export const inviteSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, 'Email is required')
    .refine((v) => EMAIL.test(v), 'Enter a valid email address'),
  role: z.enum(['admin', 'manager', 'executive']),
  /** Optional; the server derives one from the email. */
  name: optionalText(100, 'Name'),
})

export type InviteInput = z.input<typeof inviteSchema>

// ---------------------------------------------------------------------------
// Stage override

export const overrideSchema = z.object({
  to: z.enum(ALL_STAGES as [string, ...string[]]),
  reason: z.string().trim().min(3, 'Explain why this override is needed').max(500, 'At most 500 characters'),
})

/** First error message for a single value, or null when valid. */
export function validateField<T extends z.ZodType>(schema: T, value: unknown): { ok: true; value: z.output<T> } | { ok: false; error: string } {
  const result = schema.safeParse(value)
  return result.success ? { ok: true, value: result.data } : { ok: false, error: result.error.issues[0]?.message ?? 'Invalid value' }
}
