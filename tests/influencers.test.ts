import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/backend/db'
import { ADMIN, addInfluencer, addMember, api, influencer, resetWorkspace } from './harness'

// Section 3.1 of the SDLC spec: influencers and accounts.
beforeEach(resetWorkspace)

describe('influencers', () => {
  it('FR-INF-01: needs an account; the first is primary; starts in data_gathered', async () => {
    const none = await addInfluencer('x', { body: { accounts: [] } })
    expect(none.status).toBe(422)
    const res = await addInfluencer('riya', {
      body: { accounts: [{ platform: 'instagram', handle: 'riya' }, { platform: 'youtube', handle: 'riyatube' }] },
    })
    expect(res.status).toBe(201)
    expect(res.body.stage).toBe('data_gathered')
    expect(res.body.accounts.map((a: { is_primary: boolean }) => a.is_primary)).toEqual([true, false])
  })

  it('FR-INF-02: handles are normalised', async () => {
    const res = await addInfluencer('https://instagram.com/@Riya.Style')
    expect(res.status).toBe(201)
    expect(res.body.accounts[0].handle).toBe('riya.style')
  })

  it('FR-INF-03: (platform, handle) is unique', async () => {
    await influencer('riya')
    const again = await addInfluencer('riya')
    expect(again.status).toBe(409)
    expect(['handle_taken', 'in_pool', 'assigned_to_other']).toContain(again.body.error.code)
  })

  it("FR-INF-04: the handle check never names a teammate's influencer to an executive", async () => {
    const exec = await addMember('executive')
    const other = await addMember('executive', 'Other exec')
    await influencer('riya', other.id)
    const res = await api('GET', '/influencers/check-handle?platform=instagram&handle=riya', { as: exec.id })
    expect(res.body.conflict).toBe('assigned_to_other')
    expect(res.body.influencer_id).toBeNull()
  })

  it('FR-INF-05: exactly one primary account after adding an account (merges: duplicates.test.ts)', async () => {
    const id = await influencer('riya')
    await api('POST', `/influencers/${id}/accounts`, { body: { platform: 'youtube', handle: 'riyatube' } })
    const accounts = db.influencers.find((i) => i.id === id)!.accounts
    expect(accounts).toHaveLength(2)
    expect(accounts.filter((a) => a.is_primary)).toHaveLength(1)
  })

  it('FR-INF-06: total followers is the sum of the known audiences, null when none', async () => {
    const res = await addInfluencer('riya', {
      body: {
        accounts: [
          { platform: 'instagram', handle: 'riya', sync_method: 'manual', metrics: { followers: 10_000 } },
          { platform: 'youtube', handle: 'riyatube', sync_method: 'manual', metrics: { subscribers: 5_000 } },
        ],
      },
    })
    expect(res.body.total_reach).toBe(15_000)
    const none = await addInfluencer('nobody')
    expect(none.body.total_reach).toBeNull()
  })

  it('FR-INF-07: only manual accounts take typed metrics', async () => {
    const id = await influencer('riya')
    const account = db.influencers.find((i) => i.id === id)!.accounts[0]!
    account.sync_method = 'lookup'
    const res = await api('PATCH', `/accounts/${account.id}`, { body: { metrics: { followers: 5 } } })
    expect(res.status).toBe(422)
    expect(res.body.error.code).toBe('not_manual')
  })

  it('FR-INF-08: an executive adds for themselves or into the pool, never for someone else', async () => {
    const exec = await addMember('executive')
    const mine = await addInfluencer('a', { as: exec.id, body: { assigned_to: exec.id } })
    expect(mine.status).toBe(201)
    const pool = await addInfluencer('b', { as: exec.id, body: { assigned_to: null } })
    expect(pool.status).toBe(201)
    expect(pool.body.assigned_to).toBeNull()
    const other = await addInfluencer('c', { as: exec.id, body: { assigned_to: ADMIN } })
    expect(other.status).toBe(403)
  })

  it('FR-INF-09: PATCH ignores accounts and derived fields', async () => {
    const id = await influencer('riya')
    const res = await api('PATCH', `/influencers/${id}`, {
      body: { name: 'Riya S', total_reach: 999, is_verified: true, profile_pic_url: 'http://x', accounts: [] },
    })
    expect(res.status).toBe(200)
    expect(res.body.name).toBe('Riya S')
    expect(res.body.total_reach).toBeNull()
    expect(res.body.is_verified).toBe(false)
    expect(res.body.profile_pic_url).toBeNull()
    expect(res.body.accounts).toHaveLength(1)
  })

  it('FR-INF-10: phones are E.164 with +91 by default', async () => {
    const res = await addInfluencer('riya', { body: { phone: '09876543210' } })
    expect(res.body.phone).toBe('+919876543210')
  })

  it('FR-INF-11: the email field takes an address or a contact note', async () => {
    const res = await addInfluencer('riya', { body: { email: 'managed by @agency' } })
    expect(res.status).toBe(201)
    expect(res.body.email).toBe('managed by @agency')
  })

  it('FR-INF-12: at most 20 tags', async () => {
    const tags = Array.from({ length: 21 }, (_, i) => `tag${i}`)
    expect((await addInfluencer('riya', { body: { tags } })).status).toBe(422)
    expect((await addInfluencer('riya', { body: { tags: tags.slice(0, 20) } })).status).toBe(201)
  })
})
