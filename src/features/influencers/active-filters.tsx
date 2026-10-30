import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useTeamMap } from '@/hooks/use-team'
import { STAGE_META } from '@/lib/constants'
import { PLATFORM_META } from '@/lib/platforms'
import { formatFollowerRange } from '@/lib/format'
import type { InfluencerFilters } from '@/types'
import type { FilterChange } from './filter-bar'
import { AGREEMENT_OPTIONS, INSIGHTS_OPTIONS } from './list-params'

interface Chip {
  key: string
  label: string
  remove: () => void
}

interface ActiveFiltersProps {
  filters: InfluencerFilters
  onChange: FilterChange
  onClear: () => void
}

export function ActiveFilters({ filters, onChange, onClear }: ActiveFiltersProps) {
  const team = useTeamMap()
  const chips: Chip[] = []

  if (filters.q) chips.push({ key: 'q', label: `“${filters.q}”`, remove: () => onChange({ q: undefined }) })

  const listChips = (
    key: 'category' | 'platform' | 'country' | 'state' | 'city' | 'stage' | 'assigned_to',
    label: (value: string) => string,
  ) => {
    const values = (filters[key] ?? []) as string[]
    for (const value of values) {
      chips.push({
        key: `${key}:${value}`,
        label: label(value),
        remove: () => onChange({ [key]: values.filter((v) => v !== value) }),
      })
    }
  }
  listChips('category', (v) => v)
  listChips('platform', (v) => PLATFORM_META[v as keyof typeof PLATFORM_META]?.label ?? v)
  listChips('country', (v) => v)
  listChips('state', (v) => v)
  listChips('city', (v) => v)
  listChips('stage', (v) => STAGE_META[v as keyof typeof STAGE_META]?.label ?? v)
  listChips('assigned_to', (v) => `Owner: ${team.get(v)?.name ?? v}`)

  if (filters.agreement) {
    chips.push({
      key: 'agreement',
      label: `Agreement: ${AGREEMENT_OPTIONS.find((o) => o.value === filters.agreement)?.label}`,
      remove: () => onChange({ agreement: undefined }),
    })
  }
  if (filters.insights) {
    chips.push({
      key: 'insights',
      label: `Insights: ${INSIGHTS_OPTIONS.find((o) => o.value === filters.insights)?.label}`,
      remove: () => onChange({ insights: undefined }),
    })
  }

  if (filters.reach_min != null || filters.reach_max != null) {
    chips.push({
      key: 'reach',
      label: `Reach ${formatFollowerRange({ min: filters.reach_min, max: filters.reach_max })}`,
      remove: () => onChange({ reach_min: undefined, reach_max: undefined }),
    })
  }

  if (chips.length === 0) return null

  return (
    <div className="flex flex-wrap items-center gap-1.5" aria-label="Active filters">
      <span className="mr-1 text-xs text-muted-foreground">Active:</span>
      {chips.map((chip) => (
        <span
          key={chip.key}
          className="inline-flex h-6 items-center gap-1 rounded-full border bg-muted/60 pr-0.5 pl-2.5 text-xs font-medium"
        >
          {chip.label}
          <button
            type="button"
            onClick={chip.remove}
            className="flex size-5 items-center justify-center rounded-full text-muted-foreground hover:bg-background hover:text-foreground"
            aria-label={`Remove filter ${chip.label}`}
          >
            <X className="size-3" />
          </button>
        </span>
      ))}
      <Button variant="link" size="sm" className="h-6 px-1.5 text-xs" onClick={onClear}>
        Clear all
      </Button>
    </div>
  )
}
