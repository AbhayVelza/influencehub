import { CircleAlert, UserRound } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { usePoolActions } from '@/features/pool/use-pool-actions'
import { useCan } from '@/hooks/use-me'
import { PLATFORM_META } from '@/lib/platforms'
import type { HandleConflict } from '@/types'
import type { ConflictState } from './conflict'

/**
 * The handle is already in the CRM. In the pool: offer to claim it. Visible to you: link to it. Owned by a
 * teammate an executive can't see: say so, without a link.
 */
export function AlreadyInCrm({ platform, handle, conflict, id, onDone }: ConflictState & { onDone: () => void }) {
  const label = PLATFORM_META[platform].label
  const { claim, busy } = usePoolActions()
  const canClaim = useCan('influencer:claim')
  // Someone claimed it between the check and the click.
  const [lost, setLost] = useState(false)
  const shown: HandleConflict = lost ? 'assigned_to_other' : conflict

  const title = shown === 'in_pool' ? 'Already in the Unassigned Pool' : 'Already in CRM'
  return (
    <div role="alert" className="flex items-start gap-2.5 rounded-xl bg-amber-50/80 p-3 text-body ring-1 ring-amber-500/25 ring-inset dark:bg-amber-400/10">
      <CircleAlert className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" strokeWidth={1.75} />
      <div className="space-y-2">
        <div>
          <p className="font-semibold text-primary">{title}</p>
          <p className="text-muted-foreground">
            {shown === 'in_pool' && (
              <>
                {label} @{handle} has no owner yet. {canClaim ? 'Claim it to work on it.' : 'Ask a manager to assign it to you.'}
              </>
            )}
            {shown === 'assigned_to_other' && (
              <>
                {label} @{handle} is already owned by a teammate. Ask a manager if it should be reassigned to you.
              </>
            )}
            {shown === 'exists' && (
              <>
                {label} @{handle} is already in InfluenceHub.{' '}
                {id && (
                  <Link to={`/influencers/${id}`} onClick={onDone} className="font-medium text-on-tertiary-container underline underline-offset-2 hover:text-primary">
                    Open profile
                  </Link>
                )}
              </>
            )}
          </p>
        </div>
        {shown === 'in_pool' && id && canClaim && (
          <Button
            type="button"
            size="sm"
            disabled={busy}
            onClick={async () => {
              const result = await claim({ id, name: `@${handle}` })
              if (result === 'ok') onDone()
              else if (result === 'already_claimed') setLost(true)
            }}
          >
            <UserRound />
            {busy ? 'Claiming…' : 'Claim it'}
          </Button>
        )}
      </div>
    </div>
  )
}
