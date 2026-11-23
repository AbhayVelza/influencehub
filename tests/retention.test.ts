import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/backend/db'
import { purgeDeletedDocuments } from '@/backend/documents'
import { addMember, ADMIN, agreement, api, influencer, logCall, resetWorkspace, uploadDocument } from './harness'

// P2 (20/11/2026): the Rejected tab, personal data export, and the 30-day purge of deleted documents the API server's
// scheduler runs (server/scheduler.ts; auto-release and link expiry are covered with the pool).

beforeEach(() => resetWorkspace())

describe('Rejected tab', () => {
  it('rejected influencers leave the Influencers list and show in the Rejected tab with their Instagram handle', async () => {
    const kept = await influencer('kept')
    const gone = await influencer('gone')
    await logCall(gone, 'not_interested')
    const list = await api('GET', '/influencers')
    expect(list.body.items.map((i: { id: string }) => i.id)).toEqual([kept])
    // Still reachable through the Stage filter.
    expect((await api('GET', '/influencers?stage=rejected')).body.items.map((i: { id: string }) => i.id)).toEqual([gone])
    const rejected = await api('GET', '/influencers/rejected')
    expect(rejected.body.items).toEqual([{ id: gone, name: expect.any(String), instagram: 'gone' }])
  })

  it('Brand Specialists can’t open the Rejected tab', async () => {
    const bs = await addMember('brand_specialist')
    expect((await api('GET', '/influencers/rejected', { as: bs.id })).status).toBe(403)
  })
})

describe('Personal data export', () => {
  it('an admin downloads everything stored about one influencer; others can’t', async () => {
    const id = await influencer('riya')
    await logCall(id, 'no_answer')
    const res = await api('GET', `/influencers/${id}/export`, { as: ADMIN })
    expect(res.body.influencer.id).toBe(id)
    expect(res.body.calls).toHaveLength(1)
    expect(res.body).toHaveProperty('welcome_kits')
    expect(res.body).toHaveProperty('activity')
    const exec = await addMember('executive')
    expect((await api('GET', `/influencers/${id}/export`, { as: exec.id })).status).toBe(403)
    const manager = await addMember('manager')
    expect((await api('GET', `/influencers/${id}/export`, { as: manager.id })).status).toBe(403)
  })
})

describe('Deleted documents', () => {
  it('are purged 30 days after deletion, not before', async () => {
    const id = await influencer('riya')
    const doc = await uploadDocument(id, agreement())
    expect((await api('DELETE', `/documents/${doc.body.id}`)).status).toBeLessThan(300)
    const stored = db.documents.find((d) => d.id === doc.body.id)!
    expect(purgeDeletedDocuments(Date.parse(stored.deleted_at!) + 29 * 86_400_000)).toBe(0)
    expect(purgeDeletedDocuments(Date.parse(stored.deleted_at!) + 31 * 86_400_000)).toBe(1)
    expect(db.documents.some((d) => d.id === doc.body.id)).toBe(false)
  })
})
