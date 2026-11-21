// Live updates (server/live.ts, src/lib/live.ts) turn bursts of changes into one event or one refresh.

export interface Coalesced {
  (): void
  /** Drops a run that is waiting. */
  cancel(): void
}

/**
 * Runs `fn` once, `waitMs` after the first call of a burst: every call in between joins that run. So `fn` runs at
 * most once per `waitMs`, and never later than `waitMs` after a call.
 */
export function coalesce(fn: () => void, waitMs: number): Coalesced {
  let timer: ReturnType<typeof setTimeout> | null = null
  const call = () => {
    if (timer) return
    timer = setTimeout(() => {
      timer = null
      fn()
    }, waitMs)
  }
  call.cancel = () => {
    if (timer) clearTimeout(timer)
    timer = null
  }
  return call
}
