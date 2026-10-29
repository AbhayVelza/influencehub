import { http, HttpResponse } from 'msw'
import { PLATFORM_META } from '@/lib/platforms'
import type { AccountCreate, AccountUpdate, ConnectLinkRequest, ConnectLinkResponse, Platform } from '@/types'
import { findAccount, logActivity, mediaFor, nextId, nowIso, refreshDerived, snapshotsFor } from '../db'
import { findVisible, validateAccounts } from '../domain'
import { createJob } from '../jobs'
import { buildAccount, CONNECT_LINK_DAYS, metricsFor, syncAccount } from '../social'
import { all, api, apiError, latency, notFound, readJson } from '../utils'
import { accountConflict } from './influencers'

const DAY_MS = 24 * 60 * 60 * 1000

/** The account, if the caller can see its influencer (executives: their own only). Otherwise 404. */
function visibleAccount(id: string) {
  const found = findAccount(id)
  return found && findVisible(found.influencer.id) ? found : undefined
}

export const accountHandlers = [
  http.post(api('/influencers/:id/accounts'), async ({ params, request }) => {
    await latency()
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
    await latency()
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
    await latency()
    const found = visibleAccount(String(params.id))
    if (!found) return notFound('Account')
    const { account } = found
    if (account.sync_method === 'manual') return apiError(422, 'not_syncable', 'Manual accounts aren’t synced; edit their stats instead')
    if (account.sync_method === 'connect' && account.connect_status !== 'connected') {
      return apiError(422, 'not_syncable', 'Waiting for the creator to connect this account')
    }
    if (account.sync_method === 'lookup') account.sync_status = 'pending'
    return HttpResponse.json({ job_id: createJob(() => syncAccount(account.id)) }, { status: 202 })
  }),

  http.post(api('/accounts/:id/connect-link'), async ({ params, request }) => {
    await latency()
    const found = visibleAccount(String(params.id))
    if (!found) return notFound('Account')
    const { account, influencer } = found
    if (account.sync_method !== 'connect') return apiError(422, 'not_connectable', 'Only TikTok and Pinterest accounts are connected by link')
    if (account.connect_status === 'connected') return apiError(409, 'already_connected', 'This account is already connected')
    const body = await readJson<ConnectLinkRequest>(request)
    if (body.send_email && !influencer.email) {
      return apiError(422, 'no_email', 'Add an email address for this influencer first, or copy the link instead')
    }
    const expires_at = new Date(Date.now() + CONNECT_LINK_DAYS * DAY_MS).toISOString()
    account.connect_status = 'link_sent'
    account.connect_link_expires_at = expires_at
    const emailed_to = body.send_email ? influencer.email : null
    logActivity(influencer.id, 'connect_link_sent', { platform: account.platform, handle: account.handle, emailed_to })
    // In production: a signed, single-use link to the platform's OAuth consent screen.
    const response: ConnectLinkResponse = {
      url: `https://connect.influencehub.example/${account.platform}/${nextId('cl')}`,
      expires_at,
      emailed_to,
    }
    return HttpResponse.json(response)
  }),

  http.get(api('/accounts/:id/snapshots'), async ({ params }) => {
    await latency()
    const found = visibleAccount(String(params.id))
    return found ? HttpResponse.json(all(snapshotsFor(found.account))) : notFound('Account')
  }),

  http.get(api('/accounts/:id/media'), async ({ params }) => {
    await latency()
    const found = visibleAccount(String(params.id))
    return found ? HttpResponse.json(all(mediaFor(found.account))) : notFound('Account')
  }),
]
