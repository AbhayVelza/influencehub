import { http, HttpResponse } from 'msw'
import { dayKey, todayKey } from '@/lib/format'
import type { CallLog, CallLogWithInfluencer, FollowUpBucket } from '@/types'
import { db, findInfluencer, toSummary } from '../db'
import { api, latency, notFound, paginate } from '../utils'

export function followUpBucket(call: CallLog, today = todayKey()): Exclude<FollowUpBucket, 'history'> | null {
  if (!call.follow_up_date || call.follow_up_done) return null
  const day = dayKey(call.follow_up_date)
  return day < today ? 'overdue' : day === today ? 'today' : 'upcoming'
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

    const list =
      bucket === 'history'
        ? [...db.calls].sort((a, b) => b.created_at.localeCompare(a.created_at))
        : db.calls
            .filter((c) => followUpBucket(c, today) === bucket)
            .sort((a, b) => a.follow_up_date!.localeCompare(b.follow_up_date!))

    return HttpResponse.json(paginate(withInfluencer(list), params))
  }),

  http.post(api('/calls/:id/done'), async ({ params }) => {
    await latency()
    const call = db.calls.find((c) => c.id === params.id)
    if (!call) return notFound('Call')
    call.follow_up_done = true
    return HttpResponse.json(call)
  }),
]
