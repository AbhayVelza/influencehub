import { http, HttpResponse } from 'msw'
import { PLATFORM_META } from '@/lib/platforms'
import type { AccountCreate, AccountUpdate, Platform } from '@/types'
import { findAccount, logActivity, nowIso, refreshDerived } from '../db'
import { findVisible, validateAccounts } from '../domain'
import { createJob } from '../jobs'
import { buildAccount, metricsFor, syncAccount } from '../social'
import { all, api, apiError, notFound, readJson } from '../utils'
import { accountConflict } from './influencers'

/** The account, if the caller can see its influencer (executives: their own only). Otherwise 404. */
function visibleAccount(id: string) {
  const found = findAccount(id)
  return found && findVisible(found.influencer.id) ? found : undefined
}

export const accountHandlers = [
  http.post(api('/influencers/:id/accounts'), async ({ params, request }) => {
    const inf = findVisible(String(params.id))
    if (!inf) return notFound('Influencer')
    const body = await readJson<AccountCreate>(request)
    const conflict = accountConflict([body])
    if (conflict) return conflict
    const checked = validateAccounts([body], inf.id)
    if (!checked.ok) return apiError(checked.status, checked.code, checked.message)
    const account = buildAccount(inf, body, inf.accounts.length === 0)
    inf.accounts.push(account)
    inf.updated_at = nowIso()
    refreshDerived(inf)
    logActivity(inf.id, 'account_added', { platform: account.platform, handle: account.handle })
    return HttpResponse.json(account, { status: 201 })
  }),

  /** Manual accounts only: the stats are typed in. */
  http.patch(api('/accounts/:id'), async ({ params, request }) => {
    const found = visibleAccount(String(params.id))
    if (!found) return notFound('Account')
    const { account, influencer } = found
    if (account.sync_method !== 'manual') {
      return apiError(422, 'not_manual', 'Only manual accounts can be edited; the others come from the platform')
    }
    const body = await readJson<Partial<AccountUpdate>>(request)
    const merged = { ...account.metrics, ...(body.metrics ?? {}) } as Record<string, unknown>
    account.metrics = metricsFor(account.platform as Platform, merged) as typeof account.metrics
    influencer.updated_at = nowIso()
    refreshDerived(influencer)
    logActivity(influencer.id, 'updated', { fields: [`${PLATFORM_META[account.platform].label} stats`] })
    return HttpResponse.json(account)
  }),

  http.post(api('/accounts/:id/sync'), async ({ params }) => {
    const found = visibleAccount(String(params.id))
    if (!found) return notFound('Account')
    const { account } = found
    if (account.sync_method === 'manual') return apiError(422, 'not_syncable', 'Manual accounts aren’t synced; edit their stats instead')
    if (account.sync_method === 'connect' && account.connect_status !== 'connected') {
      return apiError(422, 'not_syncable', 'Waiting for the creator to connect this account')
    }
    return HttpResponse.json({ job_id: createJob(() => syncAccount(account.id)) }, { status: 202 })
  }),

  http.post(api('/accounts/:id/connect-link'), async ({ params }) => {
    const found = visibleAccount(String(params.id))
    if (!found) return notFound('Account')
    if (found.account.sync_method !== 'connect') return apiError(422, 'not_connectable', 'Only TikTok and Pinterest accounts are connected by link')
    return apiError(422, 'not_connected', 'Connect links aren’t set up yet. Add the account’s stats by hand for now.')
  }),

  http.get(api('/accounts/:id/snapshots'), async ({ params }) => {
    const found = visibleAccount(String(params.id))
    // No history is collected until syncing is connected.
    return found ? HttpResponse.json(all([])) : notFound('Account')
  }),

  http.get(api('/accounts/:id/media'), async ({ params }) => {
    const found = visibleAccount(String(params.id))
    // Recent posts need a connected platform API.
    return found ? HttpResponse.json(all([])) : notFound('Account')
  }),
]
