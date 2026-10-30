import { PIPELINE_STAGES } from '@/lib/constants'
import { findLinkedAccounts, PLATFORM_META, primaryAccount, toRef } from '@/lib/platforms'
import { normalizePhone } from '@/lib/schemas'
import type { DuplicateCheckRequest, DuplicateMatch, DuplicatePair, Influencer, MatchConfidence, MergeField, MergeRequest, User } from '@/types'
import { currentUser, db, logActivity, nowIso, refreshDerived } from './db'
import { canSee } from './domain'
import { moveDocuments } from './documents'

// Cross-platform duplicate detection and merging (see "Duplicates & merge" in CLAUDE.md).

const RANK: Record<MatchConfidence, number> = { high: 3, medium: 2, low: 1 }

function levenshtein(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]!
    row[0] = i
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j]!
      row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1))
      prev = tmp
    }
  }
  return row[b.length]!
}

/**
 * Names compared trimmed and lowercased: at most 1 edit (Levenshtein) when the shorter one has ≤6 characters,
 * at most 2 otherwise. Empty names never match. The backend uses this exact rule (CLAUDE.md, duplicate detection).
 */
export function similarNames(a: string, b: string): boolean {
  const x = a.trim().toLowerCase()
  const y = b.trim().toLowerCase()
  if (!x || !y) return false
  return levenshtein(x, y) <= (Math.min(x.length, y.length) <= 6 ? 1 : 2)
}

type Candidate = DuplicateCheckRequest

const fromInfluencer = (inf: Influencer): Candidate => ({
  name: inf.name,
  email: inf.email,
  phone: inf.phone,
  city: inf.city,
  accounts: inf.accounts.map((a) => ({ platform: a.platform, handle: a.handle, bio: a.bio, links: a.links })),
})

/** Every signal between a candidate and one existing influencer, strongest confidence wins. */
function compare(c: Candidate, inf: Influencer): { confidence: MatchConfidence; reasons: string[] } | null {
  const found: { confidence: MatchConfidence; reason: string }[] = []
  const add = (confidence: MatchConfidence, reason: string) => {
    if (!found.some((f) => f.reason === reason)) found.push({ confidence, reason })
  }
  const label = (p: keyof typeof PLATFORM_META) => PLATFORM_META[p].label

  if (c.email && inf.email && c.email.trim().toLowerCase() === inf.email) add('high', 'Same email')
  const phone = normalizePhone(c.phone)
  if (phone && inf.phone && phone === inf.phone) add('high', 'Same phone number')

  // Handles / URLs mentioned in the other side's bio or links.
  for (const ia of inf.accounts) {
    for (const linked of findLinkedAccounts([ia.bio, ...ia.links])) {
      if (c.accounts.some((ca) => ca.platform === linked.platform && ca.handle === linked.handle)) {
        add('high', `Their ${label(ia.platform)} bio links to ${label(linked.platform)} @${linked.handle}`)
      }
    }
  }
  for (const ca of c.accounts) {
    for (const linked of findLinkedAccounts([ca.bio, ...(ca.links ?? [])])) {
      if (inf.accounts.some((ia) => ia.platform === linked.platform && ia.handle === linked.handle)) {
        add('high', `The ${label(ca.platform)} bio links to their ${label(linked.platform)} @${linked.handle}`)
      }
    }
  }

  for (const ca of c.accounts) {
    for (const ia of inf.accounts) {
      if (ca.handle !== ia.handle) continue
      if (ca.platform === ia.platform) add('high', `Same ${label(ia.platform)} account @${ia.handle}`)
      else add('medium', `Same handle @${ia.handle} on ${label(ca.platform)} and ${label(ia.platform)}`)
    }
  }

  if (c.name && c.city && inf.city && c.city.trim().toLowerCase() === inf.city.trim().toLowerCase() && similarNames(c.name, inf.name)) {
    add('low', `Similar name in the same city (${inf.city})`)
  }

  if (!found.length) return null
  found.sort((a, b) => RANK[b.confidence] - RANK[a.confidence])
  return { confidence: found[0]!.confidence, reasons: found.map((f) => f.reason) }
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
