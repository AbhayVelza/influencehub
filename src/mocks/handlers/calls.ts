import { http, HttpResponse } from 'msw'
import { dayKey, todayKey } from '@/lib/format'
import type { CallLog, CallLogWithInfluencer, FollowUpBucket } from '@/types'
import { currentUser, db, findInfluencer, toSummary } from '../db'
import { findVisible } from '../domain'
import { api, latency, notFound, paginate } from '../utils'

export function followUpBucket(call: CallLog, today = todayKey()): Exclude<FollowUpBucket, 'history'> | null {
  if (!call.follow_up_date || call.follow_up_done) return null
  const day = dayKey(call.follow_up_date)
  return day < today ? 'overdue' : day === today ? 'today' : 'upcoming'
}

/** A call is "mine" if I made it or I own the influencer. */
export function isMine(call: CallLog, userId: string): boolean {
  return call.called_by === userId || findInfluencer(call.influencer_id)?.assigned_to === userId
}

export function withInfluencer(calls: CallLog[]): CallLogWithInfluencer[] {
  return calls.flatMap((c) => {
    const inf = findInfluencer(c.influencer_id)
    return inf ? [{ ...c, influencer: toSummary(inf) }] : []
  })
}

export const callHandlers = [
  http.get(api('/calls/follow-ups'), async ({ request }) => {
    await latency()
    const params = new URL(request.url).searchParams
    const bucket = (params.get('bucket') ?? 'today') as FollowUpBucket
    const today = todayKey()
    const user = currentUser()
    // Only calls on influencers I can see (executives: my own); mine = calls I made, or on influencers I own.
    const visible = db.calls.filter((c) => findVisible(c.influencer_id, user))
    const scoped = params.get('mine') === 'true' ? visible.filter((c) => isMine(c, user.id)) : visible

    const list =
      bucket === 'history'
        ? [...scoped].sort((a, b) => b.created_at.localeCompare(a.created_at))
        : scoped
            .filter((c) => followUpBucket(c, today) === bucket)
            .sort((a, b) => a.follow_up_date!.localeCompare(b.follow_up_date!))

    return HttpResponse.json(paginate(withInfluencer(list), params))
  }),

  http.post(api('/calls/:id/done'), async ({ params }) => {
    await latency()
    const call = db.calls.find((c) => c.id === params.id)
    if (!call || !findVisible(call.influencer_id)) return notFound('Call')
    call.follow_up_done = true
    return HttpResponse.json(call)
  }),
]
