import { TZDate, tzOffset } from '@date-fns/tz'
import { startOfMonth, startOfWeek } from 'date-fns'
import { http, HttpResponse } from 'msw'
import { ALL_STAGES, APP_TIMEZONE, PIPELINE_COLUMN_LIMIT, DEFAULT_CATEGORIES, ROLE_LABEL, SYNC_INTERVAL_OPTIONS } from '@/lib/constants'
import { todayKey } from '@/lib/format'
import { can } from '@/lib/permissions'
import { ONBOARDED_OR_LATER } from '@/lib/stages'
import type {
  Activity,
  Category,
  CategoryCreate,
  CategoryUpdate,
  DashboardSummary,
  Influencer,
  InstagramSettingsUpdate,
  Integrations,
  PipelineResponse,
  PoolSettings,
  Role,
  SavedView,
  SyncAllResult,
  SavedViewCreate,
  SavedViewUpdate,
  SyncIntervalHours,
  TeamMemberCreate,
  TeamMemberUpdate,
  User,
} from '@/types'
import { currentUser, db, everOnboarded, findInfluencer, nextId, noteChangedOnRead, nowIso, stageEnteredAt, toSummary, type StoredCategory } from '../db'
import { primaryAccount, toRef } from '@/lib/platforms'
import { dashboardExtras, onboardedOnlyExtras, utcIso } from '../dashboard'
import { connectedPlatforms, queueSync, switchToAutoSync } from '../social'
import { liveDocuments } from '../documents'
import { filterInfluencers, poolInfluencers, visibleInfluencers } from '../domain'
import { all, api, apiError, forbidden, notFound, readJson } from '../utils'
import { followUpBucket, isMine, withInfluencer } from './calls'

const ROLES = Object.keys(ROLE_LABEL) as Role[]
const isEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)

const withCount = (c: StoredCategory): Category => ({
  ...c,
  influencer_count: db.influencers.filter((i) => i.category === c.name).length,
})

/** Old default names → the agreed names (see DEFAULT_CATEGORIES). */
const LEGACY_RENAMES: Record<string, string> = { Tech: 'Tech & Gadgets', Fitness: 'Fitness & Lifestyle', Gaming: 'Gaming & Esports' }
const LEGACY_REMOVED = ['Other', 'Parenting']

/**
 * One-time move from the old default categories to DEFAULT_CATEGORIES, run when an admin lists categories (only
 * admins may write categories). Runs once per workspace: `settings/migrations` records it, so a category an admin
 * later names "Tech" or "Other" is left alone. Renames carry their influencers; "Other"/"Parenting" are deleted when
 * unused, else deactivated.
 */
function upgradeLegacyCategories() {
  if (db.migrations.categories_upgraded) return
  const has = (name: string) => db.categories.find((c) => c.name.toLowerCase() === name.toLowerCase())
  const renamePending = Object.keys(LEGACY_RENAMES).some((from) => db.categories.some((c) => c.name === from))
  const removalPending = LEGACY_REMOVED.some((n) => db.categories.some((c) => c.name === n && c.is_active))
  if (renamePending || removalPending) moveLegacyCategories(has)
  db.migrations = { ...db.migrations, categories_upgraded: true }
  // It runs inside a read (GET /categories): make sure the API server saves it.
  noteChangedOnRead()
}

function moveLegacyCategories(has: (name: string) => StoredCategory | undefined) {
  for (const [from, to] of Object.entries(LEGACY_RENAMES)) {
    const old = db.categories.find((c) => c.name === from)
    if (!old) continue
    const existing = has(to)
    // Both names exist (e.g. an admin already added the new one): merge the old category's influencers into it.
    const target = existing ? existing.name : to
    for (const inf of db.influencers) if (inf.category === from) inf.category = target
    if (existing) db.categories.splice(db.categories.indexOf(old), 1)
    else old.name = to
  }
  for (const name of DEFAULT_CATEGORIES) {
    if (!has(name)) db.categories.push({ id: nextId('cat'), name, is_active: true })
  }
  for (const name of LEGACY_REMOVED) {
    const c = db.categories.find((x) => x.name === name)
    if (!c) continue
    if (withCount(c).influencer_count === 0) db.categories.splice(db.categories.indexOf(c), 1)
    else c.is_active = false
  }
}

/** A member's location: trimmed text or null; false when it's too long or not text. */
function cleanLocation(value: unknown): string | null | false {
  if (value == null) return null
  if (typeof value !== 'string' || value.trim().length > 80) return false
  return value.trim() || null
}

