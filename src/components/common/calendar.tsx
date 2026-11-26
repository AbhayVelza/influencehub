import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { formatDay, formatMonth, todayKey } from '@/lib/format'
import { cn } from '@/lib/utils'

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']

/** yyyy-MM-dd of a UTC-midnight Date (calendar maths in UTC, so no timezone shifts). */
const keyOf = (d: Date) => d.toISOString().slice(0, 10)

function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split('-').map(Number)
  return keyOf(new Date(Date.UTC(y, m - 1 + by, 1))).slice(0, 7)
}

/**
 * A month grid (weeks start on Monday). Days are yyyy-MM-dd; "today" is the IST date. `min` disables earlier days.
 */
export function Calendar({ selected, min, onSelect }: { selected?: string | null; min?: string; onSelect: (day: string) => void }) {
  const today = todayKey()
  const [month, setMonth] = useState(() => (selected ?? (min && min > today ? min : today)).slice(0, 7))
  const [y, m] = month.split('-').map(Number)
  const lead = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7
  const days = Array.from({ length: 42 }, (_, i) => new Date(Date.UTC(y, m - 1, 1 - lead + i)))

  return (
    <div className="w-64 select-none">
      <div className="mb-2 flex items-center justify-between">
        <Button type="button" variant="ghost" size="icon-sm" aria-label="Previous month" onClick={() => setMonth(shiftMonth(month, -1))}>
          <ChevronLeft />
        </Button>
        <p className="text-body font-semibold text-on-surface" aria-live="polite">
          {formatMonth(month)}
        </p>
        <Button type="button" variant="ghost" size="icon-sm" aria-label="Next month" onClick={() => setMonth(shiftMonth(month, 1))}>
          <ChevronRight />
        </Button>
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center">
        {WEEKDAYS.map((d) => (
          <span key={d} className="py-1 text-small text-muted-foreground" aria-hidden>
            {d}
          </span>
        ))}
        {days.map((d) => {
          const key = keyOf(d)
          const outside = key.slice(0, 7) !== month
          const disabled = !!min && key < min
          const isSelected = key === selected
          return (
            <button
              key={key}
              type="button"
              disabled={disabled}
              aria-label={formatDay(key)}
              aria-pressed={isSelected}
              onClick={() => onSelect(key)}
              className={cn(
                'h-8 rounded-lg text-body tabular-nums transition-colors hover:bg-surface-container-low focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:pointer-events-none disabled:opacity-35',
                outside && 'text-muted-foreground/60',
                key === today && 'font-semibold text-primary ring-1 ring-primary/30',
                isSelected && 'bg-primary text-primary-foreground hover:bg-primary',
              )}
            >
              {d.getUTCDate()}
            </button>
          )
        })}
      </div>
    </div>
  )
}
