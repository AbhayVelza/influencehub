import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/backend/db'
import { mayReadFile } from '@/backend/documents'
import { splitRoundRobin } from '@/features/pool/use-pool-actions'
import { ADMIN, addMember, agreement, api, influencer, insights, resetWorkspace, uploadDocument } from './harness'

// Sections 3.5–3.6 of the SDLC spec: the Unassigned Pool and documents.
beforeEach(resetWorkspace)

const ownerOf = (id: string) => db.influencers.find((i) => i.id === id)!.assigned_to
const DAY = 24 * 60 * 60 * 1000

describe('Unassigned Pool', () => {
  it('FR-POOL-01: executives get a preview of pool influencers, without contact details', async () => {
    const exec = await addMember('executive')
    const id = await influencer('riya', null, { phone: '9876543210', email: 'riya@example.com', notes: 'secret' })
    const res = await api('GET', `/pool/${id}`, { as: exec.id })
    expect(res.status).toBe(200)
    const text = JSON.stringify(res.body)
    expect(text).not.toContain('9876543210')
    expect(text).not.toContain('riya@example.com')
    expect(text).not.toContain('secret')
  })

  it('FR-POOL-02: a claim succeeds only while unowned', async () => {
    const a = await addMember('executive', 'Exec A')
    const b = await addMember('executive', 'Exec B')
    const id = await influencer('riya', null)
    expect((await api('POST', `/influencers/${id}/claim`, { as: a.id })).status).toBe(200)
    const second = await api('POST', `/influencers/${id}/claim`, { as: b.id })
    expect(second.status).toBe(409)
    expect(second.body.error.code).toBe('already_claimed')
  })

  it('FR-POOL-03: the claim limit stops one more claim', async () => {
    const exec = await addMember('executive')
    await api('PATCH', '/settings/pool', { body: { claim_limit: 1 } })
    const a = await influencer('a', null)
    const b = await influencer('b', null)
    expect((await api('POST', `/influencers/${a}/claim`, { as: exec.id })).status).toBe(200)
    const res = await api('POST', `/influencers/${b}/claim`, { as: exec.id })
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('claim_limit_reached')
  })

  it('FR-POOL-04: release needs a reason; executives release only their own', async () => {
    const exec = await addMember('executive')
    const mine = await influencer('a', exec.id)
    const theirs = await influencer('b', ADMIN)
    const none = await api('POST', `/influencers/${mine}/release`, { as: exec.id, body: {} })
    expect(none.body.error.code).toBe('reason_required')
    expect((await api('POST', `/influencers/${theirs}/release`, { as: exec.id, body: { reason: 'x' } })).status).toBe(404)
    expect((await api('POST', `/influencers/${mine}/release`, { as: exec.id, body: { reason: 'Not a fit' } })).status).toBe(204)
    expect(ownerOf(mine)).toBeNull()
  })

  it('FR-POOL-05: auto-release returns an uncalled claim; assignments never auto-release', async () => {
    const exec = await addMember('executive')
    const claimed = await influencer('a', null)
    const assigned = await influencer('b', exec.id)
    await api('POST', `/influencers/${claimed}/claim`, { as: exec.id })
    await api('PATCH', '/settings/pool', { body: { auto_release_days: 3 } })
    // The claim happened 4 days ago.
    for (const a of db.activities) if (a.influencer_id === claimed && a.type === 'claimed') a.created_at = new Date(Date.now() - 4 * DAY).toISOString()
    await api('GET', '/me')
    expect(ownerOf(claimed)).toBeNull()
    expect(ownerOf(assigned)).toBe(exec.id)
    const released = db.activities.find((a) => a.influencer_id === claimed && a.type === 'released')!
    expect(released.actor).toBeNull()
    expect(released.payload.auto).toBe(true)
  })

  it('FR-POOL-05: a call since the claim keeps it', async () => {
    const exec = await addMember('executive')
    const id = await influencer('a', null)
    await api('POST', `/influencers/${id}/claim`, { as: exec.id })
    await api('POST', `/influencers/${id}/calls`, { as: exec.id, body: { outcome: 'interested' } })
    await api('PATCH', '/settings/pool', { body: { auto_release_days: 3 } })
    for (const a of db.activities) if (a.influencer_id === id) a.created_at = new Date(Date.now() - 4 * DAY).toISOString()
    for (const c of db.calls) c.created_at = new Date(Date.now() - 3 * DAY).toISOString()
    await api('GET', '/me')
    expect(ownerOf(id)).toBe(exec.id)
  })

  it('FR-POOL-06: claims releasing by tomorrow are listed for their owner', async () => {
    const exec = await addMember('executive')
    const id = await influencer('a', null)
    await api('POST', `/influencers/${id}/claim`, { as: exec.id })
    await api('PATCH', '/settings/pool', { body: { auto_release_days: 3 } })
    for (const a of db.activities) if (a.influencer_id === id && a.type === 'claimed') a.created_at = new Date(Date.now() - 2.5 * DAY).toISOString()
    const res = await api('GET', '/pool/expiring', { as: exec.id })
    expect((res.body.items ?? res.body).map((c: { influencer: { id: string } }) => c.influencer.id)).toEqual([id])
  })

  it('FR-POOL-07: bulk assign shares round-robin; a row taken meanwhile fails with not_in_pool', async () => {
    expect(splitRoundRobin([1, 2, 3, 4, 5], 2).map((s) => s.length)).toEqual([3, 2])
    const a = await addMember('executive', 'Exec A')
    const ids = await Promise.all(['p1', 'p2'].map((h) => influencer(h, null)))
    const taken = await influencer('taken', ADMIN)
    const res = await api('POST', '/influencers/bulk', { body: { ids: [...ids, taken], action: 'pool_assign', value: a.id } })
    expect(ids.map(ownerOf)).toEqual([a.id, a.id])
    expect(ownerOf(taken)).toBe(ADMIN)
    expect(res.body.failed).toEqual([expect.objectContaining({ id: taken, code: 'not_in_pool' })])
  })

  it('FR-POOL-08: no documents for pool influencers', async () => {
    const id = await influencer('a', null)
    const res = await api('GET', `/influencers/${id}/documents`)
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('in_pool')
    expect((await api('GET', `/influencers/${id}`)).body.documents).toBeNull()
  })
})

