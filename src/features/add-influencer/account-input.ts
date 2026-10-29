import { useQuery } from '@tanstack/react-query'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { PLATFORM_META } from '@/lib/platforms'
import { handleSchema, validateField, type AccountInput } from '@/lib/schemas'
import { influencersApi } from '@/services'
import type { Platform } from '@/types'
import type { ConflictState } from './conflict'

/** Will this account be typed in by hand? (manual platforms, or a personal Instagram / Facebook profile) */
export const isManualAccount = (platform: Platform, personal: boolean) =>
  PLATFORM_META[platform].defaultSyncMethod === 'manual' || (personal && (platform === 'instagram' || platform === 'facebook'))

export const EMPTY_ACCOUNT: AccountInput = { platform: 'instagram', handle: '', audience: '', personal: false }

/** Live "is this account already in the CRM?" check, debounced. */
export function useHandleCheck(platform: Platform, handle: string) {
  const parsed = validateField(handleSchema(platform), handle)
  const normalized = parsed.ok ? parsed.value : ''
  const debounced = useDebouncedValue(normalized, 400)
  const query = useQuery({
    queryKey: ['check-handle', platform, debounced],
    queryFn: ({ signal }) => influencersApi.checkHandle(platform, debounced, signal),
    enabled: debounced !== '',
    staleTime: 10_000,
  })
  const settled = parsed.ok && debounced === normalized
  const taken: ConflictState | undefined =
    settled && query.data?.available === false
      ? { platform, handle: debounced, id: query.data.influencer_id, conflict: query.data.conflict ?? 'exists' }
      : undefined
  return {
    checking: parsed.ok && (!settled || query.isFetching),
    taken,
    available: settled && query.data?.available === true,
  }
}
