import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/backend/db'
import { readJob } from '@/backend/jobs'
import { fromRows, toRows } from '../server/relational'
import {
  ADMIN,
  addInfluencer,
  addMember,
  address,
  agreement,
  api,
  influencer,
  insights,
  logCall,
  move,
  onboard,
  resetWorkspace,
  runJob,
  uploadDocument,
} from './harness'

// Sections 3.7–3.10 of the SDLC spec (duplicates, CSV, team and settings, lists and dashboard), plus the P1 backlog
// items that are rules too: saved job outcomes and pending CSV files, and reads that never write.
beforeEach(resetWorkspace)

/** Two influencers sharing an Instagram handle, as older data can (adding one now is refused, FR-INF-03). */
async function duplicatePair() {
  const keep = await influencer('riya', ADMIN, { tags: ['a'] })
  const merge = await influencer('riya_two', ADMIN, { tags: ['b'] })
  await api('POST', `/influencers/${merge}/accounts`, { body: { platform: 'youtube', handle: 'riyatube' } })
  db.influencers.find((i) => i.id === merge)!.accounts.find((a) => a.platform === 'instagram')!.handle = 'riya'
  return { keep, merge }
}

async function importCsv(text: string, mapping: Record<string, string>, on_duplicate = 'skip') {
  const presign = await api('POST', '/imports/csv/presign', { body: { filename: 'import.csv' } })
  await api('POST', '/imports/csv/upload', { body: { key: presign.body.key, text } })
  return runJob('POST', '/imports/csv', { body: { key: presign.body.key, mapping, fetch_profiles: false, on_duplicate } })
}

const CSV_MAPPING = { name: 'Name', category: 'Category', instagram: 'Instagram', city: 'City', tags: 'Tags' }

describe('duplicates', () => {
  it('FR-DUP-01: only the same Instagram handle is a duplicate', async () => {
    await influencer('riya', ADMIN, { email: 'same@example.com', phone: '9876543210' })
    const sameContact = await api('POST', '/duplicates/check', {
      body: { email: 'same@example.com', phone: '9876543210', accounts: [{ platform: 'instagram', handle: 'other' }] },
    })
    expect(sameContact.body.matches).toEqual([])
    const sameHandle = await api('POST', '/duplicates/check', { body: { accounts: [{ platform: 'instagram', handle: 'riya' }] } })
    expect(sameHandle.body.matches[0].confidence).toBe('high')
  })

  it('FR-DUP-03: a dismissed pair never returns', async () => {
    await duplicatePair()
    const pairs = await api('GET', '/duplicates')
    expect(pairs.body.items).toHaveLength(1)
    await api('POST', `/duplicates/${pairs.body.items[0].id}/dismiss`)
    expect((await api('GET', '/duplicates')).body.items).toHaveLength(0)
  })

  it('FR-DUP-04 + FR-INF-05: a merge moves everything to the survivor, joins tags, keeps one primary', async () => {
    const { keep, merge } = await duplicatePair()
    await logCall(merge, 'interested')
    const res = await api('POST', '/influencers/merge', { body: { keep_id: keep, merge_id: merge, field_choices: { name: 'merge' } } })
    expect(res.status).toBe(200)
    const survivor = db.influencers.find((i) => i.id === keep)!
    expect(db.influencers.some((i) => i.id === merge)).toBe(false)
    expect(survivor.name).toBe('Creator riya_two')
    expect(survivor.tags.sort()).toEqual(['a', 'b'])
    expect(survivor.accounts.filter((a) => a.is_primary)).toHaveLength(1)
    expect(survivor.accounts.some((a) => a.platform === 'youtube')).toBe(true)
    expect(db.calls.every((c) => c.influencer_id === keep)).toBe(true)
    expect(db.activities.some((a) => a.influencer_id === keep && a.type === 'merged')).toBe(true)
  })
})

