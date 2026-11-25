import { describe, expect, it } from 'vitest'
import { isStale } from '../src/lib/format'

const DAY = 86_400_000
const now = Date.parse('2026-11-25T06:00:00Z')
const ago = (ms: number) => new Date(now - ms).toISOString()

describe('isStale: data age marker after 8 days', () => {
  it('is fresh up to 8 days, stale after', () => {
    expect(isStale(ago(7 * DAY), now)).toBe(false)
    expect(isStale(ago(8 * DAY), now)).toBe(false)
    expect(isStale(ago(8 * DAY + 60_000), now)).toBe(true)
    expect(isStale(ago(30 * DAY), now)).toBe(true)
  })

  it('never marks a missing or unreadable date', () => {
    expect(isStale(null, now)).toBe(false)
    expect(isStale(undefined, now)).toBe(false)
    expect(isStale('not a date', now)).toBe(false)
  })
})
