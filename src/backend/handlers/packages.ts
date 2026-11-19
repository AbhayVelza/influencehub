import { http, HttpResponse } from 'msw'
import { PACKAGE_STATUSES } from '@/lib/constants'
import { dayKey } from '@/lib/format'
import type { Influencer, Package, PackageCreate, PackageStatus, PackageUpdate, PackageWithInfluencer } from '@/types'
import { db, findInfluencer, logActivity, nextId, nowIso, toSummary } from '../db'
import { changeStage, findVisible } from '../domain'
import { api, apiError, notFound, paginate, readJson } from '../utils'

/** Null when the influencer is gone or not visible to the caller (executives: only their own). */
function withInfluencer(pkg: Package): PackageWithInfluencer | null {
  const inf = findVisible(pkg.influencer_id)
  return inf ? { ...pkg, influencer: toSummary(inf) } : null
}

/**
 * Keeps the influencer's stage in step with their package. Delivered moves a creator who is waiting on it (Onboarded
 * or Welcome Kit) to Delivered, so they leave the Onboarded tabs; from Onboarded it goes through Welcome Kit, so the
 * pipeline history stays complete. Returned moves Welcome Kit back to Onboarded. Any other stage is left alone.
 */
function followPackage(inf: Influencer, status: PackageStatus) {
  if (status === 'delivered') {
    if (inf.stage === 'onboarded') changeStage(inf, 'package_sent', 'Welcome Kit delivered', undefined, { skipRequirements: true, allowOverride: false })
    if (inf.stage === 'package_sent') changeStage(inf, 'delivered', 'Welcome Kit delivered', undefined, { allowOverride: false })
  }
  if (status === 'returned' && inf.stage === 'package_sent') changeStage(inf, 'onboarded', 'Welcome Kit returned', undefined, { allowOverride: false })
}

function validateItems(items: unknown): string | null {
  if (!Array.isArray(items) || !items.length) return 'Add at least one item'
  for (const item of items as Package['items']) {
    if (!item?.name?.trim() || !(item.qty > 0)) return 'Each item needs a name and a quantity'
  }
  return null
}

const EDITABLE: (keyof Package)[] = ['items', 'address', 'courier', 'tracking_number', 'status', 'sent_at', 'delivered_at']

/** FR-PKG-01: every part of the address but the second line. */
function fullAddress(a: Package['address'] | null | undefined): boolean {
  return !!a && [a.line1, a.city, a.state, a.postal_code, a.country].every((v) => typeof v === 'string' && v.trim() !== '')
}

const SHIPPING_REQUIRED = 'Add the courier and tracking number once the Welcome Kit is sent'

/** FR-PKG-02: courier and tracking number once the status is sent or later. */
const shippable = (status: Package['status'], courier?: string | null, tracking?: string | null) =>
  status === 'preparing' || (!!courier?.trim() && !!tracking?.trim())

export const packageHandlers = [
  http.get(api('/packages'), async ({ request }) => {
    const params = new URL(request.url).searchParams
    const q = params.get('q')?.trim().toLowerCase()
    const statuses = params.getAll('status')
    const couriers = params.getAll('courier')
    const influencerId = params.get('influencer_id')
    const sentFrom = params.get('sent_from')
    const sentTo = params.get('sent_to')

    const list = db.packages
      .map(withInfluencer)
      .filter((p): p is PackageWithInfluencer => p !== null)
      .filter((p) => {
        if (influencerId && p.influencer_id !== influencerId) return false
        if (statuses.length && !statuses.includes(p.status)) return false
        if (couriers.length && !couriers.includes(p.courier ?? '')) return false
        // Date range on the IST calendar day the package was sent; unsent packages don't match a range.
        if ((sentFrom || sentTo) && !p.sent_at) return false
        if (sentFrom && dayKey(p.sent_at!) < sentFrom) return false
        if (sentTo && dayKey(p.sent_at!) > sentTo) return false
        if (q) {
          const haystack = [p.influencer.name, p.influencer.primary_account?.handle, p.tracking_number, p.courier].join(' ')
          if (!haystack.toLowerCase().includes(q)) return false
        }
        return true
      })
      // Unsent packages first, then most recently sent.
      .sort((a, b) => (b.sent_at ?? '9999').localeCompare(a.sent_at ?? '9999'))

    return HttpResponse.json(paginate(list, params))
  }),

  http.post(api('/packages'), async ({ request }) => {
    const body = await readJson<PackageCreate>(request)
    const inf = findVisible(body.influencer_id)
    if (!inf) return apiError(422, 'validation_error', 'Choose an influencer')
    const itemsError = validateItems(body.items)
    if (itemsError) return apiError(422, 'validation_error', itemsError)
    if (!fullAddress(body.address)) return apiError(422, 'validation_error', 'Address is required')
    const status = body.status ?? 'preparing'
    if (!PACKAGE_STATUSES.includes(status)) return apiError(422, 'validation_error', 'Unknown Welcome Kit status')
    if (!shippable(status, body.courier, body.tracking_number)) return apiError(422, 'validation_error', SHIPPING_REQUIRED)

    const pkg: Package = {
      id: nextId('pkg'),
      influencer_id: inf.id,
      items: body.items,
      address: body.address,
      courier: body.courier?.trim() || null,
      tracking_number: body.tracking_number?.trim() || null,
      status,
      sent_at: status === 'preparing' ? null : nowIso(),
      delivered_at: status === 'delivered' ? nowIso() : null,
    }
    db.packages.push(pkg)
    logActivity(inf.id, 'package_created', { package_id: pkg.id, courier: pkg.courier })
    // A new package recorded as delivered moves the creator on; a new "returned" one (an old shipment being logged)
    // doesn't pull them back.
    if (pkg.status === 'delivered') followPackage(inf, pkg.status)
    return HttpResponse.json(pkg, { status: 201 })
  }),

  http.patch(api('/packages/:id'), async ({ params, request }) => {
    const pkg = db.packages.find((p) => p.id === params.id)
    if (!pkg || !findVisible(pkg.influencer_id)) return notFound('Welcome Kit')
    const body = await readJson<PackageUpdate>(request)
    if (body.items !== undefined) {
      const itemsError = validateItems(body.items)
      if (itemsError) return apiError(422, 'validation_error', itemsError)
    }
    if (body.status !== undefined && !PACKAGE_STATUSES.includes(body.status)) {
      return apiError(422, 'validation_error', 'Unknown Welcome Kit status')
    }

    // Only these fields change: never the id or the influencer it belongs to.
    const changes = Object.fromEntries(Object.entries(body).filter(([k]) => EDITABLE.includes(k as keyof Package))) as PackageUpdate
    const next = { ...pkg, ...changes }
    if (changes.address !== undefined && !fullAddress(next.address)) return apiError(422, 'validation_error', 'Address is required')
    if (!shippable(next.status, next.courier, next.tracking_number)) return apiError(422, 'validation_error', SHIPPING_REQUIRED)

    const previousStatus = pkg.status
    Object.assign(pkg, changes)
    if (pkg.status !== 'preparing' && !pkg.sent_at) pkg.sent_at = nowIso()
    if (pkg.status === 'delivered' && !pkg.delivered_at) pkg.delivered_at = nowIso()
    logActivity(pkg.influencer_id, 'package_updated', {
      package_id: pkg.id,
      ...(pkg.status !== previousStatus ? { status: pkg.status } : { fields: Object.keys(changes) }),
    })

    const inf = findInfluencer(pkg.influencer_id)
    if (inf && pkg.status !== previousStatus) followPackage(inf, pkg.status)
    return HttpResponse.json(pkg)
  }),
]