/** The `n` newest activities, newest first, without sorting the whole log (ISO timestamps compare as strings). */
function newest(activities: Activity[], n: number): Activity[] {
  const top: Activity[] = []
  for (const a of activities) {
    if (top.length === n && a.created_at <= top[n - 1]!.created_at) continue
    let i = top.length
    while (i > 0 && top[i - 1]!.created_at < a.created_at) i--
    top.splice(i, 0, a)
    if (top.length > n) top.pop()
  }
  return top
}

export const workspaceHandlers = [
  http.get(api('/me'), async () => {
    return HttpResponse.json(currentUser())
  }),

  // ---- Team ---------------------------------------------------------------
  http.get(api('/team'), async () => {
    return HttpResponse.json(all(db.team))
  }),

  http.post(api('/team'), async ({ request }) => {
    if (!can(currentUser().role, 'team:manage')) return forbidden('Only admins can manage the team')
    const body = await readJson<TeamMemberCreate>(request)
    const email = body.email?.trim().toLowerCase() ?? ''
    if (!isEmail(email)) return apiError(422, 'validation_error', 'Enter a valid email')
    if (!ROLES.includes(body.role)) return apiError(422, 'validation_error', 'Choose a role')
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    if (!name) return apiError(422, 'validation_error', 'Enter a name')
    if (db.team.some((u) => !u.deleted_at && u.email.toLowerCase() === email)) return apiError(409, 'email_taken', 'A team member with this email exists')
    const location = cleanLocation(body.location)
    if (location === false) return apiError(422, 'validation_error', 'Location must be at most 80 characters')
    const user: User = { id: nextId('usr'), name, email, role: body.role, location, is_active: true, created_at: nowIso() }
    db.team.push(user)
    return HttpResponse.json(user, { status: 201 })
  }),

  http.patch(api('/team/:id'), async ({ params, request }) => {
    if (!can(currentUser().role, 'team:manage')) return forbidden('Only admins can manage the team')
    const user = db.team.find((u) => u.id === params.id && !u.deleted_at)
    if (!user) return notFound('Team member')
    const body = await readJson<TeamMemberUpdate>(request)
    if (body.role !== undefined && !ROLES.includes(body.role)) return apiError(422, 'validation_error', 'Choose a role')
    if (body.name !== undefined && !(typeof body.name === 'string' && body.name.trim())) return apiError(422, 'validation_error', 'Enter a name')
    const location = body.location === undefined ? undefined : cleanLocation(body.location)
    if (location === false) return apiError(422, 'validation_error', 'Location must be at most 80 characters')
    const demoting = body.role !== undefined && body.role !== user.role
    const deactivating = body.is_active === false && user.is_active
    if (user.id === currentUser().id && (demoting || deactivating)) {
      return apiError(422, 'self_change', 'You can’t change your own role or deactivate yourself')
    }
    // There must always be at least one active admin.
    if (user.role === 'admin' && user.is_active && (demoting || deactivating)) {
      const otherAdmins = db.team.filter((u) => u.id !== user.id && u.role === 'admin' && u.is_active).length
      if (otherAdmins === 0) return apiError(422, 'last_admin', 'There must be at least one active admin')
    }
    // Only these fields can change.
    if (body.name !== undefined) user.name = body.name.trim()
    if (body.role !== undefined) user.role = body.role
    if (location !== undefined) user.location = location
    if (typeof body.is_active === 'boolean') user.is_active = body.is_active
    return HttpResponse.json(user)
  }),

  // Deletes a deactivated member who owns no influencers. The record stays (marked deleted) so calls, packages and
  // activity still show who did them; it's hidden from the team list and can't be acted as or reactivated.
  http.delete(api('/team/:id'), async ({ params }) => {
    if (!can(currentUser().role, 'team:manage')) return forbidden('Only admins can manage the team')
    const user = db.team.find((u) => u.id === params.id && !u.deleted_at)
    if (!user) return notFound('Team member')
    if (user.id === currentUser().id) return apiError(422, 'self_change', 'You can’t delete yourself')
    if (user.is_active) return apiError(422, 'still_active', 'Deactivate this member before deleting them')
    const owned = db.influencers.filter((i) => i.assigned_to === user.id).length
    if (owned > 0) {
      return apiError(409, 'owns_influencers', `${user.name} still owns ${owned} influencer${owned === 1 ? '' : 's'}. Reassign or release them first.`)
    }
    user.deleted_at = nowIso()
    return new HttpResponse(null, { status: 204 })
  }),

  // ---- Categories ---------------------------------------------------------
  http.get(api('/categories'), async () => {
    if (can(currentUser().role, 'categories:manage')) upgradeLegacyCategories()
    return HttpResponse.json(all(db.categories.map(withCount)))
  }),

  http.delete(api('/categories/:id'), async ({ params }) => {
    if (!can(currentUser().role, 'categories:manage')) return forbidden('Only admins can manage categories')
    const index = db.categories.findIndex((c) => c.id === params.id)
    if (index === -1) return notFound('Category')
    const count = withCount(db.categories[index]!).influencer_count
    if (count > 0) return apiError(409, 'in_use', `Used by ${count} influencer${count === 1 ? '' : 's'}. Deactivate it instead.`)
    db.categories.splice(index, 1)
    return new HttpResponse(null, { status: 204 })
  }),

  http.post(api('/categories'), async ({ request }) => {
    if (!can(currentUser().role, 'categories:manage')) return forbidden('Only admins can manage categories')
    const name = (await readJson<CategoryCreate>(request)).name?.trim()
    if (!name) return apiError(422, 'validation_error', 'Name is required')
    if (db.categories.some((c) => c.name.toLowerCase() === name.toLowerCase())) {
      return apiError(409, 'name_taken', 'This category already exists')
    }
    const category: StoredCategory = { id: nextId('cat'), name, is_active: true }
    db.categories.push(category)
    return HttpResponse.json(withCount(category), { status: 201 })
  }),

  http.patch(api('/categories/:id'), async ({ params, request }) => {
    if (!can(currentUser().role, 'categories:manage')) return forbidden('Only admins can manage categories')
    const category = db.categories.find((c) => c.id === params.id)
    if (!category) return notFound('Category')
    const body = await readJson<CategoryUpdate>(request)
    const name = body.name?.trim()
    if (name !== undefined) {
      if (!name) return apiError(422, 'validation_error', 'Name is required')
      if (db.categories.some((c) => c.id !== category.id && c.name.toLowerCase() === name.toLowerCase())) {
        return apiError(409, 'name_taken', 'This category already exists')
      }
      for (const inf of db.influencers) if (inf.category === category.name) inf.category = name
      category.name = name
    }
    if (body.is_active !== undefined) category.is_active = body.is_active
    return HttpResponse.json(withCount(category))
  }),

  // ---- What the API server is connected to (everyone: it decides which options the screens offer) ----------
  http.get(api('/integrations'), async () => HttpResponse.json({ profile_lookup: connectedPlatforms() } satisfies Integrations)),

  // Admin "Sync profiles": every account on a connected platform to the background sync; typed-in ones switch to
  // auto-sync.
  http.post(api('/integrations/sync-all'), async () => {
    if (!can(currentUser().role, 'integrations:manage')) return forbidden('Only admins can sync every account')
    const connected = connectedPlatforms()
    if (!connected.length) return apiError(409, 'not_connected', 'Profile lookup isn’t connected')
    let switched = 0
    const accounts = db.influencers.flatMap((i) => i.accounts.filter((a) => connected.includes(a.platform)))
    for (const a of accounts) if (switchToAutoSync(a)) switched += 1
    const queued = queueSync(accounts)
    return HttpResponse.json({ queued, switched } satisfies SyncAllResult)
  }),

  // ---- Instagram integration settings -------------------------------------
  http.get(api('/settings/instagram'), async () => {
    if (!can(currentUser().role, 'integrations:manage')) return forbidden('Only admins can view integration settings')
    return HttpResponse.json(db.instagramSettings)
  }),

  http.patch(api('/settings/instagram'), async ({ request }) => {
    if (!can(currentUser().role, 'integrations:manage')) return forbidden('Only admins can change integration settings')
    const body = await readJson<Partial<InstagramSettingsUpdate>>(request)
    if (!SYNC_INTERVAL_OPTIONS.includes(body.sync_interval_hours as SyncIntervalHours)) {
      return apiError(422, 'validation_error', `Sync interval must be one of ${SYNC_INTERVAL_OPTIONS.join(', ')} hours`)
    }
    db.instagramSettings.sync_interval_hours = body.sync_interval_hours as SyncIntervalHours
    return HttpResponse.json(db.instagramSettings)
  }),

  // ---- Unassigned Pool guards ----------------------------------------------
  http.get(api('/settings/pool'), async () => {
    if (!can(currentUser().role, 'pool:configure')) return forbidden('Only admins can view pool settings')
    return HttpResponse.json(db.poolSettings)
  }),

  http.patch(api('/settings/pool'), async ({ request }) => {
    if (!can(currentUser().role, 'pool:configure')) return forbidden('Only admins can change pool settings')
    const body = await readJson<Partial<PoolSettings>>(request)
    const valid = (v: unknown, max: number) => v === null || (Number.isInteger(v) && (v as number) >= 1 && (v as number) <= max)
    if (body.claim_limit !== undefined && !valid(body.claim_limit, 500)) {
      return apiError(422, 'validation_error', 'Claim limit must be a whole number from 1 to 500, or off')
    }
    if (body.auto_release_days !== undefined && !valid(body.auto_release_days, 90)) {
      return apiError(422, 'validation_error', 'Auto-release must be 1 to 90 days, or off')
    }
    if (body.claim_limit !== undefined) db.poolSettings.claim_limit = body.claim_limit
    if (body.auto_release_days !== undefined) db.poolSettings.auto_release_days = body.auto_release_days
    return HttpResponse.json(db.poolSettings)
  }),

  // ---- Saved views --------------------------------------------------------
  http.get(api('/saved-views'), async () => {
    return HttpResponse.json(all(db.savedViews))
  }),

  http.post(api('/saved-views'), async ({ request }) => {
    const body = await readJson<SavedViewCreate>(request)
    const name = body.name?.trim()
    if (!name) return apiError(422, 'validation_error', 'Name is required')
    const view: SavedView = {
      id: nextId('view'),
      name,
      filters: body.filters ?? {},
      sort: body.sort ?? null,
      created_by: currentUser().id,
      created_at: nowIso(),
    }
    db.savedViews.push(view)
    return HttpResponse.json(view, { status: 201 })
  }),

  // Rename and/or replace the filters and sort. Same rule as delete: executives edit only their own views.
  http.patch(api('/saved-views/:id'), async ({ params, request }) => {
    const view = db.savedViews.find((v) => v.id === params.id)
    if (!view) return notFound('Saved view')
    const user = currentUser()
    if (view.created_by !== user.id && user.role === 'executive') {
      return forbidden('You can only edit your own saved views')
    }
    const body = await readJson<SavedViewUpdate>(request)
    if (body.name !== undefined) {
      const name = body.name?.trim()
      if (!name) return apiError(422, 'validation_error', 'Name is required')
      view.name = name
    }
    if (body.filters !== undefined) view.filters = body.filters ?? {}
    if (body.sort !== undefined) view.sort = body.sort ?? null
    return HttpResponse.json(view)
  }),

  http.delete(api('/saved-views/:id'), async ({ params }) => {
    const index = db.savedViews.findIndex((v) => v.id === params.id)
    if (index === -1) return notFound('Saved view')
    const user = currentUser()
    if (db.savedViews[index].created_by !== user.id && user.role === 'executive') {
      return forbidden('You can only delete your own saved views')
    }
    db.savedViews.splice(index, 1)
    return new HttpResponse(null, { status: 204 })
  }),

  // ---- Pipeline & dashboard -----------------------------------------------
  http.get(api('/pipeline'), async ({ request }) => {
    const params = new URL(request.url).searchParams
    params.delete('stage') // every column is always returned
    const list = filterInfluencers(params, visibleInfluencers())
    // Calendar days in Asia/Kolkata (no daylight saving, so one offset holds); date-fns per card costs ~1 s at 100k.
    const offset = tzOffset(APP_TIMEZONE, new Date()) * 60_000
    const dayOf = (ms: number) => Math.floor((ms + offset) / 86_400_000)
    const today = dayOf(Date.now())
    const byStage = new Map(ALL_STAGES.map((stage) => [stage, [] as { i: Influencer; days: number }[]]))
    for (const i of list) byStage.get(i.stage)?.push({ i, days: Math.max(0, today - dayOf(Date.parse(stageEnteredAt(i)))) })
    const body: PipelineResponse = {
      columns: ALL_STAGES.map((stage) => {
        const inStage = byStage.get(stage)!.sort((a, b) => b.days - a.days)
        // A column shows its longest-waiting cards; `count` is the whole column (filters narrow it).
        const items = inStage.slice(0, PIPELINE_COLUMN_LIMIT).map(({ i, days }) => {
          const primary = primaryAccount(i)
          return {
            id: i.id,
            name: i.name,
            primary_account: primary ? toRef(primary) : null,
            profile_pic_url: i.profile_pic_url,
            total_reach: i.total_reach,
            category: i.category,
            assigned_to: i.assigned_to,
            stage: i.stage,
            days_in_stage: days,
            ever_onboarded: everOnboarded(i),
          }
        })
        return { stage, count: inStage.length, items }
      }),
    }
    return HttpResponse.json(body)
  }),

  // Executives' figures cover only their own influencers (and they have no pool: its count is 0).
  http.get(api('/dashboard/summary'), async () => {
    const user = currentUser()
    const me = user.id
    const influencers = visibleInfluencers(user)
    // Admins and managers see everyone: no per-record visibility check or copies of the logs (NFR-01).
    const seesAll = influencers.length === db.influencers.length
    const visibleIds = seesAll ? null : new Set(influencers.map((i) => i.id))
    const visible = (influencerId: string) => !visibleIds || visibleIds.has(influencerId)
    const withAgreement = new Set(liveDocuments().filter((d) => d.type === 'agreement' && d.is_current).map((d) => d.influencer_id))
    const activities = seesAll ? db.activities : db.activities.filter((a) => visible(a.influencer_id))
    const calls = seesAll ? db.calls : db.calls.filter((c) => visible(c.influencer_id))
    const today = todayKey()
    const now = new TZDate(Date.now(), APP_TIMEZONE)
    const weekStart = utcIso(startOfWeek(now, { weekStartsOn: 1 }))
    const monthStart = utcIso(startOfMonth(now))
    // Stage moves this month (week starts can fall in the month before, so from whichever is earlier).
    const since = weekStart < monthStart ? weekStart : monthStart
    const recentMoves = activities.filter((a) => a.created_at >= since && a.type === 'stage_changed')
    const movedTo = (stage: string, from: string) =>
      new Set(recentMoves.filter((a) => a.payload.to === stage && a.created_at >= from).map((a) => a.influencer_id)).size

    const tally = (key: (i: (typeof db.influencers)[number]) => string | null) => {
      const counts = new Map<string, number>()
      for (const inf of influencers) {
        const k = key(inf)
        if (k) counts.set(k, (counts.get(k) ?? 0) + 1)
      }
      return [...counts.entries()].sort((a, b) => b[1] - a[1])
    }

    const openFollowUps = calls.filter((c) => {
      const bucket = followUpBucket(c, today)
      return bucket === 'today' || bucket === 'overdue'
    })
    const mine = openFollowUps
      .filter((c) => isMine(c, me))
      .sort((a, b) => a.follow_up_date!.localeCompare(b.follow_up_date!))

    const body: DashboardSummary = {
      kpis: {
        total: influencers.length,
        pool: can(user.role, 'pool:view') ? poolInfluencers().length : 0,
        claimed_this_week:
          user.role === 'executive'
            ? null
            : db.activities.filter((a) => a.type === 'claimed' && a.created_at >= weekStart).length,
        contacted_this_week: movedTo('contacted', weekStart),
        onboarded_this_month: movedTo('onboarded', monthStart),
        packages_in_transit: db.packages.filter(
          (p) => visible(p.influencer_id) && (p.status === 'sent' || p.status === 'in_transit'),
        ).length,
        follow_ups_today: calls.filter((c) => followUpBucket(c, today) === 'today').length,
        onboarded_without_agreement: influencers.filter(
          (i) => ONBOARDED_OR_LATER.includes(i.stage) && i.assigned_to !== null && !withAgreement.has(i.id),
        ).length,
      },
      funnel: ALL_STAGES.map((stage) => ({ stage, count: influencers.filter((i) => i.stage === stage).length })),
      by_category: tally((i) => i.category).map(([category, count]) => ({ category, count })),
      top_cities: tally((i) => i.city)
        .slice(0, 10)
        .map(([city, count]) => ({ city, count })),
      my_follow_ups: withInfluencer(mine).slice(0, 10),
      // `activities` holds only influencers that exist (`visible`), so the newest 20 are the 20 shown. Admins only.
      recent_activity: can(user.role, 'activity:view')
        ? newest(activities, 20).map((a) => ({ ...a, influencer: toSummary(findInfluencer(a.influencer_id)!) }))
        : [],
      ...dashboardExtras(
        influencers,
        activities,
        calls,
        db.packages.filter((p) => visible(p.influencer_id)),
        can(user.role, 'influencer:reassign'),
      ),
    }
    if (user.role === 'brand_specialist') {
      // Onboarded numbers only (`influencers` is already limited to onboarded creators): no pool, pipeline,
      // follow-ups, Welcome Kits, documents or activity.
      return HttpResponse.json({
        kpis: {
          ...body.kpis,
          pool: 0,
          claimed_this_week: null,
          contacted_this_week: 0,
          packages_in_transit: 0,
          follow_ups_today: 0,
          onboarded_without_agreement: 0,
        },
        funnel: [],
        by_category: body.by_category,
        top_cities: body.top_cities,
        my_follow_ups: [],
        recent_activity: [],
        ...onboardedOnlyExtras(body),
      } satisfies DashboardSummary)
    }
    return HttpResponse.json(body)
  }),
]
