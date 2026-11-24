import { TZDate, tzOffset } from '@date-fns/tz'
import { startOfMonth, startOfWeek } from 'date-fns'
import { APP_TIMEZONE, CALL_OUTCOMES, PACKAGE_STATUSES } from '@/lib/constants'
import { PLATFORMS, primaryAccount, toRef } from '@/lib/platforms'
import { ONBOARDED_OR_LATER } from '@/lib/stages'
import type { Activity, CallLog, DashboardSummary, Influencer, Package } from '@/types'
import { db } from './db'

/** Follower-size bands for the dashboard, smallest first (total followers across platforms). */
export const FOLLOWER_BANDS: { label: string; min: number }[] = [
  { label: 'Under 10K', min: 0 },
  { label: '10K–50K', min: 10_000 },
  { label: '50K–100K', min: 50_000 },
  { label: '100K–500K', min: 100_000 },
  { label: '500K+', min: 500_000 },
]

/**
 * An instant as stored timestamps are written (UTC, `…Z`), so the two compare as strings. A TZDate's own
 * toISOString keeps its offset (`…+05:30`), which compares wrongly against stored times.
 */
export const utcIso = (d: Date) => new Date(d.getTime()).toISOString()

const DAY_MS = 86_400_000
const WEEKS = 12
const DAYS = 30

type Extras = Pick<
  DashboardSummary,
  | 'onboarded_by_week'
  | 'calls_by_day'
  | 'by_platform'
  | 'follower_bands'
  | 'packages_by_status'
  | 'call_outcomes_30d'
  | 'team'
  | 'recently_onboarded'
>

/**
 * The dashboard's trends, breakdowns and tables, over what this user can see (`influencers`, and the activities,
 * calls and Welcome Kits of those influencers). Weeks start Monday and days are calendar days, both in Asia/Kolkata.
 * `team` is only for members who can reassign (managers, admins); null otherwise.
 */
