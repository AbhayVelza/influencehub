import { TriangleAlert, UserRound } from 'lucide-react'
import { Link } from 'react-router-dom'
import { PersonAvatar } from '@/components/common/person-avatar'
import { AccountLabel } from '@/components/common/platform-badge'
import { Button } from '@/components/ui/button'
import { usePoolActions } from '@/features/pool/use-pool-actions'
import { cn } from '@/lib/utils'
import type { DuplicateMatch, MatchConfidence } from '@/types'

const CONFIDENCE_META: Record<MatchConfidence, { label: string; badge: string }> = {
  high: { label: 'High', badge: 'bg-red-50 text-red-700 ring-red-600/20 dark:bg-red-400/10 dark:text-red-300 dark:ring-red-400/25' },
  medium: { label: 'Medium', badge: 'bg-amber-50 text-amber-800 ring-amber-600/25 dark:bg-amber-400/10 dark:text-amber-300 dark:ring-amber-400/25' },
  low: { label: 'Low', badge: 'bg-slate-100 text-slate-700 ring-slate-600/20 dark:bg-slate-400/10 dark:text-slate-300 dark:ring-slate-400/25' },
}

export function ConfidenceBadge({ confidence }: { confidence: MatchConfidence }) {
  const meta = CONFIDENCE_META[confidence]
  return (
    <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ring-1 ring-inset', meta.badge)}>
      {meta.label} confidence
    </span>
  )
}

interface DuplicateWarningProps {
  matches: DuplicateMatch[]
  /** "Add account to existing" for a match you can see; omitted where it doesn't apply. */
  onUseExisting?: (match: DuplicateMatch) => void
  onProceed: () => void
  proceedLabel: string
  busy?: boolean
  /** Close the surrounding dialog when a link or claim takes you elsewhere. */
  onLeave?: () => void
}

/**
 * "Possible same creator". Executives only learn that a teammate has a matching creator — nothing about who it is.
 */
export function DuplicateWarning({ matches, onUseExisting, onProceed, proceedLabel, busy, onLeave }: DuplicateWarningProps) {
  const { claim, busy: claiming } = usePoolActions()
  const visible = matches.filter((m) => m.access !== 'restricted' && m.influencer)
  const restricted = matches.length - visible.length

  return (
    <div role="alert" className="space-y-3 rounded-md border border-amber-500/40 bg-amber-50 p-3 text-sm dark:bg-amber-400/10">
      <p className="flex items-center gap-2 font-medium">
        <TriangleAlert className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
        Possible same creator
      </p>
      {visible.length > 0 && (
        <ul className="space-y-2">
          {visible.map((m) => {
            const inf = m.influencer!
            return (
              <li key={inf.id} className="flex flex-wrap items-start gap-2.5 rounded-md bg-background/70 p-2">
                <PersonAvatar name={inf.name} src={inf.profile_pic_url} className="size-8" />
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <Link to={`/influencers/${inf.id}`} onClick={onLeave} className="font-medium hover:underline">
                      {inf.name}
                    </Link>
                    <ConfidenceBadge confidence={m.confidence} />
                    {m.access === 'pool' && <span className="text-xs text-muted-foreground">In the Unassigned Pool</span>}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                    <AccountLabel account={inf.primary_account} />
                    {inf.city && <span>· {inf.city}</span>}
                  </div>
                  <ul className="list-disc pl-4 text-xs text-muted-foreground">
                    {m.reasons.map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                </div>
                <div className="flex shrink-0 flex-col gap-1.5">
                  {m.access === 'full' && onUseExisting && (
                    <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => onUseExisting(m)}>
                      Add account to existing
                    </Button>
                  )}
                  {m.access === 'pool' && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={busy || claiming}
                      onClick={async () => {
                        if ((await claim({ id: inf.id, name: inf.name })) === 'ok') onLeave?.()
                      }}
                    >
                      <UserRound />
                      Claim it
                    </Button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
      {restricted > 0 && (
        <p className="text-muted-foreground">
          {restricted === 1 ? 'Matches a creator assigned to a teammate.' : `Matches ${restricted} creators assigned to teammates.`}
        </p>
      )}
      <div className="flex justify-end">
        <Button type="button" size="sm" disabled={busy} onClick={onProceed}>
          {proceedLabel}
        </Button>
      </div>
    </div>
  )
}
