import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { PlatformMarks } from '@/components/common/platform-badge'
import { StageBadge } from '@/components/common/stage-badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useTeamMap } from '@/hooks/use-team'
import { PIPELINE_STAGES } from '@/lib/constants'
import { formatDate, formatLocation } from '@/lib/format'
import { cn } from '@/lib/utils'
import { getErrorMessage } from '@/services'
import type { Address, DuplicatePair, Influencer, MergeField, MergeRequest } from '@/types'
import { useMergeInfluencers } from './queries'

const formatAddress = (a: Address | null) =>
  a ? [a.line1, a.line2, `${a.city}, ${a.state} ${a.postal_code}`, a.country].filter(Boolean).join(', ') : null

const FIELDS: { key: MergeField; label: string; value: (i: Influencer, owners: Map<string, { name: string }>) => string | null }[] = [
  { key: 'name', label: 'Name', value: (i) => i.name },
  { key: 'category', label: 'Category', value: (i) => i.category },
  { key: 'phone', label: 'Phone', value: (i) => i.phone },
  { key: 'email', label: 'Email', value: (i) => i.email },
  { key: 'address', label: 'Address', value: (i) => formatAddress(i.address) },
  {
    key: 'location',
    label: 'City / state / country',
    value: (i) => {
      const l = formatLocation([i.city, i.state, i.country])
      return l === '—' ? null : l
    },
  },
  { key: 'notes', label: 'Notes', value: (i) => i.notes },
  { key: 'assigned_to', label: 'Owner', value: (i, owners) => (i.assigned_to ? (owners.get(i.assigned_to)?.name ?? '…') : 'Unassigned') },
]

/** Stage after the merge: the more advanced of the two (main pipeline beats On Hold / Rejected). */
function mergedStage(keep: Influencer, merge: Influencer) {
  return PIPELINE_STAGES.indexOf(merge.stage) > PIPELINE_STAGES.indexOf(keep.stage) ? merge.stage : keep.stage
}

function Choice({ name, checked, onChange, children }: { name: string; checked: boolean; onChange: () => void; children: ReactNode }) {
  return (
    <label
      className={cn(
        'flex min-w-0 cursor-pointer items-start gap-2 rounded-md border p-2 text-sm',
        checked ? 'border-primary/50 bg-primary/5' : 'hover:bg-muted/50',
      )}
    >
      <input type="radio" name={name} checked={checked} onChange={onChange} className="mt-1 accent-primary" />
      <span className="min-w-0 break-words">{children}</span>
    </label>
  )
}

/**
 * Pick the surviving record and, where the two differ, which value to keep. Accounts, calls, packages and activity
 * are combined; tags are joined; the more advanced stage is kept.
 */
export function MergeDialog({ pair, open, onOpenChange }: { pair: DuplicatePair; open: boolean; onOpenChange: (open: boolean) => void }) {
  const navigate = useNavigate()
  const team = useTeamMap()
  const merge = useMergeInfluencers()
  const [keepIndex, setKeepIndex] = useState<0 | 1>(0)
  const [choices, setChoices] = useState<Partial<Record<MergeField, 'keep' | 'merge'>>>({})
  const keep = pair.influencers[keepIndex]
  const other = pair.influencers[keepIndex === 0 ? 1 : 0]

  const differing = FIELDS.filter((f) => f.value(keep, team) !== f.value(other, team))
  /** Default: the surviving record's value, unless it's empty and the other one has something. */
  const choiceFor = (f: (typeof FIELDS)[number]) => choices[f.key] ?? (f.value(keep, team) === null && f.value(other, team) !== null ? 'merge' : 'keep')
  const combinedAccounts = [...keep.accounts, ...other.accounts.filter((a) => !keep.accounts.some((k) => k.platform === a.platform && k.handle === a.handle))]
  const stage = mergedStage(keep, other)

  const submit = () => {
    const field_choices: MergeRequest['field_choices'] = Object.fromEntries(differing.map((f) => [f.key, choiceFor(f)]))
    merge.mutate(
      { keep_id: keep.id, merge_id: other.id, field_choices },
      {
        onSuccess: (kept) => {
          toast.success(`Merged into ${kept.name}`, {
            action: { label: 'Open profile', onClick: () => navigate(`/influencers/${kept.id}`) },
          })
          onOpenChange(false)
        },
        onError: (err) => toast.error('Couldn’t merge', { description: getErrorMessage(err) }),
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !merge.isPending && onOpenChange(next)}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Merge duplicates</DialogTitle>
          <DialogDescription>The other record is folded into the one you keep, then deleted. This can’t be undone.</DialogDescription>
        </DialogHeader>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Keep which record?</legend>
          <div className="grid grid-cols-2 gap-2">
            {pair.influencers.map((inf, i) => (
              <Choice
                key={inf.id}
                name="keep"
                checked={keepIndex === i}
                onChange={() => {
                  setKeepIndex(i as 0 | 1)
                  setChoices({})
                }}
              >
                <span className="block font-medium">{inf.name}</span>
                <span className="block text-xs text-muted-foreground">
                  {inf.accounts.length} account{inf.accounts.length === 1 ? '' : 's'} · added {formatDate(inf.created_at)}
                </span>
              </Choice>
            ))}
          </div>
        </fieldset>

        {differing.length > 0 && (
          <fieldset className="space-y-3">
            <legend className="text-sm font-medium">Where they differ, keep…</legend>
            {differing.map((f) => (
              <div key={f.key} className="space-y-1" role="radiogroup" aria-label={f.label}>
                <p className="text-xs text-muted-foreground">{f.label}</p>
                <div className="grid grid-cols-2 gap-2">
                  {(['keep', 'merge'] as const).map((from) => {
                    const value = f.value(from === 'keep' ? keep : other, team)
                    return (
                      <Choice
                        key={from}
                        name={`field-${f.key}`}
                        checked={choiceFor(f) === from}
                        onChange={() => setChoices((c) => ({ ...c, [f.key]: from }))}
                      >
                        {value ?? <span className="text-muted-foreground">Empty</span>}
                      </Choice>
                    )
                  })}
                </div>
              </div>
            ))}
          </fieldset>
        )}

        <div className="space-y-1.5 rounded-md border bg-muted/30 p-3 text-sm">
          <p className="font-medium">After the merge</p>
          <p className="flex flex-wrap items-center gap-2 text-muted-foreground">
            {combinedAccounts.length} social accounts <PlatformMarks platforms={combinedAccounts.map((a) => a.platform)} />
          </p>
          <p className="text-muted-foreground">Calls, packages, activity and tags from both are combined.</p>
          <p className="flex items-center gap-2 text-muted-foreground">
            Stage: <StageBadge stage={stage} />
            {stage !== keep.stage && <span>(the more advanced of the two)</span>}
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={merge.isPending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={merge.isPending}>
            {merge.isPending ? 'Merging…' : `Merge into ${keep.name}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
