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

/** What the override rule needs to know about a creator beyond their current stage. */
export interface OverrideContext {
  /**
   * For an On Hold creator, the stage they were in before. `null` = no record of it; `undefined` = not looked up
   * yet. Either way no override is offered from On Hold until it's known (it might have been Onboarded).
   */
  previousStage?: Stage | null
  /** The creator has been Onboarded (or later) at some point, even if they're Rejected or On Hold now. */
  everOnboarded?: boolean
}

/**
 * Why an admin override from `from` to `to` isn't allowed, or null when it is. The single source of the rule (the
 * server's `changeStage`, the stage menu and the pipeline board all use it):
 * - only admins override;
 * - never once the creator has been onboarded (Onboarded, Welcome Kit, Delivered, or Rejected / On Hold after that);
 * - only to Data Gathered, Contacted, Onboarded, On Hold or Rejected (never Welcome Kit or Delivered).
 * An override into Onboarded also needs a current agreement; that's a document check the server makes.
 */
export function overrideBlockReason(from: Stage, to: Stage, role: Role, ctx: OverrideContext = {}): string | null {
  if (role !== 'admin') return 'Only admins can override the stage rules'
  const unknownHold = from === 'on_hold' && !ctx.previousStage
  if (ONBOARDED_OR_LATER.includes(from) || ctx.everOnboarded || (ctx.previousStage && ONBOARDED_OR_LATER.includes(ctx.previousStage))) {
    return 'Overrides aren’t allowed once a creator has been onboarded'
  }
  if (unknownHold) return 'Overrides from On Hold need to know the stage before it, and there’s no record of it'
  if (!OVERRIDE_TARGETS.includes(to)) return 'Overrides can only move a creator up to Onboarded'
  return null
}

/** Stages only an admin override can reach from here (beyond the standard moves). */
export function getOverrideTargets(from: Stage, role: Role, ctx: OverrideContext = {}): Stage[] {
  if (role !== 'admin') return []
  const standard = getStandardTransitions(from, role, ctx.previousStage)
  return ALL_STAGES.filter((s) => s !== from && !standard.includes(s) && overrideBlockReason(from, s, role, ctx) === null)
}

/**
 * Transitions available to this role: the standard moves, plus admin override targets unless `allowOverride` is
 * false (bulk changes and automatic moves never override).
 */
export function getAllowedTransitions(from: Stage, role: Role, ctx: OverrideContext = {}, allowOverride = true): Stage[] {
  const allowed = [...getStandardTransitions(from, role, ctx.previousStage), ...(allowOverride ? getOverrideTargets(from, role, ctx) : [])]
  return ALL_STAGES.filter((s) => allowed.includes(s))
}

/**
 * True when the move is only possible through an admin override. Overrides skip the stage
 * requirements but must include a reason, which is recorded in the activity log.
 */
export function isOverride(from: Stage, to: Stage, role: Role, previousStage?: Stage | null): boolean {
  return !getStandardTransitions(from, role, previousStage).includes(to)
}
