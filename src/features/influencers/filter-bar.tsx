import { useEffect } from 'react'
import { FollowersFilter } from '@/components/common/followers-filter'
import { MultiSelectFilter } from '@/components/common/multi-select-filter'
import { StageDot } from '@/components/common/stage-badge'
import type { InfluencerFilters, Stage } from '@/types'
import { useFilterOptions } from './queries'

/** Stable empty selection, so effect dependencies don't change every render. */
const NONE: string[] = []

export type FilterChange =(patch: Partial<InfluencerFilters>, options?: { replace?: boolean }) => void

interface InfluencerFilterBarProps {
  filters: InfluencerFilters
  onChange: FilterChange
}

/** Category / Country → State → City / Stage / Assigned / Followers. Shared by the list and pipeline. */
export function InfluencerFilterBar({ filters, onChange }: InfluencerFilterBarProps) {
  const country = filters.country ?? NONE
  const state = filters.state ?? NONE
  const city = filters.city ?? NONE
  const { data: options, isLoading, isError, isPlaceholderData } = useFilterOptions(country, state)
  const hint = isError ? 'Couldn’t load options. Try again later.' : undefined
  // States and cities depend on the selection above them; don't offer the previous narrowing while it reloads.
  const narrowing = isLoading || isPlaceholderData

  // Cascade: drop selected states/cities that no longer belong to the selected countries/states.
  useEffect(() => {
    if (!options || isPlaceholderData) return
    const validStates = new Set(options.states.map((o) => o.value))
    const validCities = new Set(options.cities.map((o) => o.value))
    const nextState = state.filter((s) => validStates.has(s))
    const nextCity = city.filter((c) => validCities.has(c))
    if (nextState.length !== state.length || nextCity.length !== city.length) {
      onChange({ state: nextState, city: nextCity }, { replace: true })
    }
  }, [options, isPlaceholderData, state, city, onChange])

  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filters">
      <MultiSelectFilter
        label="Category"
        options={options?.categories}
        selected={filters.category ?? []}
        onChange={(category) => onChange({ category })}
        loading={isLoading}
        hint={hint}
      />
      <MultiSelectFilter
        label="Country"
        options={options?.countries}
        selected={country}
        onChange={(next) => onChange({ country: next })}
        loading={isLoading}
        hint={hint}
      />
      <MultiSelectFilter
        label="State"
        options={options?.states}
        selected={state}
        onChange={(next) => onChange({ state: next })}
        loading={narrowing}
        hint={hint}
      />
      <MultiSelectFilter
        label="City"
        options={options?.cities}
        selected={city}
        onChange={(next) => onChange({ city: next })}
        loading={narrowing}
        hint={hint}
      />
      <MultiSelectFilter
        label="Stage"
        options={options?.stages}
        selected={filters.stage ?? []}
        onChange={(next) => onChange({ stage: next as Stage[] })}
        loading={isLoading}
        hint={hint}
        renderOption={(o) => (
          <>
            <StageDot stage={o.value as Stage} />
            {o.label}
          </>
        )}
      />
      <MultiSelectFilter
        label="Assigned"
        options={options?.assigned_to}
        selected={filters.assigned_to ?? []}
        onChange={(next) => onChange({ assigned_to: next })}
        loading={isLoading}
        hint={hint}
        searchPlaceholder="Search team…"
      />
      <FollowersFilter
        min={filters.followers_min}
        max={filters.followers_max}
        onChange={({ min, max }) => onChange({ followers_min: min, followers_max: max })}
      />
    </div>
  )
}
