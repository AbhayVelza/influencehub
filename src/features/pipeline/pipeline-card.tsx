import { useDraggable } from '@dnd-kit/core'
import { CalendarClock, Clock, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import { PersonAvatar } from '@/components/common/person-avatar'
import { AccountLabel } from '@/components/common/platform-badge'
import { formatCompact, formatDateTime } from '@/lib/format'
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
        'group/card relative flex flex-col gap-2.5 rounded-2xl bg-surface-container-lowest/90 p-3.5 text-small shadow-[0_4px_20px_rgba(0,180,240,0.06)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-surface-container-lowest hover:shadow-[0_8px_28px_rgba(0,180,240,0.12)]',
        overlay && 'rotate-2 shadow-glass-glow ring-2 ring-on-tertiary-container/30',
        className,
      )}
    >
      <div className="flex items-center gap-2.5">
        <PersonAvatar
          name={card.name}
          src={card.profile_pic_url}
          className="size-10 rounded-xl bg-surface-container shadow-sm *:rounded-xl after:rounded-xl"
        />
        <div className="min-w-0 flex-1">
          <Link
            id={`pipeline-card-${card.id}`}
            to={`/influencers/${card.id}`}
            className="line-clamp-2 text-body font-semibold break-words text-primary transition-colors group-hover/card:text-on-tertiary-container hover:underline"
            // A plain click opens the profile (drags need 6px of movement); no native link dragging.
            draggable={false}
          >
            {card.name}
          </Link>
          <AccountLabel account={card.primary_account} block className="tabular-nums text-small text-muted-foreground" />
        </div>
      </div>
      <p className="flex items-center justify-between gap-2 rounded-xl bg-surface-container-low/50 p-2 text-small font-medium tracking-normal text-muted-foreground">
        <span className="flex shrink-0 items-center gap-1.5">
          <Users aria-hidden className="size-[15px]" strokeWidth={1.75} />
          <span className="font-semibold text-primary tabular-nums">{formatCompact(card.total_reach)}</span> followers
        </span>
        {card.category && (
          <span className="min-w-0 truncate rounded-full bg-secondary-fixed/50 px-2 py-0.5 text-on-secondary-fixed-variant">
            {card.category}
          </span>
        )}
      </p>
      {card.follow_up_date && (
        <p className="flex items-center gap-1.5 text-small text-muted-foreground">
          <CalendarClock aria-hidden className="size-3.5 shrink-0" strokeWidth={1.75} />
          <span className="truncate">Follow-up {formatDateTime(card.follow_up_date)}</span>
        </p>
      )}
      <div className="flex items-center justify-between gap-2 pt-0.5 text-small">
        <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
          {owner ? (
            <>
              <PersonAvatar name={owner.name} className="size-5 text-[9px] ring-1 ring-surface-container-lowest" />
              <span className="truncate">{owner.name}</span>
            </>
          ) : (
            'Unassigned'
          )}
        </span>
        <span
          className={cn(
            'inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 tabular-nums text-small ',
            stale
              ? 'bg-amber-100 font-semibold text-amber-800 dark:bg-amber-400/15 dark:text-amber-300'
              : 'text-muted-foreground/80',
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
        'cursor-grab rounded-2xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:cursor-grabbing',
        isDragging && 'opacity-40',
      )}
    >
      <PipelineCardView card={card} owner={owner} />
    </div>
  )
}
