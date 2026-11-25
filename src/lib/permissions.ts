import type { Role } from '@/types'

export type Permission =
  /** The working CRM: influencer list, pool, pipeline, calls, Welcome Kits, documents, search, notifications. */
  | 'crm:access'
  | 'influencer:view'
  | 'influencer:create'
  | 'influencer:edit'
  | 'call:log'
  | 'package:manage'
  | 'stage:change'
  /** Take an influencer from the Unassigned Pool (owner = me). */
  | 'influencer:claim'
  /** Return one of your own influencers to the pool (a reason is required). */
  | 'influencer:release'
  /** Upload documents (an executive: their own influencers only; scoping is server-side). */
  | 'document:upload'
  /** Soft-delete a document. */
  | 'document:delete'
  | 'stage:reopen'
  | 'influencer:reassign'
  | 'influencer:delete'
  /** Everything stored about one influencer, as JSON (a personal-data request). */
  | 'influencer:export'
  /** Review possible duplicates and merge two influencers. */
  | 'influencer:merge'
  | 'data:import'
  | 'data:export'
  | 'stage:override'
  | 'team:manage'
  | 'categories:manage'
  | 'integrations:manage'
  /** Claim limit and auto-release for the Unassigned Pool. */
  | 'pool:configure'
  /** The Dashboard's Recent activity feed (admins only). */
  | 'activity:view'

/**
 * Brand Specialist: read-only, onboarded creators only (Onboarded, Welcome Kit, Delivered). Sees the Dashboard's
 * onboarded numbers and the Onboarded tabs without Stage, Assigned to or Docs; nothing else. The server enforces it
 * (`canSee` in src/backend/domain.ts and the request allowlist in src/backend/handlers/index.ts).
 */
const BRAND_SPECIALIST: Permission[] = ['influencer:view']

const EXECUTIVE: Permission[] = [
  'crm:access',
  'influencer:view',
  'influencer:create',
  'influencer:edit',
  'call:log',
  'package:manage',
  'stage:change',
  'influencer:claim',
  'influencer:release',
  'document:upload',
]

const MANAGER: Permission[] = [
  ...EXECUTIVE,
  'stage:reopen',
  'document:delete',
  'influencer:reassign',
  'influencer:delete',
  'influencer:merge',
  'data:import',
  'data:export',
]

const ADMIN: Permission[] = [
  ...MANAGER,
  'stage:override',
  'team:manage',
  'categories:manage',
  'integrations:manage',
  'pool:configure',
  'influencer:export',
  'activity:view',
]

const ROLE_PERMISSIONS: Record<Role, ReadonlySet<Permission>> = {
  executive: new Set(EXECUTIVE),
  manager: new Set(MANAGER),
  admin: new Set(ADMIN),
  brand_specialist: new Set(BRAND_SPECIALIST),
}

export function can(role: Role | undefined, permission: Permission): boolean {
  return role ? ROLE_PERMISSIONS[role].has(permission) : false
}
