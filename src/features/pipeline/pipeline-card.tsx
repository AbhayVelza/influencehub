import { useDraggable } from '@dnd-kit/core'
import { Clock } from 'lucide-react'
import { Link } from 'react-router-dom'
import { PersonAvatar } from '@/components/common/person-avatar'
import { AccountLabel } from '@/components/common/platform-badge'
import { formatCompact } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { PipelineCard as PipelineCardData, User } from '@/types'

export const STALE_DAYS = 14

export function PipelineCardView({
  card,
  owner,
  overlay,
  className,
}: {
  card: PipelineCardData
  owner: User | undefined
  overlay?: boolean
  className?: string
}) {
  const stale = card.days_in_stage > STALE_DAYS
  return (
    <div
      className={cn(
        'space-y-2 rounded-lg border bg-card p-2.5 text-sm shadow-xs',
        overlay && 'rotate-2 shadow-lg ring-2 ring-primary/30',
        className,
      )}
    >
      <div className="flex items-start gap-2">
        <PersonAvatar name={card.name} src={card.profile_pic_url} className="size-8" />
        <div className="min-w-0 flex-1">
          <Link
            id={`pipeline-card-${card.id}`}
            to={`/influencers/${card.id}`}
            className="block truncate font-medium hover:underline"
            // A plain click opens the profile (drags need 6px of movement); no native link dragging.
            draggable={false}
          >
            {card.name}
          </Link>
          <AccountLabel account={card.primary_account} block className="text-xs text-muted-foreground" />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        <span className="font-medium text-foreground tabular-nums">{formatCompact(card.total_reach)}</span> reach ·{' '}
        {card.category}
      </p>
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
          {owner ? (
            <>
              <PersonAvatar name={owner.name} className="size-5 text-[9px]" />
              <span className="truncate">{owner.name}</span>
            </>
          ) : (
            'Unassigned'
          )}
        </span>
        <span
          className={cn(
            'inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 tabular-nums',
            stale ? 'bg-amber-100 font-medium text-amber-800 dark:bg-amber-400/15 dark:text-amber-300' : 'text-muted-foreground',
          )}
          title={stale ? `Over ${STALE_DAYS} days in this stage` : 'Days in this stage'}
        >
          <Clock className="size-3" />
          {card.days_in_stage}d
        </span>
      </div>
    </div>
  )
}

/** A card that can be dragged with the pointer or picked up with Space. */
export function DraggablePipelineCard({ card, owner }: { card: PipelineCardData; owner: User | undefined }) {
  // role=group (not dnd-kit's default button): the card contains a link, and buttons can't nest interactive
  // content. It's named by the influencer's name; dnd-kit adds the drag instructions via aria-describedby.
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: card.id,
    data: { card },
    attributes: { role: 'group' },
  })
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      aria-labelledby={`pipeline-card-${card.id}`}
      className={cn(
        'cursor-grab rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:cursor-grabbing',
        isDragging && 'opacity-40',
      )}
    >
      <PipelineCardView card={card} owner={owner} />
    </div>
  )
}
