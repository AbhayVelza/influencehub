import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/backend/db'
import { address, addMember, agreement, api, influencer, insights, logCall, move, onboard, resetWorkspace, uploadDocument } from './harness'

// Sections 3.2–3.4 of the SDLC spec: stages, calls and follow-ups, Welcome Kits (packages).
beforeEach(resetWorkspace)

const stageOf = (id: string) => db.influencers.find((i) => i.id === id)!.stage
const tomorrow = () => new Date(Date.now() + 26 * 60 * 60 * 1000).toISOString()

/** Onboarded, with a Welcome Kit sent (courier + tracking), so it's in package_sent. Returns the package id. */
async function packageSent(id: string) {
  await onboard(id)
  const pkg = await api('POST', '/packages', {
    body: { influencer_id: id, items: [{ name: 'Kit', qty: 1 }], address, courier: 'DTDC', tracking_number: 'T1', status: 'sent' },
  })
  expect(pkg.status).toBe(201)
  if (stageOf(id) !== 'package_sent') expect((await move(id, 'package_sent')).status).toBe(200)
  return pkg.body.id as string
}

describe('stages', () => {
  it('FR-STG-01: a move outside the standard set is refused for non-admins', async () => {
    const manager = await addMember('manager')
    const id = await influencer('riya', manager.id)
    const res = await move(id, 'delivered', { as: manager.id })
    expect(res.status).toBe(422)
    expect(res.body.error.code).toBe('invalid_transition')
  })

  it('FR-STG-02: contacted needs an interested call', async () => {
    const id = await influencer('riya')
    const res = await move(id, 'contacted')
    expect(res.status).toBe(422)
    expect(res.body.error.code).toBe('requirement_missing')
  })

  it('FR-STG-03: onboarded needs a current agreement and an insights summary', async () => {
    const id = await influencer('riya')
    await logCall(id, 'interested')
    expect((await move(id, 'contacted')).status).toBe(200)
    const none = await move(id, 'onboarded')
    expect(none.status).toBe(422)
    await uploadDocument(id, agreement())
    const half = await move(id, 'onboarded')
    expect(half.status).toBe(422)
    expect(half.body.error.message).toMatch(/insights/i)
    await uploadDocument(id, insights())
    expect((await move(id, 'onboarded')).status).toBe(200)
  })

  it('FR-STG-04: package_sent needs a package with courier and tracking number', async () => {
    const id = await influencer('riya')
    await onboard(id)
    const res = await move(id, 'package_sent')
    expect(res.status).toBe(422)
    expect(res.body.error.code).toBe('requirement_missing')
  })

  it('FR-STG-05: only managers and admins reopen a rejected influencer', async () => {
    const exec = await addMember('executive')
    const id = await influencer('riya', exec.id)
    await logCall(id, 'not_interested', {}, exec.id)
    expect(stageOf(id)).toBe('rejected')
    expect((await move(id, 'data_gathered', { as: exec.id })).status).toBe(403)
    expect((await move(id, 'data_gathered')).status).toBe(200)
  })

  it('FR-STG-06: an admin override needs a reason', async () => {
    const id = await influencer('riya')
    const res = await move(id, 'onboarded')
    expect(res.status).toBe(422)
    expect(res.body.error.code).toBe('reason_required')
  })

  it('FR-STG-07: no override once ever onboarded, even after leaving', async () => {
    const id = await influencer('riya')
    await onboard(id)
    expect((await move(id, 'rejected')).status).toBe(200)
    const res = await move(id, 'contacted', { reason: 'Try again' })
    expect(res.status).toBe(422)
    expect(res.body.error.code).toBe('invalid_transition')
  })

  it('FR-STG-08: no override from on_hold when the stage before it is unknown', async () => {
    const id = await influencer('riya')
    db.influencers.find((i) => i.id === id)!.stage = 'on_hold' // e.g. imported on hold: no recorded move onto it
    const res = await move(id, 'contacted', { reason: 'Override' })
    expect(res.status).toBe(422)
  })

  it('FR-STG-09: an override into onboarded still needs a current agreement', async () => {
    const id = await influencer('riya')
    const res = await move(id, 'onboarded', { reason: 'Signed offline' })
    expect(res.status).toBe(422)
    expect(res.body.error.code).toBe('requirement_missing')
    await uploadDocument(id, agreement())
    expect((await move(id, 'onboarded', { reason: 'Signed offline' })).status).toBe(200)
  })

  it('FR-STG-10: bulk stage changes never override', async () => {
    const id = await influencer('riya')
    const res = await api('POST', '/influencers/bulk', { body: { ids: [id], action: 'change_stage', value: 'onboarded' } })
    expect(res.body.succeeded).toEqual([])
    expect(res.body.failed[0].message).toMatch(/Can.t move/)
  })

  it('FR-STG-11: every move writes a stage_changed activity', async () => {
    const id = await influencer('riya')
    await logCall(id, 'interested')
    await move(id, 'contacted')
    const log = await api('GET', `/influencers/${id}/activity`)
    const items = log.body.items ?? log.body
    expect(items.some((a: { type: string; payload: { to: string } }) => a.type === 'stage_changed' && a.payload.to === 'contacted')).toBe(true)
  })
})

