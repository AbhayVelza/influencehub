import { http } from 'msw'
import { API_BASE } from '@/lib/env'
import { currentUser, noteChangedOnRead } from '../db'
import { runAutoRelease } from '../domain'
import { expireConnectLinks } from '../social'
import { api, forbidden } from '../utils'
import { accountHandlers } from './accounts'
import { asyncHandlers } from './async'
import { callHandlers } from './calls'
import { documentHandlers } from './documents'
import { duplicateHandlers } from './duplicates'
import { influencerHandlers } from './influencers'
import { packageHandlers } from './packages'
import { poolHandlers } from './pool'
import { workspaceHandlers } from './workspace'

/**
 * A Brand Specialist only reads: the dashboard, onboarded creators (`canSee` limits which) and their accounts' charts,
 * plus what the app shell needs (me, team names for "Acting as", categories). Everything else answers 403.
 */
const BRAND_SPECIALIST_READS = [
  /^\/me$/,
  /^\/team$/,
  /^\/categories$/,
  /^\/dashboard\/summary$/,
  /^\/influencers$/,
  /^\/influencers\/filter-options$/,
  /^\/influencers\/(?!check-handle$)[^/]+$/,
  /^\/accounts\/[^/]+\/(snapshots|media)$/,
]

function brandSpecialistMayCall(request: Request): boolean {
  if (request.method !== 'GET') return false
  const path = new URL(request.url).pathname
  const at = path.indexOf(API_BASE)
  const tail = at === -1 ? path : path.slice(at + API_BASE.length)
  return BRAND_SPECIALIST_READS.some((re) => re.test(tail))
}

export const handlers = [
  // Runs before every request (the caller is already checked by handleApiRequest): the scheduled rules that have
  // no server to run them, auto-release and connect-link expiry. Then falls through to the real handler.
  http.all(api('/*'), ({ request }) => {
    if (runAutoRelease() + expireConnectLinks() > 0) noteChangedOnRead()
    if (currentUser().role === 'brand_specialist' && !brandSpecialistMayCall(request)) return forbidden()
  }),
  ...duplicateHandlers,
  ...accountHandlers,
  ...influencerHandlers,
  ...poolHandlers,
  ...callHandlers,
  ...packageHandlers,
  ...documentHandlers,
  ...workspaceHandlers,
  ...asyncHandlers,
]
