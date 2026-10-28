import { TZDate } from '@date-fns/tz'
import { format, startOfMonth, subDays } from 'date-fns'
import { CalendarRange, ChevronDown } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { APP_TIMEZONE } from '@/lib/constants'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'

export interface DateRange {
  /** yyyy-MM-dd (IST) */
  from?: string
  to?: string
}

const ymd = (d: Date) => format(d, 'yyyy-MM-dd')

function presets(): { label: string; range: DateRange }[] {
  const today = new TZDate(Date.now(), APP_TIMEZONE)
  return [
    { label: 'Last 7 days', range: { from: ymd(subDays(today, 6)), to: ymd(today) } },
    { label: 'Last 30 days', range: { from: ymd(subDays(today, 29)), to: ymd(today) } },
    { label: 'This month', range: { from: ymd(startOfMonth(today)), to: ymd(today) } },
  ]
}

const short = (day: string) => formatDate(`${day}T12:00:00+05:30`, 'd MMM')

export function DateRangeFilter({ label, value, onChange }: { label: string; value: DateRange; onChange: (range: DateRange) => void }) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<DateRange>(value)
  const active = !!(value.from || value.to)
  const invalid = !!(draft.from && draft.to && draft.from > draft.to)

  const apply = (range: DateRange) => {
    onChange(range)
    setOpen(false)
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) setDraft(value)
        setOpen(next)
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className={cn('gap-1.5', active && 'border-primary/40 bg-primary/5 dark:bg-primary/10')}>
          <CalendarRange />
          <span className={cn(active && 'text-muted-foreground')}>{label}</span>
          {active && (
            <span>
              {value.from ? short(value.from) : '…'} – {value.to ? short(value.to) : '…'}
            </span>
          )}
          <ChevronDown className="opacity-60" />
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
            <Label htmlFor="range-from" className="text-xs">
              From
            </Label>
            <Input id="range-from" type="date" value={draft.from ?? ''} onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value || undefined }))} />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="range-to" className="text-xs">
              To
            </Label>
            <Input id="range-to" type="date" value={draft.to ?? ''} onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value || undefined }))} />
          </div>
        </div>
        {invalid && <p className="text-xs text-destructive">“From” is after “To”</p>}
        <div className="flex justify-between">
          <Button variant="ghost" size="sm" disabled={!active} onClick={() => apply({})}>
            Clear
          </Button>
          <Button size="sm" disabled={invalid} onClick={() => apply(draft)}>
            Apply
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
