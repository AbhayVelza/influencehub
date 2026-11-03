import { http } from 'msw'
import { runAutoRelease } from '../domain'
import { expireConnectLinks } from '../social'
import { api } from '../utils'
import { accountHandlers } from './accounts'
import { asyncHandlers } from './async'
import { callHandlers } from './calls'
import { documentHandlers } from './documents'
import { duplicateHandlers } from './duplicates'
import { influencerHandlers } from './influencers'
import { packageHandlers } from './packages'
import { poolHandlers } from './pool'
import { workspaceHandlers } from './workspace'

export const handlers = [
  // Runs before every request (the caller is already checked by handleApiRequest): the scheduled rules that have
  // no server to run them, auto-release and connect-link expiry. Then falls through to the real handler.
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
  ...documentHandlers,
  ...workspaceHandlers,
  ...asyncHandlers,
]
