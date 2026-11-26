import { beforeAll, describe, expect, it } from 'vitest'
import { attachDocumentSummary, db, refreshDerived } from '@/backend/db'
import type { Activity, Influencer, SocialAccount, Stage } from '@/types'
import { ADMIN, addMember, api, resetWorkspace } from './harness'

// NFR-01: list and filter-option responses under 300 ms at 100,000 influencers (npm run test:perf); the dashboard,
// which sums everything an admin sees, under 500 ms. Timed in Node without PostgreSQL: reads never save
// (server/main.ts), so this is what the API server spends on them.
const N = Number(process.env.PERF_N ?? 100_000)
const limitFor = (path: string) => (path.startsWith('/dashboard') ? 500 : 300)
const STAGES: Stage[] = ['data_gathered', 'contacted', 'onboarded', 'package_sent', 'delivered', 'on_hold', 'rejected']
const CITIES = ['Mumbai', 'Delhi', 'Pune', 'Jaipur', 'Kochi', 'Indore', 'Surat', 'Patna']

async function timed(path: string, as = ADMIN) {
  await api('GET', path, { as }) // warm-up
  const runs: number[] = []
  for (let i = 0; i < 3; i++) {
    const t = performance.now()
    const res = await api('GET', path, { as })
    runs.push(performance.now() - t)
    expect(res.status).toBe(200)
  }
  const ms = Math.min(...runs)
  process.stderr.write(`${path.padEnd(70)} ${ms.toFixed(0).padStart(5)} ms
`)
  return ms
}

/** A workspace with `n` influencers spread over every stage, the pool, an admin and an executive. Returns the executive. */
export async function seed(n: number): Promise<string> {
    resetWorkspace()
    const exec = (await addMember('executive', 'Exec One')).id
    const owners = [null, ADMIN, exec]
    const now = Date.now()
    const influencers: Influencer[] = []
    const activities: Activity[] = []
    for (let i = 0; i < n; i++) {
      const id = `inf_perf${i}`
      const created = new Date(now - i * 60_000).toISOString()
      const stage = STAGES[i % STAGES.length]!
      const owner = stage === 'data_gathered' ? owners[i % 3]! : owners[1 + (i % 2)]!
      const account = {
        id: `acc_perf${i}`, influencer_id: id, platform: 'instagram', handle: `creator_${i}`,
        profile_url: `https://instagram.com/creator_${i}`, is_primary: true, sync_method: 'manual', sync_status: 'idle',
        last_synced_at: null, connect_status: 'not_connected', connect_link_expires_at: null, display_name: null,
        profile_pic_url: null, bio: null, links: [], is_verified: i % 10 === 0, metrics: { followers: (i * 7919) % 2_000_000 },
        created_at: created,
      } as unknown as SocialAccount
      const inf = {
        id, name: `Creator ${i}`, category: db.categories[i % db.categories.length]!.name, phone: null, email: null,
        address: null, city: CITIES[i % CITIES.length]!, state: null, country: 'India', profile_pic_url: null,
        is_verified: false, accounts: [account], total_reach: null, stage, assigned_to: owner, tags: i % 5 ? [] : ['vip'],
        notes: null,
        onboarding_checklist: { called: false, agreement_signed: false, insights_received: false, address_collected: false, ig_connected: false },
        documents: null, created_at: created, updated_at: created,
      } as Influencer
      refreshDerived(inf)
      influencers.push(attachDocumentSummary(inf))
      activities.push({ id: `act_c${i}`, influencer_id: id, actor: ADMIN, type: 'created', payload: {}, created_at: created })
      // Claims, so auto-release (which runs before every request) has work to check.
      if (owner === exec) activities.push({ id: `act_k${i}`, influencer_id: id, actor: exec, type: 'claimed', payload: {}, created_at: created })
      if (stage !== 'data_gathered') {
        activities.push({ id: `act_s${i}`, influencer_id: id, actor: ADMIN, type: 'stage_changed', payload: { from: 'data_gathered', to: stage }, created_at: created })
      }
    }
    db.influencers = influencers
    db.activities = activities
    // Long enough that nothing is released while the check runs, so every request sees the same data.
    db.poolSettings.auto_release_days = 3650
    return exec
}

describe(`NFR-01 at ${N.toLocaleString()} influencers`, () => {
  let exec = ''
  beforeAll(async () => {
    exec = await seed(N)
  }, 120_000)

  const paths = [
    '/me',
    '/influencers?page=1&page_size=25',
    '/influencers?page=1&page_size=25&sort=total_reach&order=desc',
    '/influencers?page=1&page_size=25&search=creator_9999',
    '/influencers?page=1&page_size=25&stage=onboarded&city=Pune',
    '/influencers/filter-options',
    '/pool?page=1&page_size=25',
    '/pool/filter-options',
    '/pipeline',
    '/dashboard/summary',
  ]
  for (const path of paths) {
    it(`${path} (admin)`, async () => expect(await timed(path)).toBeLessThan(limitFor(path)))
    // Executives have no pool (403).
    if (!path.startsWith('/pool')) it(`${path} (executive)`, async () => expect(await timed(path, exec)).toBeLessThan(limitFor(path)))
  }
})
