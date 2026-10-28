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
import { StageDot } from '@/components/common/stage-badge'
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

  const dropStyle =
    drag === 'standard'
      ? 'ring-2 ring-primary/40'
      : drag === 'override'
        ? 'ring-2 ring-dashed ring-amber-500/60'
        : drag === 'blocked'
          ? 'opacity-45'
          : ''

  if (collapsed) {
    return (
      <section
        ref={setNodeRef}
        aria-label={`${meta.label}, ${cards.length} influencers (collapsed)`}
        className={cn(
          'flex w-14 shrink-0 flex-col items-center gap-2 rounded-xl border bg-muted/40 py-3 transition-shadow',
          dropStyle,
          isOver && drag !== 'blocked' && 'bg-primary/10',
        )}
      >
        <Button variant="ghost" size="icon-xs" onClick={onToggle} aria-label={`Expand ${meta.label}`}>
          <ChevronLeft />
        </Button>
        <span className="rounded-full bg-background px-1.5 text-xs font-medium tabular-nums">{cards.length}</span>
        <span className="flex items-center gap-1.5 text-xs font-medium [writing-mode:vertical-rl]">
          <StageDot stage={stage} />
          {meta.label}
        </span>
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
        'flex min-w-48 flex-1 basis-0 flex-col rounded-xl border bg-muted/40 transition-shadow',
        dropStyle,
        isOver && drag !== 'blocked' && drag !== 'current' && 'bg-primary/5',
      )}
    >
      <header className="flex items-center gap-2 px-3 py-2.5">
        <StageDot stage={stage} className="size-2" />
        <h2 className="text-sm font-medium">{meta.label}</h2>
        <span className="rounded-full bg-background px-1.5 text-xs font-medium tabular-nums">{cards.length}</span>
        {drag === 'override' && <span className="ml-auto text-[11px] font-medium text-amber-700 dark:text-amber-400">Override</span>}
        {onToggle && (
          <Button variant="ghost" size="icon-xs" className="ml-auto" onClick={onToggle} aria-label={`Collapse ${meta.label}`}>
            <ChevronRight />
          </Button>
        )}
      </header>
      <ol className="flex max-h-[calc(100svh-17rem)] min-h-24 flex-col gap-2 overflow-y-auto px-2 pb-2">
        {cards.length === 0 && <li className="px-1 py-4 text-center text-xs text-muted-foreground">No influencers</li>}
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
      <div className="flex gap-3 overflow-x-auto pb-3" role="region" aria-label="Pipeline board">
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
