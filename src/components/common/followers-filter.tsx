import { ChevronDown } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { formatFollowerRange, parseCompactNumber, type FollowerRange as Range } from '@/lib/format'
import { cn } from '@/lib/utils'

const PRESETS: { label: string; range: Range }[] = [
  { label: 'Nano · under 10K', range: { max: 9_999 } },
  { label: 'Micro · 10K–100K', range: { min: 10_000, max: 100_000 } },
  { label: 'Mid · 100K–500K', range: { min: 100_000, max: 500_000 } },
  { label: 'Macro · 500K–1M', range: { min: 500_000, max: 1_000_000 } },
  { label: 'Mega · 1M+', range: { min: 1_000_000 } },
]

interface FollowersFilterProps {
  min?: number
  max?: number
  onChange: (range: Range) => void
}

export function FollowersFilter({ min, max, onChange }: FollowersFilterProps) {
  const [open, setOpen] = useState(false)
  const [minText, setMinText] = useState('')
  const [maxText, setMaxText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const active = min != null || max != null

  const onOpenChange = (next: boolean) => {
    if (next) {
      setMinText(min != null ? String(min) : '')
      setMaxText(max != null ? String(max) : '')
      setError(null)
    }
    setOpen(next)
  }

  const apply = (range: Range) => {
    onChange(range)
    setOpen(false)
  }

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    const nextMin = minText.trim() ? parseCompactNumber(minText) : undefined
    const nextMax = maxText.trim() ? parseCompactNumber(maxText) : undefined
    if ((minText.trim() && nextMin === undefined) || (maxText.trim() && nextMax === undefined)) {
      setError('Use numbers like 25000, 25k or 1.2m')
      return
    }
    if (nextMin != null && nextMax != null && nextMin > nextMax) {
      setError('Minimum is larger than maximum')
      return
    }
    apply({ min: nextMin, max: nextMax })
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn('gap-1.5', active && 'border-primary/40 bg-primary/5 dark:bg-primary/10')}
        >
          <span className={cn(active && 'text-muted-foreground')}>Followers</span>
          {active && <span>{formatFollowerRange({ min, max })}</span>}
          <ChevronDown className="opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 space-y-3">
        <div className="grid gap-1">
          {PRESETS.map((preset) => (
            <Button
              key={preset.label}
              variant="ghost"
              size="sm"
              className="justify-start"
              onClick={() => apply(preset.range)}
            >
              {preset.label}
            </Button>
          ))}
        </div>
        <form onSubmit={onSubmit} className="space-y-2 border-t pt-3" noValidate>
          <div className="grid grid-cols-2 gap-2">
            <div className="grid gap-1">
              <Label htmlFor="followers-min" className="text-xs">
                Min
              </Label>
              <Input id="followers-min" inputMode="decimal" placeholder="e.g. 10k" value={minText} onChange={(e) => setMinText(e.target.value)} />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="followers-max" className="text-xs">
                Max
              </Label>
              <Input id="followers-max" inputMode="decimal" placeholder="e.g. 500k" value={maxText} onChange={(e) => setMaxText(e.target.value)} />
            </div>
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex justify-between gap-2">
            <Button type="button" variant="ghost" size="sm" disabled={!active} onClick={() => apply({})}>
              Clear
            </Button>
            <Button type="submit" size="sm">
              Apply
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  )
}
