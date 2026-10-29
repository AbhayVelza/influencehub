import { useQueryClient } from '@tanstack/react-query'
import { ArrowRightLeft, ChevronDown, Download, RefreshCw, Trash2, UserRound, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { PersonAvatar } from '@/components/common/person-avatar'
import { ReasonList } from '@/components/common/reason-list'
import { StageDot } from '@/components/common/stage-badge'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useMe } from '@/hooks/use-me'
import { useTeam } from '@/hooks/use-team'
import { ALL_STAGES, STAGE_META } from '@/lib/constants'
import { waitForJob } from '@/lib/jobs'
import { can } from '@/lib/permissions'
import { queryKeys } from '@/lib/query'
import { getStandardTransitions } from '@/lib/stages'
import { getErrorMessage } from '@/services'
import type { BulkResult, BulkSyncResult, Influencer, Role, Stage } from '@/types'
import { useBulkAction } from './queries'
import { useExportInfluencers } from './use-export'

interface BulkActionsBarProps {
  rows: Influencer[]
  onClear: () => void
  /** Called after an action; rows that weren't processed stay selected. */
  onSettled: (keepIds: string[]) => void
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/**
 * Standard moves only (bulk can't override). On-hold rows can only be rejected in bulk: returning to the
 * previous stage needs each row's history, so that's done one at a time from the detail page.
 */
function transitionsFor(row: Influencer, role: Role): Stage[] {
  return getStandardTransitions(row.stage, role, null)
}

function report(done: number, reasons: string[], titles: { all: string; none: string; partial: string }) {
  if (reasons.length === 0) return toast.success(titles.all)
  const description = <ReasonList reasons={reasons} />
  if (done === 0) return toast.error(titles.none, { description, duration: 10_000 })
  toast.warning(titles.partial, { description, duration: 10_000 })
}

export function BulkActionsBar({ rows, onClear, onSettled }: BulkActionsBarProps) {
  const { data: me } = useMe()
  const role: Role = me?.role ?? 'executive'
  const team = useTeam()
  const bulk = useBulkAction()
  const queryClient = useQueryClient()
  const { exportInfluencers, isExporting } = useExportInfluencers()
  const [isSyncing, setIsSyncing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const ids = rows.map((r) => r.id)
  const names = new Map(rows.map((r) => [r.id, r.name]))
  const withName = (failed: { id: string; message: string }[]) =>
    failed.map((f) => `${names.get(f.id) ?? f.id}: ${f.message}`)
  const busy = bulk.isPending || isSyncing || isExporting

  const stageOptions = useMemo(() => {
    const counts = new Map<Stage, number>()
    for (const row of rows) for (const to of transitionsFor(row, role)) counts.set(to, (counts.get(to) ?? 0) + 1)
    return ALL_STAGES.filter((s) => counts.has(s)).map((stage) => ({ stage, count: counts.get(stage)! }))
  }, [rows, role])

  const run = async (request: () => Promise<BulkResult>): Promise<BulkResult | null> => {
    try {
      return await request()
    } catch (err) {
      toast.error('Bulk action failed', { description: getErrorMessage(err) })
      return null
    }
  }

  const moveTo = async (to: Stage) => {
    const eligible = rows.filter((r) => transitionsFor(r, role).includes(to))
    const skipped = rows
      .filter((r) => !eligible.includes(r))
      .map((r) => `${r.name}: can’t move from ${STAGE_META[r.stage].label} to ${STAGE_META[to].label}`)
    const res = eligible.length
      ? await run(() => bulk.mutateAsync({ ids: eligible.map((r) => r.id), action: 'change_stage', value: to }))
      : { succeeded: [], failed: [], job_id: null }
    if (!res) return
    const moved = res.succeeded.length
    const reasons = [...skipped, ...withName(res.failed)]
    report(moved, reasons, {
      all: `${plural(moved, 'influencer')} moved to ${STAGE_META[to].label}`,
      none: `No influencers moved to ${STAGE_META[to].label}`,
      partial: `${moved} moved, ${reasons.length} skipped`,
    })
    onSettled(ids.filter((id) => !res.succeeded.includes(id)))
  }

  const assign = async (userId: string | null) => {
    const res = await run(() => bulk.mutateAsync({ ids, action: 'assign', value: userId }))
    if (!res) return
    const owner = userId ? (team.data?.items.find((u) => u.id === userId)?.name ?? 'owner') : null
    report(res.succeeded.length, withName(res.failed), {
      all: owner ? `${plural(res.succeeded.length, 'influencer')} assigned to ${owner}` : `${plural(res.succeeded.length, 'influencer')} unassigned`,
      none: 'No influencers were reassigned',
      partial: `${res.succeeded.length} reassigned, ${res.failed.length} skipped`,
    })
    onSettled(res.failed.map((f) => f.id))
  }

  const sync = async () => {
    setIsSyncing(true)
    const toastId = toast.loading(`Syncing ${plural(ids.length, 'account')} from Instagram…`)
    try {
      const res = await bulk.mutateAsync({ ids, action: 'sync' })
      let synced = 0
      const failed: { id: string; message: string }[] = [...res.failed]
      if (res.job_id) {
        const job = await waitForJob<BulkSyncResult>(res.job_id, (j) =>
          toast.loading(`Syncing ${plural(ids.length, 'account')} from Instagram… ${j.progress}%`, { id: toastId }),
        )
        if (job.status === 'failed' || !job.result) throw new Error(job.error?.message ?? 'Sync failed')
        synced = job.result.synced
        failed.push(...job.result.failed)
      }
      toast.dismiss(toastId)
      report(synced, withName(failed), {
        all: `${plural(synced, 'account')} synced`,
        none: 'No accounts synced',
        partial: `${synced} synced, ${failed.length} failed`,
      })
      onSettled(failed.map((f) => f.id))
    } catch (err) {
      toast.error('Sync failed', { id: toastId, description: getErrorMessage(err) })
    } finally {
      setIsSyncing(false)
      // Sync status flips to "pending" immediately and to "synced" when the job ends.
      void queryClient.invalidateQueries({ queryKey: queryKeys.influencers })
    }
  }

  const remove = async () => {
    setConfirmDelete(false)
    const res = await run(() => bulk.mutateAsync({ ids, action: 'delete' }))
    if (!res) return
    report(res.succeeded.length, withName(res.failed), {
      all: `${plural(res.succeeded.length, 'influencer')} deleted`,
      none: 'No influencers were deleted',
      partial: `${res.succeeded.length} deleted, ${res.failed.length} skipped`,
    })
    onSettled(res.failed.map((f) => f.id))
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm font-medium tabular-nums">{rows.length} selected</span>
      <Button variant="ghost" size="icon-xs" onClick={onClear} aria-label="Clear selection" disabled={busy}>
        <X />
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" disabled={busy}>
            <ArrowRightLeft />
            Change stage
            <ChevronDown className="opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-60">
          <DropdownMenuLabel className="text-xs text-muted-foreground">Move selected to</DropdownMenuLabel>
          {stageOptions.length === 0 ? (
            <DropdownMenuItem disabled>No standard moves for this selection</DropdownMenuItem>
          ) : (
            stageOptions.map(({ stage, count }) => (
              <DropdownMenuItem key={stage} onSelect={() => moveTo(stage)}>
                <StageDot stage={stage} />
                {STAGE_META[stage].label}
                {count < rows.length && (
                  <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                    {count} of {rows.length}
                  </span>
                )}
              </DropdownMenuItem>
            ))
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {can(role, 'influencer:reassign') && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" disabled={busy}>
              <UserRound />
              Assign
              <ChevronDown className="opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuLabel className="text-xs text-muted-foreground">Assign selected to</DropdownMenuLabel>
            {team.isLoading && <DropdownMenuItem disabled>Loading team…</DropdownMenuItem>}
            {team.isError && <DropdownMenuItem disabled>Couldn’t load team</DropdownMenuItem>}
            {team.data?.items
              .filter((u) => u.is_active)
              .map((user) => (
                <DropdownMenuItem key={user.id} onSelect={() => assign(user.id)}>
                  <PersonAvatar name={user.name} className="size-5 text-[9px]" />
                  {user.name}
                </DropdownMenuItem>
              ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => assign(null)}>Unassign</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      <Button variant="outline" size="sm" disabled={busy} onClick={sync}>
        <RefreshCw className={isSyncing ? 'animate-spin' : undefined} />
        Sync IG
      </Button>

      {can(role, 'data:export') && (
        <Button variant="outline" size="sm" disabled={busy} onClick={() => exportInfluencers({ ids })}>
          <Download />
          Export
        </Button>
      )}

      {can(role, 'influencer:delete') && (
        <Button variant="destructive" size="sm" disabled={busy} onClick={() => setConfirmDelete(true)}>
          <Trash2 />
          Delete
        </Button>
      )}

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {plural(rows.length, 'influencer')}?</AlertDialogTitle>
            <AlertDialogDescription>
              This also removes their calls, packages and activity history. It can’t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={remove}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
