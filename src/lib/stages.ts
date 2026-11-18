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

/** Stages an influencer has to have a current agreement on file for (the dashboard's "Onboarded without agreement"). */
export const ONBOARDED_OR_LATER: Stage[] = ['onboarded', 'package_sent', 'delivered']

/** What must exist before an influencer can enter a stage. */
export type StageRequirement = 'interested_call' | 'package_with_tracking' | 'agreement_and_insights'

export const STAGE_REQUIREMENTS: Partial<Record<Stage, StageRequirement>> = {
  contacted: 'interested_call',
  package_sent: 'package_with_tracking',
  /** Only when entering from Contacted (resuming from hold or a returned package keeps what's on file). */
  onboarded: 'agreement_and_insights',
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

/** Where an admin override may move a creator: up to Onboarded, plus the side stages. Never Welcome Kit or Delivered. */
export const OVERRIDE_TARGETS: Stage[] = ['data_gathered', 'contacted', 'onboarded', 'on_hold', 'rejected']

/**
 * Stages only an admin override can reach from here (beyond the standard moves). None once the creator is onboarded
 * or later (or on hold from there): from Onboarded on, only the standard moves apply. An override into Onboarded
 * still needs a current agreement (checked by the server).
 */
export function getOverrideTargets(from: Stage, role: Role, previousStage?: Stage | null): Stage[] {
  if (role !== 'admin') return []
  if (ONBOARDED_OR_LATER.includes(from)) return []
  if (from === 'on_hold' && previousStage && ONBOARDED_OR_LATER.includes(previousStage)) return []
  const standard = getStandardTransitions(from, role, previousStage)
  return ALL_STAGES.filter((s) => s !== from && OVERRIDE_TARGETS.includes(s) && !standard.includes(s))
}

/** Transitions available to this role: the standard moves plus any admin override targets. */
export function getAllowedTransitions(from: Stage, role: Role, previousStage?: Stage | null): Stage[] {
  const allowed = [...getStandardTransitions(from, role, previousStage), ...getOverrideTargets(from, role, previousStage)]
  return ALL_STAGES.filter((s) => allowed.includes(s))
}

/**
 * True when the move is only possible through an admin override. Overrides skip the stage
 * requirements but must include a reason, which is recorded in the activity log.
 */
export function isOverride(from: Stage, to: Stage, role: Role, previousStage?: Stage | null): boolean {
  return !getStandardTransitions(from, role, previousStage).includes(to)
}
