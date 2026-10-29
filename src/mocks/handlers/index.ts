import { http } from 'msw'
import { runAutoRelease } from '../domain'
import { expireConnectLinks } from '../social'
import { api } from '../utils'
import { accountHandlers } from './accounts'
import { asyncHandlers } from './async'
import { callHandlers } from './calls'
import { duplicateHandlers } from './duplicates'
import { influencerHandlers } from './influencers'
import { packageHandlers } from './packages'
import { poolHandlers } from './pool'
import { workspaceHandlers } from './workspace'

export const handlers = [
  // Stands in for the backend's scheduled jobs (auto-release, connect-link expiry): runs before every request,
  // then falls through.
  http.all(api('/*'), () => {
    runAutoRelease()
    expireConnectLinks()
  }),
  ...duplicateHandlers,
  ...accountHandlers,
  ...influencerHandlers,
  ...poolHandlers,
  ...callHandlers,
  ...packageHandlers,
  ...workspaceHandlers,
  ...asyncHandlers,
]
