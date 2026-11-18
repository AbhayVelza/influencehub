import { TZDate } from '@date-fns/tz'
import { addDays, addWeeks, startOfDay, startOfMonth, startOfWeek } from 'date-fns'
import { APP_TIMEZONE, CALL_OUTCOMES, PACKAGE_STATUSES } from '@/lib/constants'
import { dayKey } from '@/lib/format'
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

  // Onboarded per week: the last 12 weeks, oldest first, counting each move onto Onboarded.
  const firstWeek = addWeeks(startOfWeek(now, { weekStartsOn: 1 }), -(WEEKS - 1))
  const weekKeys = Array.from({ length: WEEKS }, (_, i) => dayKey(addWeeks(firstWeek, i).toISOString()))
  const weekOf = (iso: string) => dayKey(startOfWeek(new TZDate(iso, APP_TIMEZONE), { weekStartsOn: 1 }).toISOString())
  const perWeek = new Map(weekKeys.map((k) => [k, 0]))
  for (const a of onboardedMoves) {
    const k = weekOf(a.created_at)
    if (perWeek.has(k)) perWeek.set(k, perWeek.get(k)! + 1)
  }

  // Calls per day: the last 30 days, oldest first.
  const firstDay = addDays(startOfDay(now), -(DAYS - 1))
  const dayKeys = Array.from({ length: DAYS }, (_, i) => dayKey(addDays(firstDay, i).toISOString()))
  const perDay = new Map(dayKeys.map((k) => [k, 0]))
  for (const c of calls) {
    const k = dayKey(c.created_at)
    if (perDay.has(k)) perDay.set(k, perDay.get(k)! + 1)
  }
  const since30 = firstDay.toISOString()

  const bandOf = (reach: number) => {
    let band = FOLLOWER_BANDS[0].label
    for (const b of FOLLOWER_BANDS) if (reach >= b.min) band = b.label
    return band
  }
  const bands = new Map(FOLLOWER_BANDS.map((b) => [b.label, 0]))
  for (const inf of influencers) {
    if (inf.total_reach != null) bands.set(bandOf(inf.total_reach), bands.get(bandOf(inf.total_reach))! + 1)
  }

  const monthStart = startOfMonth(now).toISOString()
  const weekStart = startOfWeek(now, { weekStartsOn: 1 }).toISOString()
  const byId = new Map(influencers.map((i) => [i.id, i]))

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
    by_platform: PLATFORMS.map((platform) => ({
      platform,
      count: influencers.filter((i) => i.accounts.some((a) => a.platform === platform)).length,
    }))
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
          .map((m) => {
            const owned = new Set(db.influencers.filter((i) => i.assigned_to === m.id).map((i) => i.id))
            return {
              user_id: m.id,
              name: m.name,
              role: m.role,
              owned: owned.size,
              calls_this_week: db.calls.filter((c) => c.called_by === m.id && c.created_at >= weekStart).length,
              onboarded_this_month: db.activities.filter(
                (a) => a.actor === m.id && a.type === 'stage_changed' && a.payload.to === 'onboarded' && a.created_at >= monthStart,
              ).length,
              kits_sent_this_month: db.packages.filter((p) => owned.has(p.influencer_id) && !!p.sent_at && p.sent_at >= monthStart)
                .length,
            }
          })
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
