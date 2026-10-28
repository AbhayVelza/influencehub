import type { Role } from '@/types'

export type Permission =
  | 'influencer:view'
  | 'influencer:create'
  | 'influencer:edit'
  | 'call:log'
  | 'package:manage'
  | 'stage:change'
  /** Assign an unassigned influencer to yourself. */
  | 'influencer:claim'
  | 'stage:reopen'
  | 'influencer:reassign'
  | 'influencer:delete'
  | 'data:import'
  | 'data:export'
  | 'stage:override'
  | 'team:manage'
  | 'categories:manage'
  | 'integrations:manage'

const EXECUTIVE: Permission[] = [
  'influencer:view',
  'influencer:create',
  'influencer:edit',
  'call:log',
  'package:manage',
  'stage:change',
  'influencer:claim',
]

const MANAGER: Permission[] = [
  ...EXECUTIVE,
  'stage:reopen',
  'influencer:reassign',
  'influencer:delete',
  'data:import',
  'data:export',
]

const ADMIN: Permission[] = [...MANAGER, 'stage:override', 'team:manage', 'categories:manage', 'integrations:manage']

const ROLE_PERMISSIONS: Record<Role, ReadonlySet<Permission>> = {
  executive: new Set(EXECUTIVE),
  manager: new Set(MANAGER),
  admin: new Set(ADMIN),
}

export function can(role: Role | undefined, permission: Permission): boolean {
  return role ? ROLE_PERMISSIONS[role].has(permission) : false
}