export function dashboardExtras(
  influencers: Influencer[],
  activities: Activity[],
  calls: CallLog[],
  packages: Package[],
  showTeam: boolean,
): Extras {
  const now = new TZDate(Date.now(), APP_TIMEZONE)
  const onboardedMoves = activities.filter((a) => a.type === 'stage_changed' && a.payload.to === 'onboarded')

  // Calendar days in Asia/Kolkata, as day numbers: it has no daylight saving, so one offset holds, and plain arithmetic
  // replaces a time-zone conversion per record (seconds at 100,000 influencers).
  const offset = tzOffset(APP_TIMEZONE, now) * 60_000
  const dayNo = (iso: string) => Math.floor((Date.parse(iso) + offset) / DAY_MS)
  const keyOf = (day: number) => new Date(day * DAY_MS).toISOString().slice(0, 10)
  // 1 Jan 1970 was a Thursday: Monday-based weekday = (day + 3) % 7.
  const mondayOf = (day: number) => day - ((day + 3) % 7)
  const today = dayNo(new Date().toISOString())

  // Onboarded per week: the last 12 weeks, oldest first, counting each move onto Onboarded.
  const firstWeek = mondayOf(today) - 7 * (WEEKS - 1)
  const weekKeys = Array.from({ length: WEEKS }, (_, i) => keyOf(firstWeek + 7 * i))
  // Counted by day number, not by a date key per record (NFR-01: a Date and a string each, at 100,000 records).
  const weekCounts = new Array<number>(WEEKS).fill(0)
  for (const a of onboardedMoves) {
    const w = (mondayOf(dayNo(a.created_at)) - firstWeek) / 7
    if (w >= 0 && w < WEEKS) weekCounts[w] += 1
  }
  const perWeek = new Map(weekKeys.map((k, i) => [k, weekCounts[i]!]))

  // Calls per day: the last 30 days, oldest first.
  const firstDay = today - (DAYS - 1)
  const dayKeys = Array.from({ length: DAYS }, (_, i) => keyOf(firstDay + i))
  const dayCounts = new Array<number>(DAYS).fill(0)
  for (const c of calls) {
    const d = dayNo(c.created_at) - firstDay
    if (d >= 0 && d < DAYS) dayCounts[d] += 1
  }
  const perDay = new Map(dayKeys.map((k, i) => [k, dayCounts[i]!]))
  const firstDayIso = new Date(firstDay * DAY_MS - offset).toISOString()
  const since30 = firstDayIso

  const bandOf = (reach: number) => {
    let band = FOLLOWER_BANDS[0].label
    for (const b of FOLLOWER_BANDS) if (reach >= b.min) band = b.label
    return band
  }
  const bands = new Map(FOLLOWER_BANDS.map((b) => [b.label, 0]))
  for (const inf of influencers) {
    if (inf.total_reach != null) bands.set(bandOf(inf.total_reach), bands.get(bandOf(inf.total_reach))! + 1)
  }

  const monthStart = utcIso(startOfMonth(now))
  const weekStart = utcIso(startOfWeek(now, { weekStartsOn: 1 }))
  const byId = new Map(influencers.map((i) => [i.id, i]))

  // One pass over each list instead of one per platform or team member.
  const perPlatform = new Map<string, number>()
  for (const inf of influencers) {
    const platforms = inf.accounts.length === 1 ? [inf.accounts[0]!.platform] : new Set(inf.accounts.map((a) => a.platform))
    for (const platform of platforms) perPlatform.set(platform, (perPlatform.get(platform) ?? 0) + 1)
  }
  const members = new Map<string, { owned: number; calls: number; onboarded: number; kits: number }>()
  const perMember = (id: string) => {
    let m = members.get(id)
    if (!m) members.set(id, (m = { owned: 0, calls: 0, onboarded: 0, kits: 0 }))
    return m
  }
  const ownerOf = new Map<string, string>()
  if (showTeam) {
    for (const inf of db.influencers) {
      if (!inf.assigned_to) continue
      perMember(inf.assigned_to).owned += 1
      ownerOf.set(inf.id, inf.assigned_to)
    }
    for (const c of db.calls) if (c.created_at >= weekStart) perMember(c.called_by).calls += 1
    for (const a of db.activities) {
      if (a.actor && a.type === 'stage_changed' && a.payload.to === 'onboarded' && a.created_at >= monthStart) perMember(a.actor).onboarded += 1
    }
    for (const p of db.packages) {
      const owner = ownerOf.get(p.influencer_id)
      if (owner && p.sent_at && p.sent_at >= monthStart) perMember(owner).kits += 1
    }
  }

  // Latest move onto Onboarded per creator still onboarded or later, newest first.
  const lastOnboarded = new Map<string, string>()
  for (const a of onboardedMoves) {
    if ((lastOnboarded.get(a.influencer_id) ?? '') < a.created_at) lastOnboarded.set(a.influencer_id, a.created_at)
  }
  const recently = [...lastOnboarded.entries()]
    .flatMap(([id, at]) => {
      const inf = byId.get(id)
      return inf && ONBOARDED_OR_LATER.includes(inf.stage) ? [{ inf, at }] : []
    })
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 10)

  return {
    onboarded_by_week: weekKeys.map((week_start) => ({ week_start, count: perWeek.get(week_start)! })),
    calls_by_day: dayKeys.map((day) => ({ day, count: perDay.get(day)! })),
    by_platform: PLATFORMS.map((platform) => ({ platform, count: perPlatform.get(platform) ?? 0 }))
      .filter((p) => p.count > 0)
      .sort((a, b) => b.count - a.count),
    follower_bands: FOLLOWER_BANDS.map((b) => ({ band: b.label, count: bands.get(b.label)! })),
    packages_by_status: PACKAGE_STATUSES.map((status) => ({ status, count: packages.filter((p) => p.status === status).length })),
    call_outcomes_30d: CALL_OUTCOMES.map((outcome) => ({
      outcome,
      count: calls.filter((c) => c.outcome === outcome && c.created_at >= since30).length,
    })),
    team: showTeam
      ? db.team
          .filter((m) => m.is_active && m.role !== 'brand_specialist')
          .map((m) => ({
            user_id: m.id,
            name: m.name,
            role: m.role,
            owned: perMember(m.id).owned,
            calls_this_week: perMember(m.id).calls,
            onboarded_this_month: perMember(m.id).onboarded,
            kits_sent_this_month: perMember(m.id).kits,
          }))
          .sort((a, b) => b.onboarded_this_month - a.onboarded_this_month || b.calls_this_week - a.calls_this_week || a.name.localeCompare(b.name))
      : null,
    recently_onboarded: recently.map(({ inf, at }) => {
      const primary = primaryAccount(inf)
      return {
        id: inf.id,
        name: inf.name,
        profile_pic_url: inf.profile_pic_url,
        primary_account: primary ? toRef(primary) : null,
        platforms: inf.accounts.map((a) => a.platform),
        total_reach: inf.total_reach,
        category: inf.category,
        city: inf.city,
        onboarded_at: at,
      }
    }),
  }
}

/** What a viewer without CRM access (a Brand Specialist) gets of the extras: onboarded-only parts. */
export function onboardedOnlyExtras(extras: Extras): Extras {
  return {
    ...extras,
    calls_by_day: [],
    packages_by_status: [],
    call_outcomes_30d: [],
    team: null,
  }
}
