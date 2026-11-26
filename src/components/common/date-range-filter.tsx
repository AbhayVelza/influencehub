import { TZDate } from '@date-fns/tz'
import { startOfMonth, subDays } from 'date-fns'
import { CalendarRange, ChevronDown } from 'lucide-react'
import { useState } from 'react'
import { DateInput } from '@/components/common/date-input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { APP_TIMEZONE } from '@/lib/constants'
import { dayToInput, formatDay, parseDateInput, toDayKey } from '@/lib/format'
import { cn } from '@/lib/utils'

export interface DateRange {
  /** yyyy-MM-dd (IST) */
  from?: string
  to?: string
}

const ymd = toDayKey

function presets(): { label: string; range: DateRange }[] {
  const today = new TZDate(Date.now(), APP_TIMEZONE)
  return [
    { label: 'Last 7 days', range: { from: ymd(subDays(today, 6)), to: ymd(today) } },
    { label: 'Last 30 days', range: { from: ymd(subDays(today, 29)), to: ymd(today) } },
    { label: 'This month', range: { from: ymd(startOfMonth(today)), to: ymd(today) } },
  ]
}

const short = formatDay

interface Draft {
  from: string
  to: string
}

const toDraft = (range: DateRange): Draft => ({ from: dayToInput(range.from), to: dayToInput(range.to) })

export function DateRangeFilter({ label, value, onChange }: { label: string; value: DateRange; onChange: (range: DateRange) => void }) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<Draft>(toDraft(value))
  const active = !!(value.from || value.to)

  // The text fields take dd/MM/yyyy; the range itself is yyyy-MM-dd.
  const from = parseDateInput(draft.from)
  const to = parseDateInput(draft.to)
  const badFrom = draft.from.trim() !== '' && !from
  const badTo = draft.to.trim() !== '' && !to
  const reversed = !!(from && to && from > to)
  const invalid = badFrom || badTo || reversed

  const apply = (range: DateRange) => {
    onChange(range)
    setOpen(false)
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) setDraft(toDraft(value))
        setOpen(next)
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            'gap-1.5 px-3.5',
            active && 'bg-tertiary-fixed/40 hover:bg-tertiary-fixed/60 aria-expanded:bg-tertiary-fixed/60 dark:bg-tertiary-fixed/40',
          )}
        >
          <CalendarRange className="text-muted-foreground" />
          <span className={cn(active ? 'text-muted-foreground' : 'text-on-surface')}>{label}</span>
          {active && (
            <span className="font-semibold text-primary tabular-nums">
              {value.from ? short(value.from) : '…'} – {value.to ? short(value.to) : '…'}
            </span>
          )}
          <ChevronDown className="size-[15px] text-outline" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 space-y-3">
        <div className="grid gap-1">
          {presets().map((p) => (
            <Button key={p.label} variant="ghost" size="sm" className="justify-start" onClick={() => apply(p.range)}>
              {p.label}
            </Button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2 border-t pt-3">
          <div className="grid gap-1">
            <Label htmlFor="range-from" className="text-small">
              From
            </Label>
            <DateInput id="range-from" value={draft.from} aria-invalid={badFrom} onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))} onPick={(from) => setDraft((d) => ({ ...d, from }))} />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="range-to" className="text-small">
              To
            </Label>
            <DateInput id="range-to" value={draft.to} aria-invalid={badTo} onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))} onPick={(to) => setDraft((d) => ({ ...d, to }))} />
          </div>
        </div>
        {(badFrom || badTo) && <p className="text-small text-destructive">Use dd/MM/yyyy</p>}
        {reversed && <p className="text-small text-destructive">“From” is after “To”</p>}
        <div className="flex justify-between">
          <Button variant="ghost" size="sm" disabled={!active} onClick={() => apply({})}>
            Clear
          </Button>
          <Button size="sm" disabled={invalid} onClick={() => apply({ from: from ?? undefined, to: to ?? undefined })}>
            Apply
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
