import { http } from 'msw'
import { runAutoRelease } from '../domain'
import { api } from '../utils'
import { asyncHandlers } from './async'
import { callHandlers } from './calls'
import { influencerHandlers } from './influencers'
import { packageHandlers } from './packages'
import { poolHandlers } from './pool'
import { workspaceHandlers } from './workspace'

export const handlers = [
  // Stands in for the backend's scheduled auto-release job: runs before every request, then falls through.
  http.all(api('/*'), () => {
    runAutoRelease()
  }),
  ...influencerHandlers,
  ...poolHandlers,
  ...callHandlers,
  ...packageHandlers,
  ...workspaceHandlers,
  ...asyncHandlers,
]
