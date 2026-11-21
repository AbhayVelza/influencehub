import { coalesce } from '@/lib/coalesce'

// Live updates: GET /api/v1/events is a Server-Sent Events stream for signed-in, active members. After a save that
// changed data (a request, the background sync, the scheduler: pg-store's onDataSaved) every open stream gets one
// event, `data: {"v":<n>}`, and the browser refetches the screens it shows (src/lib/live.ts). Events carry only that
// increasing number, never data. Bursts become one event per COALESCE_MS; saves of the background sync and the
// scheduler (backgroundDataChanged) at most one per BACKGROUND_MS, the polling rate, since every event makes every open
// screen refetch through the one-at-a-time request queue. A stream is the first event (the current number, so a
// browser that reconnects can tell whether it missed one) and then a comment every HEARTBEAT_MS, which keeps proxies
// (Render, Vercel's rewrite) from closing an idle stream and lets the server notice a gone browser.

const COALESCE_MS = 300
const BACKGROUND_MS = 60_000
const HEARTBEAT_MS = 25_000
/** How long a browser waits before reconnecting after the stream ends (the SSE `retry` field). */
const RETRY_MS = 3_000
/** At most this many open streams, and per member (one per open tab); more are refused with 503. */
const MAX_STREAMS = 200
const MAX_PER_MEMBER = 10
/** A browser that has stopped reading (this many events queued) is dropped; it reconnects when it reads again. */
const MAX_QUEUED = 50

interface Client {
  uid: string
  /** Still a signed-in, active member? Checked at each heartbeat. */
  signedIn: () => Promise<boolean>
  send: (chunk: string) => void
  close: () => void
}

const clients = new Set<Client>()
const encoder = new TextEncoder()
/**
 * Starts at the boot time, not 0: a browser that reconnects after a restart or deploy never sees the number it last
 * had (that would read as "nothing missed"), since a process never sends more events than milliseconds have passed.
 */
let version = Date.now()
let heartbeat: ReturnType<typeof setInterval> | null = null

const event = () => `data: {"v":${version}}\n\n`

const broadcast = coalesce(() => {
  // This event covers the background changes waiting too.
  backgroundBroadcast.cancel()
  version += 1
  const chunk = event()
  for (const client of [...clients]) client.send(chunk)
}, COALESCE_MS)

const backgroundBroadcast = coalesce(broadcast, BACKGROUND_MS)

/** Data changed (a member's request): every open stream gets one event (bursts are joined). */
export function dataChanged() {
  broadcast()
}

/** The background sync or the scheduler changed data: an event within BACKGROUND_MS, joined with any other. */
export function backgroundDataChanged() {
  backgroundBroadcast()
}

function beat() {
  for (const client of [...clients]) {
    client.send(': ping\n\n')
    // A member signed out elsewhere, deactivated or given a new password loses the stream.
    void client.signedIn().then(
      (ok) => ok || client.close(),
      () => undefined,
    )
  }
}

function drop(client: Client) {
  clients.delete(client)
  if (!clients.size && heartbeat) {
    clearInterval(heartbeat)
    heartbeat = null
  }
}

/** Opens a stream for `uid` (already checked to be a signed-in, active member), or refuses one when too many are open. */
export function liveStream(uid: string, signedIn: () => Promise<boolean>): Response {
  const mine = [...clients].filter((c) => c.uid === uid).length
  if (clients.size >= MAX_STREAMS || mine >= MAX_PER_MEMBER) {
    return Response.json({ error: { code: 'too_many_streams', message: 'Too many open tabs for live updates.' } }, { status: 503 })
  }
  let client: Client | null = null
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const self: Client = {
        uid,
        signedIn,
        send(chunk) {
          if ((controller.desiredSize ?? 0) < -MAX_QUEUED) return self.close()
          try {
            controller.enqueue(encoder.encode(chunk))
          } catch {
            drop(self)
          }
        },
        close() {
          drop(self)
          try {
            controller.close()
          } catch {
            // Already closed or cancelled.
          }
        },
      }
      client = self
      clients.add(self)
      heartbeat ??= setInterval(beat, HEARTBEAT_MS)
      heartbeat.unref?.()
      controller.enqueue(encoder.encode(`retry: ${RETRY_MS}\n${event()}`))
    },
    // The browser went away (the server cancels the body when the connection closes).
    cancel() {
      if (client) drop(client)
    },
  })
  return new Response(body, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      // Tells buffering proxies (nginx-style) to pass each event on at once.
      'X-Accel-Buffering': 'no',
    },
  })
}

/** Ends every stream (shutdown: an open stream would keep the server from closing). */
export function closeLiveStreams() {
  broadcast.cancel()
  backgroundBroadcast.cancel()
  for (const client of [...clients]) client.close()
}

/** Open streams (tests). */
export const liveStreamCount = () => clients.size
