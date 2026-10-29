import { createContext, useContext } from 'react'
import type { Platform } from '@/types'

export type AddTab = 'lookup' | 'manual' | 'csv'

/** Starts the manual form with one account, e.g. a personal profile the lookup couldn't fetch. */
export interface ManualPrefill {
  platform: Platform
  handle: string
  personal?: boolean
}

export interface AddInfluencerContextValue {
  open: (options?: { tab?: AddTab; prefill?: ManualPrefill }) => void
}

export const AddInfluencerContext = createContext<AddInfluencerContextValue | null>(null)

/** Opens the Add / Import dialog from anywhere in the app shell. */
export function useAddInfluencer() {
  const context = useContext(AddInfluencerContext)
  if (!context) throw new Error('useAddInfluencer must be used inside AddInfluencerProvider')
  return context
}
