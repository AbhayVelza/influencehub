import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useStageMover } from '@/features/influencers/stage-mover'
import { useMe } from '@/hooks/use-me'
import { useTeamMap } from '@/hooks/use-team'
import { ALL_STAGES, PIPELINE_STAGES, STAGE_META } from '@/lib/constants'
import { getStandardTransitions } from '@/lib/stages'
import { cn } from '@/lib/utils'
import type { InfluencerFilters, PipelineCard, PipelineResponse, Role, Stage, User } from '@/types'
import { columnKeyboardCoordinates, PIPELINE_KEYBOARD_CODES } from './keyboard'
import { DraggablePipelineCard, PipelineCardView } from './pipeline-card'
import { fetchPreviousStage, pipelineKey } from './queries'

const COLLAPSE_KEY = 'influencehub-pipeline-collapsed'

function loadCollapsed(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(COLLAPSE_KEY) ?? 'null') ?? { on_hold: true, rejected: true }
  } catch {
    return { on_hold: true, rejected: true }
  }
}

type DropKind = 'standard' | 'override' | 'blocked' | 'current'

/** Standard moves for the role; admins can also drop anywhere else as an override. */
function dropKind(card: PipelineCard, to: Stage, role: Role, previous: Stage | null): DropKind {
  if (to === card.stage) return 'current'
  if (getStandardTransitions(card.stage, role, previous).includes(to)) return 'standard'
  return role === 'admin' ? 'override' : 'blocked'
}

// Pointer drops use the column under the pointer; keyboard drops (no pointer) fall back to overlap.
const collision: CollisionDetection = (args) => {
  const hits = pointerWithin(args)
  return hits.length ? hits : rectIntersection(args)
}

