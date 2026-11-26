// Test-only sign-ins for the throwaway e2e database (ih_e2e on the local PostgreSQL). Never real accounts.
export type Role = 'admin' | 'manager' | 'executive' | 'brand_specialist'

export const E2E_ADMIN = { name: 'E2E admin', email: 'admin@e2e.test', password: 'e2e-admin-pass-1' }

export const ACCOUNTS: Record<Role, { name: string; email: string; password: string }> = {
  admin: E2E_ADMIN,
  manager: { name: 'E2E manager', email: 'manager@e2e.test', password: 'e2e-manager-pass-1' },
  executive: { name: 'E2E executive', email: 'executive@e2e.test', password: 'e2e-executive-pass-1' },
  brand_specialist: { name: 'E2E brand specialist', email: 'brand@e2e.test', password: 'e2e-brand-pass-1' },
}
