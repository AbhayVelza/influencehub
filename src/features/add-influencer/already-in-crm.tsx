import { CircleAlert } from 'lucide-react'
import { Link } from 'react-router-dom'

/** Shown when a handle is already in the CRM; links to the existing profile. */
export function AlreadyInCrm({ handle, influencerId, onOpen }: { handle: string; influencerId: string | null; onOpen: () => void }) {
  return (
    <div role="alert" className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-50 p-3 text-sm dark:bg-amber-400/10">
      <CircleAlert className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
      <div>
        <p className="font-medium">Already in CRM</p>
        <p className="text-muted-foreground">
          @{handle} is already in InfluenceHub.{' '}
          {influencerId && (
            <Link to={`/influencers/${influencerId}`} onClick={onOpen} className="font-medium text-foreground underline underline-offset-2">
              Open profile
            </Link>
          )}
        </p>
      </div>
    </div>
  )
}
