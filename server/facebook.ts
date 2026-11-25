import { JobFailure } from '@/backend/jobs'
import type { ProfileSource } from '@/backend/social'
import { findLinkedAccounts, PLATFORM_META } from '@/lib/platforms'
import type { LookupProfile } from '@/types'
import { metaGet, metaRateLimit, type GraphError } from './meta'

// Facebook Pages through Meta's Graph API: a Page's public profile (name, category, about, followers, likes, website,
// picture, verified badge), read by its username or numeric id with FACEBOOK_API_KEY: a token of a separate Meta app
// from Instagram's, with its own hourly allowance (META_IG_USER_ID isn't needed). Pages we manage can be read with pages_read_engagement; any other public
// Page needs the "Page Public Metadata Access" feature approved in Meta App Review. Posts and their engagement aren't
// part of Page Public Metadata Access, so a Page has no recent posts here. Personal profiles can't be looked up.

const FIELDS = 'id,name,username,about,category,fan_count,followers_count,website,picture.type(large){url},verification_status'

/** A Page username (letters, numbers, dots, dashes) or numeric id, as normalizeHandle leaves it. */
const PAGE_HANDLE = /^(?:\d{5,25}|[a-z0-9][a-z0-9.-]{1,49})$/

interface Page {
  id: string
  name?: string
  username?: string
  about?: string
  category?: string
  fan_count?: number
  followers_count?: number
  website?: string
  picture?: { data?: { url?: string } }
  verification_status?: string
}

/** Meta's error codes as the app's lookup errors (the Add influencer screen explains each). */
function toFailure(e: GraphError): JobFailure {
  const limited = metaRateLimit('facebook', e)
  if (limited) return limited
  if (e.code === 190) return new JobFailure('not_connected', 'The Facebook connection has expired. An admin needs to renew FACEBOOK_API_KEY.')
  // 10 / 200, or 100 naming the Page permissions (no subcode; seen 25/11/2026): the app lacks Page Public Metadata
  // Access, or the token lacks pages_read_engagement for a Page we manage.
  const needsPageAccess = e.code === 100 && /pages_read_engagement|Page Public (Metadata|Content) Access/i.test(e.message ?? '')
  if (e.code === 10 || e.code === 200 || needsPageAccess) {
    return new JobFailure(
      'not_connected',
      'Facebook Pages can’t be read yet: Meta hasn’t approved Page Public Metadata Access for the app. Pages we manage still work.',
    )
  }
  // 803: no Page with that username. 100/33: missing, private or age/country-restricted, or not readable without
  // Page Public Metadata Access.
  if (e.code === 803 || (e.code === 100 && e.error_subcode === 33)) {
    return new JobFailure('not_found', 'No public Facebook Page has that name. Restricted Pages, and any Page we don’t manage until Meta approves Page Public Metadata Access, can’t be read.')
  }
  // A personal profile answers "nonexisting field … on node type (User)".
  if (e.code === 100 && /node type \(User\)/i.test(e.message ?? '')) {
    return new JobFailure('not_found', 'That’s a personal profile, not a Page. Personal profiles can’t be looked up.')
  }
  console.error('Facebook lookup failed', { code: e.code, subcode: e.error_subcode, message: e.message })
  return new JobFailure('unavailable', 'Facebook couldn’t be reached. Try again later.')
}

const count = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v) : null)

/** The Page's website field: one or more links separated by spaces, commas or new lines; https/http only. */
const websites = (value: string | undefined) => (value ?? '').split(/[\s,]+/).filter((w) => /^https?:\/\/\S+$/i.test(w))

/** A Facebook Page's public profile and the stats the CRM keeps for it. */
export async function fetchFacebookPage(handle: string): Promise<LookupProfile> {
  if (!PAGE_HANDLE.test(handle)) throw new JobFailure('not_found', 'That isn’t a valid Facebook Page name or id.')
  const d = await metaGet<Page>('facebook', `/${handle}`, FIELDS, 'Facebook', toFailure)
  if (!d?.id) throw new JobFailure('not_found', 'No public Facebook Page has that name.')
  const saved = (d.username ?? d.id).toLowerCase()
  const about = d.about?.trim() || null
  const links = websites(d.website)
  const picture = d.picture?.data?.url
  return {
    platform: 'facebook',
    handle: saved,
    profile_url: PLATFORM_META.facebook.url(saved),
    display_name: d.name?.trim() || saved,
    bio: about,
    links,
    profile_pic_url: picture?.startsWith('https://') ? picture : null,
    is_verified: d.verification_status === 'blue_verified',
    metrics: {
      page_followers: count(d.followers_count),
      page_likes: count(d.fan_count),
      page_category: d.category?.trim() || null,
    },
    linked_accounts: findLinkedAccounts([about, ...links], { platform: 'facebook', handle: saved }),
  }
}

/** One cheap call that checks the token works (start-up); throws the same errors as a lookup. */
export async function checkFacebook(): Promise<void> {
  await metaGet<{ id: string }>('facebook', '/me', 'id', 'Facebook', toFailure)
}

export const facebookSource: ProfileSource = { fetch: fetchFacebookPage }
