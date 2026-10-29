import { http, HttpResponse } from 'msw'
import { can } from '@/lib/permissions'
import type { DuplicateCheckRequest, MergeField, MergeRequest } from '@/types'
import { currentUser, db, findInfluencer } from '../db'
import { checkDuplicates, duplicatePairs, mergeInfluencers } from '../duplicates'
import { api, apiError, forbidden, latency, notFound, paginate, readJson } from '../utils'

const MERGE_FIELDS: MergeField[] = ['name', 'category', 'phone', 'email', 'address', 'location', 'notes', 'assigned_to']
const canMerge = () => can(currentUser().role, 'influencer:merge')

export const duplicateHandlers = [
  http.post(api('/duplicates/check'), async ({ request }) => {
    await latency()
    const body = await readJson<DuplicateCheckRequest>(request)
    return HttpResponse.json({ matches: checkDuplicates(body) })
  }),

  http.get(api('/duplicates'), async ({ request }) => {
    await latency()
    if (!canMerge()) return forbidden('Only managers and admins review duplicates')
    return HttpResponse.json(paginate(duplicatePairs(), new URL(request.url).searchParams))
  }),

  http.post(api('/duplicates/:id/dismiss'), async ({ params }) => {
    await latency()
    if (!canMerge()) return forbidden('Only managers and admins review duplicates')
    const id = String(params.id)
    if (!duplicatePairs().some((p) => p.id === id)) return notFound('Duplicate pair')
    db.dismissedDuplicates.add(id)
    return new HttpResponse(null, { status: 204 })
  }),

  http.post(api('/influencers/merge'), async ({ request }) => {
    await latency()
    if (!canMerge()) return forbidden('Only managers and admins can merge influencers')
    const body = await readJson<MergeRequest>(request)
    const keep = findInfluencer(body.keep_id)
    const merge = findInfluencer(body.merge_id)
    if (!keep || !merge) return notFound('Influencer')
    if (keep.id === merge.id) return apiError(422, 'validation_error', 'Pick two different influencers')
    const choices = body.field_choices ?? {}
    for (const [field, from] of Object.entries(choices)) {
      if (!MERGE_FIELDS.includes(field as MergeField) || (from !== 'keep' && from !== 'merge')) {
        return apiError(422, 'validation_error', `Invalid choice for ${field}`)
      }
    }
    return HttpResponse.json(mergeInfluencers(keep, merge, choices))
  }),
]