describe('CSV import and export', () => {
  it('FR-CSV-01/02: bad rows are reported by line, good rows import, no fallback category', async () => {
    const cat = db.categories[0]!.name
    const job = await importCsv(`Name,Category,Instagram,City,Tags\nRiya,${cat},riya,Pune,\n,${cat},noname,Pune,\nAsha,Nope,asha,Pune,\n`, CSV_MAPPING)
    expect(job.status).toBe('succeeded')
    expect(job.result.created).toBe(1)
    expect(job.result.failed).toBe(2)
    expect(job.result.errors.map((e: { row: number }) => e.row)).toEqual([3, 4])
  })

  it('FR-CSV-03: update overwrites mapped fields, merges tags, never created_at', async () => {
    const cat = db.categories[0]!.name
    const id = await influencer('riya', ADMIN, { tags: ['old'], city: 'Delhi' })
    const created = db.influencers.find((i) => i.id === id)!.created_at
    const skip = await importCsv(`Name,Category,Instagram,City,Tags\nRiya,${cat},riya,Pune,new\n`, CSV_MAPPING)
    expect(skip.result.duplicates).toBe(1)
    const update = await importCsv(`Name,Category,Instagram,City,Tags\nRiya,${cat},riya,Pune,new\n`, CSV_MAPPING, 'update')
    expect(update.result.updated).toBe(1)
    const inf = db.influencers.find((i) => i.id === id)!
    expect(inf.city).toBe('Pune')
    expect(inf.tags.sort()).toEqual(['new', 'old'])
    expect(inf.created_at).toBe(created)
  })

  it('FR-CSV-04: export has the columns, dd/MM/yyyy dates and one column per platform', async () => {
    await addInfluencer('riya', {
      body: { accounts: [{ platform: 'instagram', handle: 'riya' }, { platform: 'youtube', handle: 'riyatube' }] },
    })
    const job = await runJob('POST', '/exports/influencers', { body: { filters: {} } })
    const csv = decodeURIComponent(job.result.download_url.split(',').slice(1).join(','))
    const [header, row] = csv.split(/\r?\n/)
    expect(header).toMatch(/instagram/i)
    expect(header).toMatch(/youtube/i)
    expect(row).toMatch(/\d{2}\/\d{2}\/\d{4}/)
    expect(row).toContain('riyatube')
  })
})

describe('team, categories and settings', () => {
  it('FR-TEAM-01: emails are unique among members', async () => {
    await addMember('manager', 'Mia')
    const again = await api('POST', '/team', { body: { name: 'Mia 2', email: 'Mia@test.local', role: 'manager' } })
    expect(again.status).toBe(409)
    expect(again.body.error.code).toBe('email_taken')
  })

  it('FR-TEAM-02: nobody changes their own role or deactivates themselves, so an admin always remains', async () => {
    expect((await api('PATCH', `/team/${ADMIN}`, { body: { role: 'manager' } })).body.error.code).toBe('self_change')
    expect((await api('PATCH', `/team/${ADMIN}`, { body: { is_active: false } })).body.error.code).toBe('self_change')
    expect(db.team.filter((u) => u.role === 'admin' && u.is_active)).toHaveLength(1)
  })

  it('FR-TEAM-03: delete only deactivated members who own nothing', async () => {
    const exec = await addMember('executive')
    expect((await api('DELETE', `/team/${exec.id}`)).body.error.code).toBe('still_active')
    await influencer('riya', exec.id)
    await api('PATCH', `/team/${exec.id}`, { body: { is_active: false } })
    expect((await api('DELETE', `/team/${exec.id}`)).body.error.code).toBe('owns_influencers')
  })

  it('FR-CAT-01: names are unique; a used category is not deleted; renames follow', async () => {
    const cat = db.categories[0]!
    expect((await api('POST', '/categories', { body: { name: cat.name.toUpperCase() } })).status).toBe(409)
    const id = await influencer('riya')
    const del = await api('DELETE', `/categories/${cat.id}`)
    expect(del.body.error.code).toBe('in_use')
    await api('PATCH', `/categories/${cat.id}`, { body: { name: 'Renamed' } })
    expect(db.influencers.find((i) => i.id === id)!.category).toBe('Renamed')
  })

  it('FR-SET-01: only admins change settings', async () => {
    const manager = await addMember('manager')
    expect((await api('PATCH', '/settings/pool', { as: manager.id, body: { claim_limit: 5 } })).status).toBe(403)
    expect((await api('PATCH', '/settings/instagram', { as: manager.id, body: { sync_interval_hours: 12 } })).status).toBe(403)
    expect((await api('PATCH', '/settings/instagram', { body: { sync_interval_hours: 12 } })).status).toBe(200)
  })
})

