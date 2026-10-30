import { useEffect } from 'react'
import { FollowersFilter } from '@/components/common/followers-filter'
import { MultiSelectFilter } from '@/components/common/multi-select-filter'
import { PlatformMark } from '@/components/common/platform-badge'
import { StageDot } from '@/components/common/stage-badge'
import type { InfluencerFilters, Platform, Stage } from '@/types'
import { AGREEMENT_OPTIONS, INSIGHTS_OPTIONS } from './list-params'
import { useFilterOptions, type FilterSource } from './queries'

/** Stable empty selection, so effect dependencies don't change every render. */
const NONE: string[] = []

/** These filters take one choice: a newly ticked option is last, and replaces the one before it. */
const latestChoice = (next: string[]) => next[next.length - 1]

export type FilterChange = (patch: Partial<InfluencerFilters>, options?: { replace?: boolean }) => void

interface InfluencerFilterBarProps {
  filters: InfluencerFilters
  onChange: FilterChange
  /** The pipeline shows every stage as a column, so it has no Stage filter. */
  hideStage?: boolean
  /** No owner filter: executives only see their own influencers, and the pool has no owners. */
  hideAssigned?: boolean
  /** Documents aren't kept for the Unassigned Pool, so it has no Agreement / Insights filters. */
  hideDocuments?: boolean
  /** Whose options and counts: the influencers list (default) or the Unassigned Pool. */
  source?: FilterSource
}

/** Category / Platform / Country → State → City / Stage / Assigned / Total reach. Shared by the list, pipeline and pool. */
export function InfluencerFilterBar({ filters, onChange, hideStage, hideAssigned, hideDocuments, source = 'influencers' }: InfluencerFilterBarProps) {
  const country = filters.country ?? NONE
  const state = filters.state ?? NONE
  const city = filters.city ?? NONE
  const { data: options, isLoading, isError, isPlaceholderData } = useFilterOptions(country, state, source)
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
        label="Platform"
        options={options?.platforms.filter((o) => o.count > 0)}
        selected={filters.platform ?? []}
        onChange={(next) => onChange({ platform: next as Platform[] })}
        loading={isLoading}
        hint={hint}
        renderOption={(o) => (
          <>
            <PlatformMark platform={o.value as Platform} />
            {o.label}
          </>
        )}
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
      {!hideStage && (
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
      )}
      {!hideAssigned && (
        <MultiSelectFilter
          label="Assigned"
          options={options?.assigned_to}
          selected={filters.assigned_to ?? []}
          onChange={(next) => onChange({ assigned_to: next })}
          loading={isLoading}
          hint={hint}
          searchPlaceholder="Search team…"
        />
      )}
      {!hideDocuments && (
        <>
          <MultiSelectFilter
            label="Agreement"
            options={AGREEMENT_OPTIONS}
            selected={filters.agreement ? [filters.agreement] : NONE}
            onChange={(next) => onChange({ agreement: latestChoice(next) as InfluencerFilters['agreement'] })}
          />
          <MultiSelectFilter
            label="Insights"
            options={INSIGHTS_OPTIONS}
            selected={filters.insights ? [filters.insights] : NONE}
            onChange={(next) => onChange({ insights: latestChoice(next) as InfluencerFilters['insights'] })}
          />
        </>
      )}
      <FollowersFilter
        label="Total reach"
        min={filters.reach_min}
        max={filters.reach_max}
        onChange={({ min, max }) => onChange({ reach_min: min, reach_max: max })}
      />
    </div>
  )
}
