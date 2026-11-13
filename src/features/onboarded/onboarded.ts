import { audienceOf, PLATFORMS } from '@/lib/platforms'
import { ONBOARDED_OR_LATER } from '@/lib/stages'
import type { Influencer, InfluencerFilters, Platform, SocialAccount } from '@/types'

/**
 * Who appears under a platform's Onboarded tab: every creator who has been onboarded, i.e. in Onboarded, Package Sent
 * or Delivered (shipping a package doesn't make them any less onboarded), with an account on that platform. The Stage
 * column shows where each one is now; missing documents show in the Documents column and can be filtered. Plain
 * GET /influencers filters, so the API's scoping applies as is.
 */
export function onboardedFilters(platform: Platform): InfluencerFilters {
  return { stage: [...ONBOARDED_OR_LATER], platform: [platform] }
}

/** The filters the Onboarded tabs set themselves; the URL can't change them. */
export const LOCKED_KEYS = ['stage', 'platform'] as const

export function withoutLocked(filters: InfluencerFilters): InfluencerFilters {
  const rest = { ...filters }
  for (const key of LOCKED_KEYS) delete rest[key]
  return rest
}

export const isPlatform = (value: string | undefined): value is Platform => PLATFORMS.includes(value as Platform)

/** The influencer's account on a platform: the primary one if it's there, else the one with the largest audience. */
export function accountOn(influencer: Pick<Influencer, 'accounts'>, platform: Platform): SocialAccount | null {
  const on = influencer.accounts.filter((a) => a.platform === platform)
  return on.find((a) => a.is_primary) ?? [...on].sort((a, b) => (audienceOf(b) ?? -1) - (audienceOf(a) ?? -1))[0] ?? null
}