function Column({
  stage,
  cards,
  team,
  drag,
  collapsed,
  onToggle,
}: {
  stage: Stage
  cards: PipelineCard[]
  team: Map<string, User>
  drag: DropKind | null
  collapsed: boolean
  onToggle?: () => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage })
  const meta = STAGE_META[stage]

  // Three distinguishable drop states: standard = cyan ring, override = dashed amber ring, blocked = dimmed.
  const dropStyle =
    drag === 'standard'
      ? 'ring-2 ring-on-tertiary-container/45'
      : drag === 'override'
        ? 'ring-2 ring-dashed ring-amber-500/60'
        : drag === 'blocked'
          ? 'opacity-45'
          : ''
  // A soft glow in the stage's own colour around its 10px dot.
  const glow = { boxShadow: `0 0 8px ${meta.hex}66` }

  if (collapsed) {
    return (
      <section
        ref={setNodeRef}
        aria-label={`${meta.label}, ${cards.length} influencers (collapsed)`}
        className={cn(
          'group/strip flex w-14 shrink-0 flex-col items-center justify-between gap-3 rounded-2xl bg-surface-container-lowest/50 p-2.5 shadow-[0_8px_32px_0_rgba(14,26,36,0.03)] backdrop-blur-2xl transition-all duration-200 hover:bg-surface-container-lowest/80',
          dropStyle,
          isOver && drag !== 'blocked' && 'bg-tertiary-fixed/40',
        )}
      >
        <div className="flex flex-col items-center gap-2 pt-1">
          <span aria-hidden className={cn('size-2.5 shrink-0 rounded-full', meta.dot)} style={glow} />
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-surface-container px-1 text-label-sm text-muted-foreground tabular-nums">
            {cards.length}
          </span>
        </div>
        <span className="flex rotate-180 items-center gap-2 py-4 text-headline-sm font-medium tracking-tight text-muted-foreground transition-colors [writing-mode:vertical-rl] group-hover/strip:text-primary">
          {meta.label}
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          className="bg-surface-container-low/70 text-outline group-hover/strip:bg-surface-container group-hover/strip:text-primary"
          onClick={onToggle}
          aria-label={`Expand ${meta.label}`}
        >
          <ChevronLeft className="size-[18px]" />
        </Button>
      </section>
    )
  }

  return (
    <section
      ref={setNodeRef}
      aria-label={`${meta.label}, ${cards.length} influencers`}
      className={cn(
        // Flexible width: the five main columns share the space (min 12rem), so the whole board fits on
        // wide screens and scrolls horizontally on narrow ones.
        'flex min-w-60 flex-1 basis-0 flex-col rounded-2xl bg-surface-container-lowest/65 p-space-sm shadow-glass backdrop-blur-2xl transition-all',
        dropStyle,
        isOver && drag !== 'blocked' && drag !== 'current' && 'bg-tertiary-fixed/30',
      )}
    >
      {/* Keep this header ~40px: keyboard moves land 56px below the column's top (see keyboard.ts). */}
      <header className="mb-space-xs flex h-10 items-center gap-2 px-space-xs">
        <span aria-hidden className={cn('size-2.5 shrink-0 rounded-full', meta.dot)} style={glow} />
        <h2 className="min-w-0 truncate text-headline-sm font-semibold tracking-tight text-primary">{meta.label}</h2>
        <span className="ml-auto flex items-center gap-1.5">
          {drag === 'override' && <span className="text-[11px] font-medium text-amber-700 dark:text-amber-400">Override</span>}
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-surface-container-highest px-1 text-label-sm text-muted-foreground tabular-nums">
            {cards.length}
          </span>
          {onToggle && (
            <Button variant="ghost" size="icon-xs" className="text-outline hover:text-primary" onClick={onToggle} aria-label={`Collapse ${meta.label}`}>
              <ChevronRight />
            </Button>
          )}
        </span>
      </header>
      <ol className="-mx-1 flex max-h-[calc(100svh-17rem)] min-h-24 flex-col gap-space-sm overflow-y-auto px-1 pt-0.5 pb-1">
        {cards.length === 0 && (
          <li className="rounded-2xl border border-dashed border-outline-variant/40 bg-surface-container-low/30 px-3 py-6 text-center text-label-md text-muted-foreground">
            No influencers
          </li>
        )}
        {cards.map((card) => (
          <li key={card.id}>
            <DraggablePipelineCard card={card} owner={card.assigned_to ? team.get(card.assigned_to) : undefined} />
          </li>
        ))}
      </ol>
    </section>
  )
}

