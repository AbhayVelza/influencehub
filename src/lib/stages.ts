import { ALL_STAGES } from '@/lib/constants'
import type { Role, Stage } from '@/types'

/** Standard transitions. `on_hold` additionally returns to its previous stage. */
export const STAGE_TRANSITIONS: Record<Stage, Stage[]> = {
  data_gathered: ['contacted', 'on_hold', 'rejected'],
  contacted: ['onboarded', 'on_hold', 'rejected'],
  onboarded: ['package_sent', 'on_hold', 'rejected'],
  package_sent: ['delivered', 'onboarded'],
  delivered: [],
  on_hold: ['rejected'],
  rejected: ['data_gathered'],
}

/** What must exist before an influencer can enter a stage. */
export type StageRequirement = 'interested_call' | 'package_with_tracking'

export const STAGE_REQUIREMENTS: Partial<Record<Stage, StageRequirement>> = {
  contacted: 'interested_call',
  package_sent: 'package_with_tracking',
}

/** Transitions any role may make (before admin override). */
export function getStandardTransitions(from: Stage, role: Role, previousStage?: Stage | null): Stage[] {
  if (from === 'rejected') {
    return role === 'executive' ? [] : STAGE_TRANSITIONS.rejected
  }
  if (from === 'on_hold') {
    const back = previousStage && previousStage !== 'on_hold' ? [previousStage] : []
    return [...back, ...STAGE_TRANSITIONS.on_hold]
  }
  return STAGE_TRANSITIONS[from]
}

/** Transitions available to this role. Admins can override to any stage. */
export function getAllowedTransitions(from: Stage, role: Role, previousStage?: Stage | null): Stage[] {
  if (role === 'admin') return ALL_STAGES.filter((s) => s !== from)
  return getStandardTransitions(from, role, previousStage)
}

/**
 * True when the move is only possible through an admin override. Overrides skip the stage
 * requirements but must include a reason, which is recorded in the activity log.
 */
export function isOverride(from: Stage, to: Stage, role: Role, previousStage?: Stage | null): boolean {
  return !getStandardTransitions(from, role, previousStage).includes(to)
}
