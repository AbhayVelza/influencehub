import { http, HttpResponse } from 'msw'
import { currentUser, findInfluencer } from '../db'
import { expiringClaims, filterInfluencers, poolInfluencers, sortInfluencers, toPoolItem } from '../domain'
import { all, api, notFound, paginate } from '../utils'
import { filterOptionsFor } from './influencers'

// The Unassigned Pool: every role sees it; executives get previews only (see toPoolItem).
// Specific paths come before /pool/:id so they aren't read as ids.
export const poolHandlers = [
  http.get(api('/pool'), async ({ request }) => {
    const user = currentUser()
    const params = new URL(request.url).searchParams
    const limitedSearch = user.role === 'executive'
    const list = sortInfluencers(filterInfluencers(params, poolInfluencers(), { limitedSearch }), params.get('sort'), params.getAll('platform'))
    const page = paginate(list, params)
    return HttpResponse.json({ ...page, items: page.items.map((inf) => toPoolItem(inf, user)) })
  }),

  http.get(api('/pool/filter-options'), async ({ request }) => {
    return HttpResponse.json(
      filterOptionsFor(poolInfluencers(), new URL(request.url).searchParams, { limitedSearch: currentUser().role === 'executive' }),
    )
  }),

  http.get(api('/pool/expiring'), async () => {
    return HttpResponse.json(all(expiringClaims()))
  }),

  http.get(api('/pool/:id'), async ({ params }) => {
    const inf = findInfluencer(String(params.id))
    return inf && inf.assigned_to === null ? HttpResponse.json(toPoolItem(inf)) : notFound('Influencer')
  }),
]
