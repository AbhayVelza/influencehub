import { ShieldX } from 'lucide-react'
import type { ReactNode } from 'react'
import { EmptyState } from '@/components/common/states'
import { useCan } from '@/hooks/use-me'
import type { Permission } from '@/lib/permissions'

/** Renders children only when the signed-in user has the permission. */
export function RequirePermission({ permission, children }: { permission: Permission; children: ReactNode }) {
  const allowed = useCan(permission)
  if (!allowed) {
    return (
      <EmptyState
        icon={ShieldX}
        title="You don’t have access to this page"
        description="Ask an admin if you think you should."
        className="py-24"
      />
    )
  }
  return children
}
