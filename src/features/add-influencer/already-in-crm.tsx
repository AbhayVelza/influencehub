import { CircleAlert, UserRound } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { usePoolActions } from '@/features/pool/use-pool-actions'
import type { HandleConflict } from '@/types'
import type { ConflictState } from './conflict'

/**
 * The handle is already in the CRM. In the pool: offer to claim it. Visible to you: link to it. Owned by a
 * teammate an executive can't see: say so, without a link.
 */
export function AlreadyInCrm({ handle, conflict, id, onDone }: ConflictState & { onDone: () => void }) {
  const { claim, busy } = usePoolActions()
  // Someone claimed it between the check and the click.
  const [lost, setLost] = useState(false)
  const shown: HandleConflict = lost ? 'assigned_to_other' : conflict

  const title = shown === 'in_pool' ? 'Already in the Unassigned Pool' : 'Already in CRM'
  return (
    <div role="alert" className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-50 p-3 text-sm dark:bg-amber-400/10">
      <CircleAlert className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
      <div className="space-y-2">
        <div>
          <p className="font-medium">{title}</p>
          <p className="text-muted-foreground">
            {shown === 'in_pool' && <>@{handle} has no owner yet. Claim it to work on it.</>}
            {shown === 'assigned_to_other' && (
              <>@{handle} is already owned by a teammate. Ask a manager if it should be reassigned to you.</>
            )}
            {shown === 'exists' && (
              <>
                @{handle} is already in InfluenceHub.{' '}
                {id && (
                  <Link to={`/influencers/${id}`} onClick={onDone} className="font-medium text-foreground underline underline-offset-2">
                    Open profile
                  </Link>
                )}
              </>
            )}
          </p>
        </div>
        {shown === 'in_pool' && id && (
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
