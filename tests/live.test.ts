import { afterEach, describe, expect, it, vi } from 'vitest'
import { coalesce } from '@/lib/coalesce'
import { eventVersion } from '@/lib/live'
import { backgroundDataChanged, closeLiveStreams, dataChanged, liveStream, liveStreamCount } from '../server/live'

// Live updates: the coalescing helper, and the server's event stream (server/live.ts) without PostgreSQL.

afterEach(() => {
  closeLiveStreams()
  vi.useRealTimers()
})

describe('coalesce', () => {
  it('joins a burst into one run, waitMs after its first call', () => {
    vi.useFakeTimers()
    const fn = vi.fn()
    const call = coalesce(fn, 300)
    call()
    vi.advanceTimersByTime(100)
    call()
    call()
    vi.advanceTimersByTime(199)
    expect(fn).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(fn).toHaveBeenCalledTimes(1)
    // A later call starts a new run: at most one per 300 ms.
    call()
    vi.advanceTimersByTime(300)
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('cancel drops the waiting run', () => {
    vi.useFakeTimers()
    const fn = vi.fn()
    const call = coalesce(fn, 250)
    call()
    call.cancel()
    vi.advanceTimersByTime(1000)
    expect(fn).not.toHaveBeenCalled()
  })
})

describe('eventVersion', () => {
  it('reads the number and ignores anything else', () => {
    expect(eventVersion('{"v":3}')).toBe(3)
    expect(eventVersion('{"v":"3"}')).toBeNull()
    expect(eventVersion('not json')).toBeNull()
    expect(eventVersion(undefined)).toBeNull()
  })
})

const decoder = new TextDecoder()
async function next(reader: ReadableStreamDefaultReader<Uint8Array>) {
  const { value, done } = await reader.read()
  return done ? null : decoder.decode(value)
}
const signedIn = () => Promise.resolve(true)
/** The next chunk that isn't a heartbeat. */
async function nextEvent(reader: ReadableStreamDefaultReader<Uint8Array>) {
  let chunk = await next(reader)
  while (chunk?.startsWith(': ping')) chunk = await next(reader)
  return chunk
}
const firstVersion = (chunk: string | null) => eventVersion(chunk!.split('\n')[1]!.slice('data: '.length))!

describe('the event stream', () => {
  it('opens with the retry time and the current number, as an SSE response', async () => {
    const res = liveStream('usr_a', signedIn)
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toMatch(/^text\/event-stream/)
    expect(res.headers.get('Cache-Control')).toContain('no-cache')
    const first = await next(res.body!.getReader())
    expect(first).toMatch(/^retry: \d+\ndata: \{"v":\d+\}\n\n$/)
  })

  it('sends one event per burst of changes to every stream, with an increasing number and no data', async () => {
    vi.useFakeTimers()
    const a = liveStream('usr_a', signedIn).body!.getReader()
    const b = liveStream('usr_b', signedIn).body!.getReader()
    const start = eventVersion((await next(a))!.split('\n')[1]!.slice('data: '.length))!
    await next(b)

    dataChanged()
    dataChanged()
    dataChanged()
    vi.advanceTimersByTime(300)
    expect(await next(a)).toBe(`data: {"v":${start + 1}}\n\n`)
    expect(await next(b)).toBe(`data: {"v":${start + 1}}\n\n`)

    dataChanged()
    vi.advanceTimersByTime(300)
    expect(await next(a)).toBe(`data: {"v":${start + 2}}\n\n`)
  })

  it('numbers start at the boot time, so a browser reconnecting after a restart never sees its last number again', async () => {
    const v = firstVersion(await next(liveStream('usr_a', signedIn).body!.getReader()))
    // Not 0: the module loaded at about Date.now(), and a process never sends more events than milliseconds pass.
    expect(v).toBeGreaterThan(Date.parse('2026-01-01T00:00:00Z'))
    expect(v).toBeLessThanOrEqual(Date.now() + 1_000)
  })

  it('background saves (sync, scheduler) send at most one event a minute; a member’s change sends it at once', async () => {
    vi.useFakeTimers()
    const reader = liveStream('usr_a', signedIn).body!.getReader()
    const start = firstVersion(await next(reader))
    backgroundDataChanged()
    vi.advanceTimersByTime(30_000)
    backgroundDataChanged()
    vi.advanceTimersByTime(30_000 + 300)
    expect(await nextEvent(reader)).toBe(`data: {"v":${start + 1}}\n\n`)

    // A member's change covers the background one waiting: one event now, none a minute later.
    backgroundDataChanged()
    vi.advanceTimersByTime(10_000)
    dataChanged()
    vi.advanceTimersByTime(300)
    expect(await nextEvent(reader)).toBe(`data: {"v":${start + 2}}\n\n`)
    vi.advanceTimersByTime(60_000)
    expect(firstVersion(await next(liveStream('usr_b', signedIn).body!.getReader()))).toBe(start + 2)
  })

  it('sends a comment heartbeat, and closes the stream of someone no longer signed in', async () => {
    vi.useFakeTimers()
    let ok = true
    const reader = liveStream('usr_a', () => Promise.resolve(ok)).body!.getReader()
    await next(reader)
    vi.advanceTimersByTime(25_000)
    expect(await next(reader)).toBe(': ping\n\n')
    ok = false
    vi.advanceTimersByTime(25_000)
    expect(await next(reader)).toBe(': ping\n\n')
    await vi.waitFor(() => expect(liveStreamCount()).toBe(0))
    expect(await next(reader)).toBeNull()
  })

  it('forgets a stream the browser closed', async () => {
    const reader = liveStream('usr_a', signedIn).body!.getReader()
    await next(reader)
    expect(liveStreamCount()).toBe(1)
    await reader.cancel()
    expect(liveStreamCount()).toBe(0)
  })

  it('refuses more than 10 streams for one member', async () => {
    const open = Array.from({ length: 10 }, () => liveStream('usr_a', signedIn))
    expect(open.every((r) => r.status === 200)).toBe(true)
    const refused = liveStream('usr_a', signedIn)
    expect(refused.status).toBe(503)
    expect(((await refused.json()) as { error: { code: string } }).error.code).toBe('too_many_streams')
    expect(liveStream('usr_b', signedIn).status).toBe(200)
  })

  it('closeLiveStreams ends every stream (shutdown)', async () => {
    const reader = liveStream('usr_a', signedIn).body!.getReader()
    await next(reader)
    closeLiveStreams()
    expect(liveStreamCount()).toBe(0)
    expect(await next(reader)).toBeNull()
  })
})
