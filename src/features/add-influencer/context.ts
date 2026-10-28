import { createContext, useContext } from 'react'
import type { AccountType } from '@/types'

export type AddTab = 'instagram' | 'manual' | 'csv'

export interface ManualPrefill {
  instagram_handle?: string
  account_type?: AccountType
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