describe('documents', () => {
  it('FR-DOC-01: only PDF, JPG, PNG, DOCX, XLSX up to 20 MB', async () => {
    const id = await influencer('a')
    const presign = (content_type: string, size: number) =>
      api('POST', '/documents/presign', { body: { influencer_id: id, type: 'agreement', file_name: 'f', content_type, size } })
    expect((await presign('application/zip', 10)).body.error.code).toBe('unsupported_file_type')
    expect((await presign('application/pdf', 21 * 1024 * 1024)).body.error.code).toBe('file_too_large')
    expect((await presign('application/pdf', 10)).status).toBe(200)
  })

  it('FR-DOC-02: saving the metadata needs the uploaded file', async () => {
    const id = await influencer('a')
    const presign = await api('POST', '/documents/presign', {
      body: { influencer_id: id, type: 'agreement', file_name: 'f.pdf', content_type: 'application/pdf', size: 10 },
    })
    const res = await api('POST', `/influencers/${id}/documents`, { body: { key: presign.body.key, title: 'A', ...agreement() } })
    expect(res.status).toBe(422)
    expect(res.body.error.code).toBe('upload_missing')
  })

  it('FR-DOC-03: an insights period ends on or after it starts', async () => {
    const id = await influencer('a')
    const res = await uploadDocument(id, { type: 'insights_summary', period_start: '2026-02-01', period_end: '2026-01-01' })
    expect(res.status).toBe(422)
  })

  it('FR-DOC-04: the newest agreement is current; older ones stay', async () => {
    const id = await influencer('a')
    const first = await uploadDocument(id, agreement('2026-01-01'))
    const second = await uploadDocument(id, agreement('2026-02-01'))
    const docs = db.documents.filter((d) => d.influencer_id === id)
    expect(docs).toHaveLength(2)
    expect(docs.find((d) => d.id === second.body.id)).toMatchObject({ is_current: true })
    expect(docs.find((d) => d.id === first.body.id)).toMatchObject({ is_current: false })
  })

  it("FR-DOC-05: uploading ticks the checklist; deleting doesn't untick it", async () => {
    const id = await influencer('a')
    const doc = await uploadDocument(id, insights())
    const checklist = () => db.influencers.find((i) => i.id === id)!.onboarding_checklist
    expect(checklist().insights_received).toBe(true)
    await api('DELETE', `/documents/${doc.body.id}`)
    expect(checklist().insights_received).toBe(true)
  })

  it('FR-DOC-06: delete is soft, managers and admins only; the next agreement becomes current', async () => {
    const exec = await addMember('executive')
    const id = await influencer('a', exec.id)
    const older = await uploadDocument(id, agreement('2026-01-01'))
    const newer = await uploadDocument(id, agreement('2026-02-01'))
    expect((await api('DELETE', `/documents/${newer.body.id}`, { as: exec.id })).status).toBe(403)
    expect((await api('DELETE', `/documents/${newer.body.id}`)).status).toBe(204)
    expect(db.documents.find((d) => d.id === newer.body.id)!.deleted_at).not.toBeNull()
    expect(db.documents.find((d) => d.id === older.body.id)!).toMatchObject({ is_current: true })
  })

  it("FR-DOC-07: executives reach only their own influencers' documents", async () => {
    const exec = await addMember('executive')
    const id = await influencer('a', ADMIN)
    const doc = await uploadDocument(id, insights())
    expect((await api('GET', `/influencers/${id}/documents`, { as: exec.id })).status).toBe(404)
    expect((await api('GET', `/documents/${doc.body.id}/download`, { as: exec.id })).status).toBe(404)
  })

  it('FR-DOC-07: a stored file is served only to members who may download its document', async () => {
    const exec = await addMember('executive')
    const other = await addMember('executive', 'other exec')
    const specialist = await addMember('brand_specialist')
    const id = await influencer('a', exec.id)
    const doc = await uploadDocument(id, insights(), exec.id)
    const key = db.documents.find((d) => d.id === doc.body.id)!.storage_key
    const member = (uid: string) => db.team.find((u) => u.id === uid)!
    expect(mayReadFile(key, member(exec.id))).toBe(true)
    expect(mayReadFile(key, member(ADMIN))).toBe(true)
    expect(mayReadFile(key, member(other.id))).toBe(false)
    expect(mayReadFile(key, member(specialist.id))).toBe(false)
    expect(mayReadFile('documents/unknown/file.pdf', member(ADMIN))).toBe(false)
    await api('DELETE', `/documents/${doc.body.id}`)
    expect(mayReadFile(key, member(exec.id))).toBe(false)
  })
})
