import type { Role } from '@/types'

// Dev-only "View as" role, used when VITE_USE_MOCKS=true. The user menu writes it; the MSW handlers read it
// for /me and every permission check. It has no effect against a real backend.
const STORAGE_KEY = 'influencehub-mock-role'
const ROLES: Role[] = ['admin', 'manager', 'executive']

export function getMockRole(): Role | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    return ROLES.includes(value as Role) ? (value as Role) : null
  } catch {
    return null
  }
}

export function setMockRole(role: Role) {
  try {
    localStorage.setItem(STORAGE_KEY, role)
  } catch {
    // Storage unavailable; the switch can't persist.
  }
}