describe('calls and follow-ups', () => {
  it('FR-CALL-01: not_interested → rejected; no_answer → on_hold', async () => {
    const a = await influencer('a')
    const res = await logCall(a, 'not_interested')
    expect(res.status).toBe(201)
    expect(stageOf(a)).toBe('rejected')
    expect(res.body.stage_change).toBeTruthy()
    const b = await influencer('b')
    await logCall(b, 'no_answer')
    expect(stageOf(b)).toBe('on_hold')
  })

  it('FR-CALL-02: call_back needs a future follow-up date', async () => {
    const id = await influencer('riya')
    expect((await logCall(id, 'call_back')).status).toBe(422)
    expect((await logCall(id, 'call_back', { follow_up_date: '2020-01-01T10:00:00.000Z' })).status).toBe(422)
    expect((await logCall(id, 'call_back', { follow_up_date: tomorrow() })).status).toBe(201)
  })

  it('FR-CALL-03: a new call closes open follow-ups and ticks "called"', async () => {
    const id = await influencer('riya')
    await logCall(id, 'call_back', { follow_up_date: tomorrow() })
    await logCall(id, 'interested')
    expect(db.calls.filter((c) => c.influencer_id === id && c.follow_up_date && !c.follow_up_done)).toHaveLength(0)
    expect(db.influencers.find((i) => i.id === id)!.onboarding_checklist.called).toBe(true)
  })

  it('FR-CALL-04: one open follow-up per person per minute', async () => {
    const a = await influencer('a')
    const b = await influencer('b')
    const at = tomorrow()
    expect((await logCall(a, 'call_back', { follow_up_date: at })).status).toBe(201)
    const clash = await logCall(b, 'call_back', { follow_up_date: at })
    expect(clash.status).toBe(409)
    expect(clash.body.error.code).toBe('time_taken')
  })

  it('FR-CALL-05: follow-ups list in buckets', async () => {
    const id = await influencer('riya')
    await logCall(id, 'call_back', { follow_up_date: tomorrow() })
    const res = await api('GET', '/calls/follow-ups?bucket=upcoming')
    expect(res.status).toBe(200)
    expect((res.body.items ?? res.body).length).toBe(1)
  })
})

describe('Welcome Kits', () => {
  it('FR-PKG-01: at least one item and a full address', async () => {
    const id = await influencer('riya')
    await onboard(id)
    expect((await api('POST', '/packages', { body: { influencer_id: id, items: [], address } })).status).toBe(422)
    const noCity = { ...address, city: '' }
    expect((await api('POST', '/packages', { body: { influencer_id: id, items: [{ name: 'Kit', qty: 1 }], address: noCity } })).status).toBe(422)
  })

  it('FR-PKG-02: sent needs courier and tracking number', async () => {
    const id = await influencer('riya')
    await onboard(id)
    const res = await api('POST', '/packages', { body: { influencer_id: id, items: [{ name: 'Kit', qty: 1 }], address, status: 'sent' } })
    expect(res.status).toBe(422)
  })

  it('FR-PKG-03: delivered moves the influencer to delivered', async () => {
    const id = await influencer('riya')
    const pkg = await packageSent(id)
    expect((await api('PATCH', `/packages/${pkg}`, { body: { status: 'delivered' } })).status).toBe(200)
    expect(stageOf(id)).toBe('delivered')
  })

  it('FR-PKG-04: returned moves package_sent back to onboarded', async () => {
    const id = await influencer('riya')
    const pkg = await packageSent(id)
    await api('PATCH', `/packages/${pkg}`, { body: { status: 'returned' } })
    expect(stageOf(id)).toBe('onboarded')
  })

  it("FR-PKG-05: a package keeps its own copy of the address", async () => {
    const id = await influencer('riya')
    const pkg = await packageSent(id)
    await api('PATCH', `/influencers/${id}`, { body: { address: { ...address, city: 'Mumbai' } } })
    expect(db.packages.find((p) => p.id === pkg)!.address.city).toBe('Pune')
  })
})
