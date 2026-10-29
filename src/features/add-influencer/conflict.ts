import { ApiError, influencersApi } from '@/services'
import type { HandleConflict, Platform } from '@/types'

export interface ConflictState {
  platform: Platform
  handle: string
  conflict: HandleConflict
  /** Null for `assigned_to_other`: executives aren't told which influencer it is. */
  id: string | null
}

const FROM_ERROR: Record<string, HandleConflict> = {
  handle_taken: 'exists',
  already_exists: 'exists',
  in_pool: 'in_pool',
  assigned_to_other: 'assigned_to_other',
}

/** Turns a 409 from lookup / create into what the notice needs (asking check-handle for the id). */
export async function conflictFromError(err: unknown, platform: Platform, handle: string): Promise<ConflictState | null> {
  if (!(err instanceof ApiError) || !(err.code in FROM_ERROR)) return null
  const check = await influencersApi.checkHandle(platform, handle).catch(() => null)
  return { platform, handle, conflict: check?.conflict ?? FROM_ERROR[err.code]!, id: check?.influencer_id ?? null }
}
