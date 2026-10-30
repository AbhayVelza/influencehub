import type { Role } from '@/types'

export type Permission =
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

const EXECUTIVE: Permission[] = [
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
]

const ROLE_PERMISSIONS: Record<Role, ReadonlySet<Permission>> = {
  executive: new Set(EXECUTIVE),
  manager: new Set(MANAGER),
  admin: new Set(ADMIN),
}

export function can(role: Role | undefined, permission: Permission): boolean {
  return role ? ROLE_PERMISSIONS[role].has(permission) : false
}