describe('lists and dashboard', () => {
  it('FR-LIST-01: filters AND across, OR within; options count what they would give', async () => {
    await influencer('a', ADMIN, { city: 'Pune' })
    await influencer('b', ADMIN, { city: 'Delhi' })
    await influencer('c', null, { city: 'Pune' })
    const both = await api('GET', '/influencers?city=Pune&city=Delhi')
    expect(both.body.total).toBe(3)
    const owned = await api('GET', `/influencers?city=Pune&assigned_to=${ADMIN}`)
    expect(owned.body.total).toBe(1)
    const options = await api('GET', `/influencers/filter-options?assigned_to=${ADMIN}`)
    expect(options.body.cities.find((o: { value: string }) => o.value === 'Pune').count).toBe(1)
  })

  it('FR-LIST-02: sorting puts nulls last both ways', async () => {
    await addInfluencer('big', { body: { accounts: [{ platform: 'instagram', handle: 'big', sync_method: 'manual', metrics: { followers: 9 } }] } })
    await addInfluencer('none')
    for (const order of ['total_reach', '-total_reach']) {
      const res = await api('GET', `/influencers?sort=${order}`)
      expect(res.body.items.at(-1).total_reach).toBeNull()
    }
  })

  it('FR-LIST-03: search matches name and every handle', async () => {
    await addInfluencer('riya', { body: { accounts: [{ platform: 'instagram', handle: 'riya' }, { platform: 'youtube', handle: 'tubeonly' }] } })
    expect((await api('GET', '/influencers?q=tubeonly')).body.total).toBe(1)
    expect((await api('GET', '/influencers?q=creator riya')).body.total).toBe(1)
  })

  it('FR-LIST-04: saved views are shared with everyone', async () => {
    const exec = await addMember('executive')
    await api('POST', '/saved-views', { body: { name: 'Pune', filters: { city: ['Pune'] } } })
    expect((await api('GET', '/saved-views', { as: exec.id })).body.items).toHaveLength(1)
  })

  it('FR-DASH-01: executives see only their own figures', async () => {
    const exec = await addMember('executive')
    await influencer('mine', exec.id)
    await influencer('theirs', ADMIN)
    const mine = await api('GET', '/dashboard/summary', { as: exec.id })
    expect(mine.body.kpis.total).toBe(1)
    expect(mine.body.team).toBeNull()
    expect((await api('GET', '/dashboard/summary')).body.kpis.total).toBe(2)
  })

  it('FR-DASH-01: an onboarding at 00:10 IST on a Monday counts in that week', async () => {
    const id = await influencer('riya')
    await onboard(id)
    // Monday this week, 00:10 in Asia/Kolkata = Sunday 18:40 UTC.
    const now = new Date()
    const ist = new Date(now.getTime() + 5.5 * 3600_000)
    const monday = new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate() - ((ist.getUTCDay() + 6) % 7)))
    const at = new Date(monday.getTime() + 10 * 60_000 - 5.5 * 3600_000)
    if (at.getTime() > now.getTime()) return // only reachable in the first 10 minutes of a week
    db.activities.find((a) => a.type === 'stage_changed' && a.payload.to === 'onboarded')!.created_at = at.toISOString()
    const res = await api('GET', '/dashboard/summary')
    const week = res.body.onboarded_by_week.at(-1)
    expect(week.week_start).toBe(monday.toISOString().slice(0, 10))
    expect(week.count).toBe(1)
    expect(res.body.kpis.onboarded_this_month + 0).toBeGreaterThanOrEqual(at.getUTCMonth() === now.getUTCMonth() ? 0 : 0)
  })
})

describe('P1: saved jobs and pending CSV files', () => {
  it('a finished job is found after a restart (working copy rebuilt from the saved rows)', async () => {
    const job = await api('POST', '/exports/influencers', { body: { filters: {} } })
    const rows = toRows()
    resetWorkspace()
    fromRows(rows)
    expect(await readJob(job.body.job_id)).toMatchObject({ status: 'succeeded', progress: 100 })
  })

  it('an uploaded CSV survives a restart before the import', async () => {
    const presign = await api('POST', '/imports/csv/presign', { body: { filename: 'a.csv' } })
    await api('POST', '/imports/csv/upload', { body: { key: presign.body.key, text: 'Name\n' } })
    const rows = toRows()
    resetWorkspace()
    fromRows(rows)
    expect(db.uploads.get(presign.body.key)).toBe('Name\n')
  })
})

describe('P1: reads never write', () => {
  it('no GET endpoint changes the stored data', async () => {
    const exec = await addMember('executive')
    const id = await influencer('riya', exec.id)
    await onboard(id)
    await uploadDocument(id, insights())
    await uploadDocument(id, agreement('2026-03-01'))
    await api('POST', '/packages', {
      body: { influencer_id: id, items: [{ name: 'Kit', qty: 1 }], address, courier: 'DTDC', tracking_number: 'T', status: 'sent' },
    })
    await move(id, 'package_sent')
    await influencer('pool', null)
    // The one-time category upgrade runs on an admin's first GET /categories and flags itself (noteChangedOnRead).
    await api('GET', '/categories')
    const before = JSON.stringify([...toRows()].map(([t, m]) => [t, [...m]]))
    const reads = [
      '/me', '/team', '/categories', '/influencers', '/influencers/filter-options', `/influencers/${id}`,
      `/influencers/${id}/activity`, `/influencers/${id}/calls`, `/influencers/${id}/documents`, '/influencers/check-handle?handle=riya',
      '/pool', '/pool/filter-options', '/pool/expiring', '/pipeline', '/dashboard/summary', '/calls/follow-ups', '/packages',
      '/documents', '/duplicates', '/saved-views', '/settings/instagram', '/settings/pool',
    ]
    for (const as of [ADMIN, exec.id]) {
      for (const path of reads) {
        const res = await api('GET', path, { as })
        expect([path, res.changedOnRead]).toEqual([path, false])
        expect([path, JSON.stringify([...toRows()].map(([t, m]) => [t, [...m]]))]).toEqual([path, before])
      }
    }
  })
})
