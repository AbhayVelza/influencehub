import { TriangleAlert, UserRound } from 'lucide-react'
import { Link } from 'react-router-dom'
import { PersonAvatar } from '@/components/common/person-avatar'
import { AccountLabel } from '@/components/common/platform-badge'
import { Button } from '@/components/ui/button'
import { usePoolActions } from '@/features/pool/use-pool-actions'
import { cn } from '@/lib/utils'
import type { DuplicateMatch, MatchConfidence } from '@/types'

/** Stitch status pill: a neutral chip whose dot carries the level. */
const CONFIDENCE_META: Record<MatchConfidence, { label: string; dot: string }> = {
  high: { label: 'High', dot: 'bg-red-500' },
  medium: { label: 'Medium', dot: 'bg-amber-500' },
  low: { label: 'Low', dot: 'bg-outline' },
}

export function ConfidenceBadge({ confidence }: { confidence: MatchConfidence }) {
  const meta = CONFIDENCE_META[confidence]
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-container px-2.5 py-0.5 text-small font-medium whitespace-nowrap text-on-surface">
      <span aria-hidden className={cn('size-1.5 rounded-full', meta.dot)} />
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
    <div role="alert" className="space-y-3 rounded-2xl bg-amber-50/90 p-4 text-body shadow-sm ring-1 ring-amber-500/25 backdrop-blur-xl dark:bg-amber-400/10 dark:ring-amber-400/25">
      <p className="flex items-center gap-2 text-body font-semibold text-on-surface">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-amber-500/15">
          <TriangleAlert className="size-4 text-amber-600 dark:text-amber-400" strokeWidth={1.75} />
        </span>
        Possible same creator
      </p>
      {visible.length > 0 && (
        <ul className="space-y-2">
          {visible.map((m) => {
            const inf = m.influencer!
            return (
              <li key={inf.id} className="flex flex-wrap items-start gap-2.5 rounded-xl bg-surface-container-lowest/80 p-3 shadow-sm">
                <PersonAvatar name={inf.name} src={inf.profile_pic_url} className="size-8 shadow-sm" />
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <Link to={`/influencers/${inf.id}`} onClick={onLeave} className="text-body font-semibold text-primary hover:underline">
                      {inf.name}
                    </Link>
                    <ConfidenceBadge confidence={m.confidence} />
                    {m.access === 'pool' && <span className="text-small text-muted-foreground">In the Unassigned Pool</span>}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-2 text-small text-muted-foreground">
                    <AccountLabel account={inf.primary_account} />
                    {inf.city && <span>· {inf.city}</span>}
                  </div>
                  <ul className="list-disc pl-4 text-small text-muted-foreground marker:text-outline">
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
