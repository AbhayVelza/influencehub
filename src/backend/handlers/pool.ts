import { http, HttpResponse } from 'msw'
import { can } from '@/lib/permissions'
import { currentUser, findInfluencer } from '../db'
import { expiringClaims, filterInfluencers, poolInfluencers, sortInfluencers, toPoolItem } from '../domain'
import { all, api, forbidden, notFound, paginate } from '../utils'
import { filterOptionsFor } from './influencers'

// The Unassigned Pool: managers and admins only ('pool:view'). /pool/expiring is everyone's own claims.
// Specific paths come before /pool/:id so they aren't read as ids.
const noPool = () => (can(currentUser().role, 'pool:view') ? null : forbidden('Only managers and admins can see the Unassigned Pool'))

export const poolHandlers = [
  http.get(api('/pool'), async ({ request }) => {
    const denied = noPool()
    if (denied) return denied
    const user = currentUser()
    const params = new URL(request.url).searchParams
    const limitedSearch = user.role === 'executive'
    const list = sortInfluencers(filterInfluencers(params, poolInfluencers(), { limitedSearch }), params.get('sort'), params.getAll('platform'))
    const page = paginate(list, params)
    return HttpResponse.json({ ...page, items: page.items.map((inf) => toPoolItem(inf, user)) })
  }),

  http.get(api('/pool/filter-options'), async ({ request }) => {
    const denied = noPool()
    if (denied) return denied
    return HttpResponse.json(
      filterOptionsFor(poolInfluencers(), new URL(request.url).searchParams, { limitedSearch: currentUser().role === 'executive' }),
    )
  }),

  http.get(api('/pool/expiring'), async () => {
    return HttpResponse.json(all(expiringClaims()))
  }),

  http.get(api('/pool/:id'), async ({ params }) => {
    const denied = noPool()
    if (denied) return denied
    const inf = findInfluencer(String(params.id))
    return inf && inf.assigned_to === null ? HttpResponse.json(toPoolItem(inf)) : notFound('Influencer')
  }),
]
