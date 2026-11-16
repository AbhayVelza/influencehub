import { useSyncExternalStore } from 'react'
import { queryClient } from '@/lib/query'

// Signing in as someone else must never show the previous person's data (the same reason a release drops the
// cached record instead of keeping it). The auth module (src/lib/auth) calls resetSession when the acting member changes.

let session = 0
const listeners = new Set<() => void>()

/** Drops every cached response and pending mutation, then remounts the app so each screen refetches. */
export async function resetSession() {
  await queryClient.cancelQueries()
  queryClient.clear()
  session += 1
  for (const listener of listeners) listener()
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Changes on every resetSession. Work running outside React (e.g. job polling) compares it to stop for a new user. */
export const getSessionEpoch = () => session

/** Changes on every resetSession; used as the routed tree's key. */
export function useSessionKey() {
  return useSyncExternalStore(subscribe, () => session)
}
