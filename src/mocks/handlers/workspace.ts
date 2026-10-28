import { TZDate } from '@date-fns/tz'
import { differenceInCalendarDays, startOfMonth, startOfWeek } from 'date-fns'
import { http, HttpResponse } from 'msw'
import { ALL_STAGES, APP_TIMEZONE, ROLE_LABEL, SYNC_INTERVAL_OPTIONS } from '@/lib/constants'
import { can } from '@/lib/permissions'
import type {
  Category,
  CategoryCreate,
  CategoryUpdate,
  DashboardSummary,
  InstagramSettingsUpdate,
  PipelineResponse,
  Role,
  SavedView,
  SavedViewCreate,
  SyncIntervalHours,
  TeamMemberCreate,
  TeamMemberUpdate,
  User,
} from '@/types'
import { currentUser, db, findInfluencer, nextId, nowIso, stageEnteredAt, toSummary, type StoredCategory } from '../db'
import { filterInfluencers } from '../domain'
import { all, api, apiError, forbidden, latency, notFound, readJson } from '../utils'
import { followUpBucket, isMine, withInfluencer } from './calls'

const ROLES = Object.keys(ROLE_LABEL) as Role[]
const isEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)

/** "priya.nair@x.com" → "Priya Nair" */
const nameFromEmail = (email: string) =>
  email
    .split('@')[0]!
    .split(/[._-]+/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ')

const withCount = (c: StoredCategory): Category => ({
  ...c,
  influencer_count: db.influencers.filter((i) => i.category === c.name).length,
})

export const workspaceHandlers = [
  http.get(api('/me'), async () => {
    await latency()
    return HttpResponse.json(currentUser())
  }),

  // ---- Team ---------------------------------------------------------------
  http.get(api('/team'), async () => {
    await latency()
    return HttpResponse.json(all(db.team))
  }),

  http.post(api('/team'), async ({ request }) => {
    await latency()
    if (!can(currentUser().role, 'team:manage')) return forbidden('Only admins can manage the team')
    const body = await readJson<TeamMemberCreate>(request)
    const email = body.email?.trim().toLowerCase() ?? ''
    if (!isEmail(email)) return apiError(422, 'validation_error', 'Enter a valid email')
    if (!ROLES.includes(body.role)) return apiError(422, 'validation_error', 'Choose a role')
    if (db.team.some((u) => u.email === email)) return apiError(409, 'email_taken', 'A team member with this email exists')
    const name = body.name?.trim() || nameFromEmail(email)
    const user: User = { id: nextId('usr'), name, email, role: body.role, is_active: true, created_at: nowIso() }
    db.team.push(user)
    return HttpResponse.json(user, { status: 201 })
  }),

  http.patch(api('/team/:id'), async ({ params, request }) => {
    await latency()
    if (!can(currentUser().role, 'team:manage')) return forbidden('Only admins can manage the team')
    const user = db.team.find((u) => u.id === params.id)
    if (!user) return notFound('Team member')
    const body = await readJson<TeamMemberUpdate>(request)
    if (body.role !== undefined && !ROLES.includes(body.role)) return apiError(422, 'validation_error', 'Choose a role')
    const demoting = body.role !== undefined && body.role !== user.role
    const deactivating = body.is_active === false && user.is_active
    if (user.id === db.currentUserId && (demoting || deactivating)) {
      return apiError(422, 'self_change', 'You can’t change your own role or deactivate yourself')
    }
    // There must always be at least one active admin.
    if (user.role === 'admin' && user.is_active && (demoting || deactivating)) {
      const otherAdmins = db.team.filter((u) => u.id !== user.id && u.role === 'admin' && u.is_active).length
      if (otherAdmins === 0) return apiError(422, 'last_admin', 'There must be at least one active admin')
    }
    Object.assign(user, body)
    return HttpResponse.json(user)
  }),

  // ---- Categories ---------------------------------------------------------
  http.get(api('/categories'), async () => {
    await latency()
    return HttpResponse.json(all(db.categories.map(withCount)))
  }),

  http.delete(api('/categories/:id'), async ({ params }) => {
    await latency()
    if (!can(currentUser().role, 'categories:manage')) return forbidden('Only admins can manage categories')
    const index = db.categories.findIndex((c) => c.id === params.id)
    if (index === -1) return notFound('Category')
    const count = withCount(db.categories[index]!).influencer_count
    if (count > 0) return apiError(409, 'in_use', `Used by ${count} influencer${count === 1 ? '' : 's'}. Deactivate it instead.`)
    db.categories.splice(index, 1)
    return new HttpResponse(null, { status: 204 })
  }),

  http.post(api('/categories'), async ({ request }) => {
    await latency()
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
    await latency()
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

  // ---- Instagram integration settings -------------------------------------
  http.get(api('/settings/instagram'), async () => {
    await latency()
    if (!can(currentUser().role, 'integrations:manage')) return forbidden('Only admins can view integration settings')
    return HttpResponse.json(db.instagramSettings)
  }),

  http.patch(api('/settings/instagram'), async ({ request }) => {
    await latency()
    if (!can(currentUser().role, 'integrations:manage')) return forbidden('Only admins can change integration settings')
    const body = await readJson<Partial<InstagramSettingsUpdate>>(request)
    if (!SYNC_INTERVAL_OPTIONS.includes(body.sync_interval_hours as SyncIntervalHours)) {
      return apiError(422, 'validation_error', `Sync interval must be one of ${SYNC_INTERVAL_OPTIONS.join(', ')} hours`)
    }
    db.instagramSettings.sync_interval_hours = body.sync_interval_hours as SyncIntervalHours
    return HttpResponse.json(db.instagramSettings)
  }),

  // ---- Saved views --------------------------------------------------------
  http.get(api('/saved-views'), async () => {
    await latency()
    return HttpResponse.json(all(db.savedViews))
  }),

  http.post(api('/saved-views'), async ({ request }) => {
    await latency()
    const body = await readJson<SavedViewCreate>(request)
    const name = body.name?.trim()
    if (!name) return apiError(422, 'validation_error', 'Name is required')
    const view: SavedView = {
      id: nextId('view'),
      name,
      filters: body.filters ?? {},
      sort: body.sort ?? null,
      created_by: db.currentUserId,
      created_at: nowIso(),
    }
    db.savedViews.push(view)
    return HttpResponse.json(view, { status: 201 })
  }),

  http.delete(api('/saved-views/:id'), async ({ params }) => {
    await latency()
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
    await latency()
    const params = new URL(request.url).searchParams
    params.delete('stage') // every column is always returned
    const list = filterInfluencers(params)
    const now = new Date()
    const body: PipelineResponse = {
      columns: ALL_STAGES.map((stage) => {
        const items = list
          .filter((i) => i.stage === stage)
          .map((i) => ({
            id: i.id,
            name: i.name,
            instagram_handle: i.instagram_handle,
            profile_pic_url: i.profile_pic_url,
            followers: i.followers,
            category: i.category,
            assigned_to: i.assigned_to,
            stage: i.stage,
            days_in_stage: Math.max(0, differenceInCalendarDays(now, new Date(stageEnteredAt(i)))),
          }))
          .sort((a, b) => b.days_in_stage - a.days_in_stage)
        return { stage, count: items.length, items }
      }),
    }
    return HttpResponse.json(body)
  }),

  http.get(api('/dashboard/summary'), async () => {
    await latency()
    const me = db.currentUserId
    const now = new TZDate(Date.now(), APP_TIMEZONE)
    const weekStart = startOfWeek(now, { weekStartsOn: 1 }).toISOString()
    const monthStart = startOfMonth(now).toISOString()
    const movedTo = (stage: string, since: string) =>
      new Set(
        db.activities
          .filter((a) => a.type === 'stage_changed' && a.payload.to === stage && a.created_at >= since)
          .map((a) => a.influencer_id),
      ).size

    const tally = (key: (i: (typeof db.influencers)[number]) => string | null) => {
      const counts = new Map<string, number>()
      for (const inf of db.influencers) {
        const k = key(inf)
        if (k) counts.set(k, (counts.get(k) ?? 0) + 1)
      }
      return [...counts.entries()].sort((a, b) => b[1] - a[1])
    }

    const openFollowUps = db.calls.filter((c) => {
      const bucket = followUpBucket(c)
      return bucket === 'today' || bucket === 'overdue'
    })
    const mine = openFollowUps
      .filter((c) => isMine(c, me))
      .sort((a, b) => a.follow_up_date!.localeCompare(b.follow_up_date!))

    const body: DashboardSummary = {
      kpis: {
        total: db.influencers.length,
        contacted_this_week: movedTo('contacted', weekStart),
        onboarded_this_month: movedTo('onboarded', monthStart),
        packages_in_transit: db.packages.filter((p) => p.status === 'sent' || p.status === 'in_transit').length,
        follow_ups_today: db.calls.filter((c) => followUpBucket(c) === 'today').length,
      },
      funnel: ALL_STAGES.map((stage) => ({ stage, count: db.influencers.filter((i) => i.stage === stage).length })),
      by_category: tally((i) => i.category).map(([category, count]) => ({ category, count })),
      top_cities: tally((i) => i.city)
        .slice(0, 10)
        .map(([city, count]) => ({ city, count })),
      my_follow_ups: withInfluencer(mine).slice(0, 10),
      recent_activity: [...db.activities]
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .flatMap((a) => {
          const inf = findInfluencer(a.influencer_id)
          return inf ? [{ ...a, influencer: toSummary(inf) }] : []
        })
        .slice(0, 20),
    }
    return HttpResponse.json(body)
  }),
]
