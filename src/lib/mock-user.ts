// Dev-only "View as": which team member the mock API signs you in as, used when VITE_USE_MOCKS=true. The user
// menu writes it; the MSW handlers read it for /me, every permission check and per-user scoping. It has no
// effect against a real backend.
const STORAGE_KEY = 'influencehub-mock-user'

export function getMockUserId(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

export function setMockUserId(userId: string) {
  try {
    localStorage.setItem(STORAGE_KEY, userId)
  } catch {
    // Storage unavailable; the switch can't persist.
  }
}
