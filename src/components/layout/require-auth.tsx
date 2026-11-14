import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuthUser } from '@/lib/auth'

/** Signed-out visits to any app route go to /login, which comes back here (`?next=`) after signing in. */
export function RequireAuth() {
  const user = useAuthUser()
  const { pathname, search } = useLocation()
  if (user) return <Outlet />
  const here = `${pathname}${search}`
  return <Navigate to={here === '/' ? '/login' : `/login?next=${encodeURIComponent(here)}`} replace />
}
