import { PIPELINE_STAGES } from '@/lib/constants'
import { primaryAccount, toRef } from '@/lib/platforms'
import type { DuplicateCheckRequest, DuplicateMatch, DuplicatePair, Influencer, MatchConfidence, MergeField, MergeRequest, User } from '@/types'
import { currentUser, db, invalidateEverOnboarded, logActivity, nowIso, refreshDerived } from './db'
import { canSee } from './domain'
import { moveDocuments } from './documents'

// Duplicate detection (same Instagram handle only) and merging (see "Duplicate detection" and "Merge" in docs/contract-decisions.md).

const RANK: Record<MatchConfidence, number> = { high: 3, medium: 2, low: 1 }

type Candidate = DuplicateCheckRequest

const fromInfluencer = (inf: Influencer): Candidate => ({
  name: inf.name,
  email: inf.email,
  phone: inf.phone,
  city: inf.city,
  accounts: inf.accounts.map((a) => ({ platform: a.platform, handle: a.handle, bio: a.bio, links: a.links })),
})

/**
 * The only duplicate signal: the same Instagram handle (handles are stored normalised). Email, phone, bio links,
 * other platforms' handles and names are deliberately not compared.
 */
function compare(c: Candidate, inf: Influencer): { confidence: MatchConfidence; reasons: string[] } | null {
  const theirs = new Set(inf.accounts.filter((a) => a.platform === 'instagram').map((a) => a.handle))
  const shared = c.accounts.filter((a) => a.platform === 'instagram' && theirs.has(a.handle)).map((a) => a.handle)
  if (!shared.length) return null
  return { confidence: 'high', reasons: [...new Set(shared)].map((h) => `Same Instagram account @${h}`) }
}

/**
 * POST /duplicates/check. What a match reveals depends on the caller: executives learn nothing about a teammate's
 * creator beyond "a teammate has it" (no id, name or reasons).
 */
export function checkDuplicates(body: Candidate, user: User = currentUser()): DuplicateMatch[] {
  const candidate: Candidate = { ...body, accounts: Array.isArray(body.accounts) ? body.accounts : [] }
  const matches: DuplicateMatch[] = []
  for (const inf of db.influencers) {
    if (inf.id === body.exclude_id) continue
    const hit = compare(candidate, inf)
    if (!hit) continue
    const primary = primaryAccount(inf)
    const summary = {
      id: inf.id,
      name: inf.name,
      profile_pic_url: inf.profile_pic_url,
      primary_account: primary ? toRef(primary) : null,
      city: inf.city,
      assigned_to: inf.assigned_to,
    }
    if (canSee(user, inf)) matches.push({ influencer_id: inf.id, ...hit, access: 'full', influencer: summary })
    else if (inf.assigned_to === null) matches.push({ influencer_id: inf.id, ...hit, access: 'pool', influencer: summary })
    else matches.push({ influencer_id: null, confidence: hit.confidence, reasons: [], access: 'restricted', influencer: null })
  }
  return matches.sort((a, b) => RANK[b.confidence] - RANK[a.confidence])
}

export const pairId = (a: string, b: string) => `dup_${[a, b].sort().join('_')}`

/** Open pairs across the whole CRM (GET /duplicates), strongest first, minus dismissed ones. */
export function duplicatePairs(): DuplicatePair[] {
  const pairs: DuplicatePair[] = []
  const list = db.influencers
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const [a, b] = [list[i]!, list[j]!].sort((x, y) => x.created_at.localeCompare(y.created_at))
      const id = pairId(a.id, b.id)
      if (db.dismissedDuplicates.has(id)) continue
      const hit = compare(fromInfluencer(b), a)
      if (hit) pairs.push({ id, ...hit, influencers: [a, b] })
    }
  }
  return pairs.sort((x, y) => RANK[y.confidence] - RANK[x.confidence] || x.id.localeCompare(y.id))
}

const stageRank = (stage: Influencer['stage']) => PIPELINE_STAGES.indexOf(stage) // side stages rank -1

/**
 * Folds `merge` into `keep`: chosen field values, every account (minus exact repeats), calls, packages and
 * activity; tags are combined, checklist items kept if either has them, and the more advanced stage wins.
 */
export function mergeInfluencers(keep: Influencer, merge: Influencer, choices: MergeRequest['field_choices']): Influencer {
  const take = (field: MergeField) => choices[field] === 'merge'
  if (take('name')) keep.name = merge.name
  if (take('category')) keep.category = merge.category
  if (take('phone')) keep.phone = merge.phone
  if (take('email')) keep.email = merge.email
  if (take('address')) keep.address = merge.address
  if (take('location')) Object.assign(keep, { city: merge.city, state: merge.state, country: merge.country })
  if (take('notes')) keep.notes = merge.notes
  if (take('assigned_to')) keep.assigned_to = merge.assigned_to

  for (const account of merge.accounts) {
    if (keep.accounts.some((a) => a.platform === account.platform && a.handle === account.handle)) continue
    keep.accounts.push({ ...account, influencer_id: keep.id, is_primary: false })
  }
  keep.tags = [...new Set([...keep.tags, ...merge.tags])]
  for (const key of Object.keys(keep.onboarding_checklist) as (keyof Influencer['onboarding_checklist'])[]) {
    keep.onboarding_checklist[key] ||= merge.onboarding_checklist[key]
  }
  const stageFrom = keep.stage
  if (stageRank(merge.stage) > stageRank(keep.stage)) keep.stage = merge.stage

  for (const c of db.calls) if (c.influencer_id === merge.id) c.influencer_id = keep.id
  for (const p of db.packages) if (p.influencer_id === merge.id) p.influencer_id = keep.id
  for (const a of db.activities) if (a.influencer_id === merge.id) a.influencer_id = keep.id
  invalidateEverOnboarded()
  moveDocuments(merge.id, keep.id)
  db.influencers = db.influencers.filter((i) => i.id !== merge.id)

  keep.updated_at = nowIso()
  refreshDerived(keep)
  const fields = (Object.keys(choices) as MergeField[]).filter(take)
  logActivity(keep.id, 'merged', {
    merged_id: merge.id,
    merged_name: merge.name,
    fields,
    ...(keep.stage !== stageFrom ? { stage_from: stageFrom, stage_to: keep.stage } : {}),
  })
  return keep
}
