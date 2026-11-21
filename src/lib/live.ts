import { useEffect } from 'react'
import { coalesce } from '@/lib/coalesce'
import { API_BASE, API_ORIGIN } from '@/lib/env'
import { PROTOTYPE } from '@/lib/mode'
import { queryClient } from '@/lib/query'

// Live updates: when anyone changes data (or the background sync / scheduler does), the screens on show refetch within
// about a second instead of waiting for staleTime or a refetchInterval (those stay, as the fallback).
// - Server mode: an EventSource on GET /api/v1/events (server/live.ts), whose events carry only an increasing number.
// - Prototype mode: the tabs of this browser tell each other (BroadcastChannel in src/backend/index.ts).
// Runs while a member is signed in (RequireAuth); resetSession remounts the routes, which closes it and opens a new one.

const REFRESH_MS = 250
/** Reconnecting after the stream was refused or failed for good (EventSource retries a dropped stream by itself). */
const RETRY_MIN_MS = 5_000
const RETRY_MAX_MS = 5 * 60_000

/** Refetches the active queries, once per burst; waits while a change of this tab is being saved or the tab is hidden. */
function refresher() {
  let pending = false
  const run = coalesce(() => {
    if (document.hidden) {
      pending = true
      return
    }
    // A refetch during a mutation could briefly undo its optimistic update; the mutation refreshes when it settles.
    if (queryClient.isMutating() > 0) {
      run()
      return
    }
    pending = false
    void queryClient.invalidateQueries({ refetchType: 'active' }).catch(() => undefined)
  }, REFRESH_MS)
  const onVisible = () => {
    if (!document.hidden && pending) run()
  }
  document.addEventListener('visibilitychange', onVisible)
  return {
    refresh: run,
    stop() {
      run.cancel()
      document.removeEventListener('visibilitychange', onVisible)
    },
  }
}

/** The number in an event's data, or null. */
export function eventVersion(data: unknown): number | null {
  if (typeof data !== 'string') return null
  try {
    const parsed = JSON.parse(data) as { v?: unknown }
    return typeof parsed.v === 'number' ? parsed.v : null
  } catch {
    return null
  }
}

function serverStream(refresh: () => void): () => void {
  if (typeof EventSource === 'undefined') return () => undefined
  let source: EventSource | null = null
  let retryTimer: ReturnType<typeof setTimeout> | null = null
  let retryMs = RETRY_MIN_MS
  let last: number | null = null
  let stopped = false

  const open = () => {
    retryTimer = null
    if (stopped || source || document.hidden) return
    const es = new EventSource(`${API_ORIGIN}${API_BASE}/events`, { withCredentials: !!API_ORIGIN })
    source = es
    es.onopen = () => {
      retryMs = RETRY_MIN_MS
    }
    es.onmessage = (e: MessageEvent) => {
      const v = eventVersion(e.data)
      if (v === null) return
      // The first event of a stream is the server's current number: a change only if one was missed while away.
      if (last !== null && v !== last) refresh()
      last = v
    }
    es.onerror = () => {
      // CONNECTING: EventSource reconnects by itself. CLOSED: refused (signed out, too many tabs) or not a stream
      // (a proxy's error page); try again later, the polling covers the gap.
      if (es.readyState !== EventSource.CLOSED || stopped) return
      es.close()
      source = null
      retryTimer = setTimeout(open, retryMs)
      retryMs = Math.min(retryMs * 2, RETRY_MAX_MS)
    }
  }
  const close = () => {
    if (retryTimer) clearTimeout(retryTimer)
    retryTimer = null
    source?.close()
    source = null
  }
  const onOnline = () => {
    if (source || stopped) return
    if (retryTimer) clearTimeout(retryTimer)
    open()
  }
  // Only a visible tab holds a stream: over HTTP/1.1 (local dev, `npm run server`) a browser allows about 6
  // connections per host, so a stream in every open tab would leave none for the API calls. A tab shown again
  // reconnects, and its first event says whether anything changed while it was hidden.
  const onVisibility = () => (document.hidden ? close() : open())

  open()
  window.addEventListener('online', onOnline)
  document.addEventListener('visibilitychange', onVisibility)
  return () => {
    stopped = true
    window.removeEventListener('online', onOnline)
    document.removeEventListener('visibilitychange', onVisibility)
    close()
  }
}

function otherTabs(refresh: () => void): () => void {
  let stopped = false
  let unsubscribe: (() => void) | null = null
  void import('@/backend').then(({ onOtherTabChange }) => {
    if (!stopped) unsubscribe = onOtherTabChange(refresh)
  })
  return () => {
    stopped = true
    unsubscribe?.()
  }
}

/** Starts live updates; returns the function that stops them. */
export function startLiveUpdates(): () => void {
  const updates = refresher()
  const stopSource = PROTOTYPE ? otherTabs(updates.refresh) : serverStream(updates.refresh)
  return () => {
    stopSource()
    updates.stop()
  }
}

/** Live updates while `uid` is signed in (or acting). */
export function useLiveUpdates(uid: string | null) {
  useEffect(() => (uid ? startLiveUpdates() : undefined), [uid])
}