export function PipelineBoard({ data, filters }: { data: PipelineResponse; filters: InfluencerFilters }) {
  const { data: me } = useMe()
  const role: Role = me?.role ?? 'executive'
  const team = useTeamMap()
  const queryClient = useQueryClient()
  const mover = useStageMover()
  const [active, setActive] = useState<PipelineCard | null>(null)
  const [previous, setPrevious] = useState<Stage | null>(null)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(loadCollapsed)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: columnKeyboardCoordinates, keyboardCodes: PIPELINE_KEYBOARD_CODES }),
  )

  const toggle = (stage: Stage) =>
    setCollapsed((c) => {
      const next = { ...c, [stage]: !c[stage] }
      try {
        localStorage.setItem(COLLAPSE_KEY, JSON.stringify(next))
      } catch {
        // Not persisted.
      }
      return next
    })

  const byStage = new Map(data.columns.map((c) => [c.stage, c.items]))
  const label = (id: unknown) => STAGE_META[id as Stage]?.label ?? String(id)

  const onDragStart = ({ active: a }: DragStartEvent) => {
    const card = a.data.current?.card as PipelineCard
    setActive(card)
    setPrevious(null)
    // On-hold cards may resume to their previous stage; look it up while the card is in the air.
    if (card.stage === 'on_hold') void fetchPreviousStage(card.id).then(setPrevious).catch(() => setPrevious(null))
  }

  const moveCardLocally = (card: PipelineCard, to: Stage) => {
    const key = pipelineKey(filters)
    const before = queryClient.getQueryData<PipelineResponse>(key)
    return {
      apply: () =>
        queryClient.setQueryData<PipelineResponse>(key, (old) =>
          old
            ? {
                columns: old.columns.map((col) => {
                  const items = col.items.filter((c) => c.id !== card.id)
                  if (col.stage === to) items.unshift({ ...card, stage: to, days_in_stage: 0 })
                  return { ...col, items, count: items.length }
                }),
              }
            : old,
        ),
      rollback: () => queryClient.setQueryData(key, before),
    }
  }

  const onDragEnd = async ({ active: a, over }: DragEndEvent) => {
    const card = a.data.current?.card as PipelineCard
    setActive(null)
    if (!over || over.id === card.stage) return
    const to = over.id as Stage
    const prev = card.stage === 'on_hold' ? (previous ?? (await fetchPreviousStage(card.id).catch(() => null))) : null
    const kind = dropKind(card, to, role, prev)
    if (kind === 'blocked') {
      const allowed = getStandardTransitions(card.stage, role, prev).map((s) => STAGE_META[s].label)
      toast.error(`Can’t move ${card.name} from ${label(card.stage)} to ${label(to)}`, {
        description: allowed.length ? `Allowed: ${allowed.join(', ')}` : `No standard moves from ${label(card.stage)}.`,
      })
      return
    }
    if (kind === 'override') return mover.requestMove(card, to, { override: true })
    const direct = to !== 'on_hold' && to !== 'rejected'
    await mover.requestMove(card, to, direct ? { optimistic: moveCardLocally(card, to) } : {})
  }

  const nameOf = (a: { data: { current?: Record<string, unknown> } }) =>
    (a.data.current?.card as PipelineCard | undefined)?.name ?? 'Card'

  const announcements: Announcements = {
    onDragStart: ({ active: a }) =>
      `Picked up ${nameOf(a)}. Use the left and right arrow keys to choose a stage, Space to drop, Escape to cancel.`,
    onDragOver: ({ active: a, over }) => {
      const card = a.data.current?.card as PipelineCard
      if (!over) return `${card.name} is not over a stage.`
      // The first "over" (its own column) lands in the same render as onDragStart and replaces it in the
      // live region, so it carries the pick-up instructions itself.
      if (over.id === card.stage) {
        return `Picked up ${card.name} in ${label(over.id)}. Use the left and right arrow keys to choose a stage, Space to drop, Escape to cancel.`
      }
      const kind = dropKind(card, over.id as Stage, role, previous)
      const note = kind === 'blocked' ? ' Not allowed.' : kind === 'override' ? ' Admin override.' : ''
      return `${card.name} is over ${label(over.id)}.${note}`
    },
    onDragEnd: ({ active: a, over }) =>
      over ? `${nameOf(a)} dropped on ${label(over.id)}.` : 'Dropped outside the board.',
    onDragCancel: ({ active: a }) => `Cancelled. ${nameOf(a)} stays where it was.`,
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collision}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActive(null)}
      accessibility={{
        announcements,
        screenReaderInstructions: {
          draggable:
            'To move an influencer to another stage, press Space, use the left and right arrow keys to pick a column, then press Space to drop or Escape to cancel.',
        },
      }}
    >
      <div className="flex gap-space-md overflow-x-auto pt-1 pb-3" role="region" aria-label="Pipeline board">
        {ALL_STAGES.map((stage) => {
          const side = !PIPELINE_STAGES.includes(stage)
          return (
            <Column
              key={stage}
              stage={stage}
              cards={byStage.get(stage) ?? []}
              team={team}
              drag={active ? dropKind(active, stage, role, previous) : null}
              collapsed={side && !!collapsed[stage]}
              onToggle={side ? () => toggle(stage) : undefined}
            />
          )
        })}
      </div>
      <DragOverlay dropAnimation={null}>
        {active && (
          <PipelineCardView card={active} owner={active.assigned_to ? team.get(active.assigned_to) : undefined} overlay className="w-60" />
        )}
      </DragOverlay>
      {mover.dialogs}
    </DndContext>
  )
}
