import { asyncHandlers } from './async'
import { callHandlers } from './calls'
import { influencerHandlers } from './influencers'
import { packageHandlers } from './packages'
import { workspaceHandlers } from './workspace'

export const handlers = [
  ...influencerHandlers,
  ...callHandlers,
  ...packageHandlers,
  ...workspaceHandlers,
  ...asyncHandlers,
]
