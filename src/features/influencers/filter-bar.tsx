import { useEffect, useMemo, useState } from 'react'
import { CollapsibleFilters } from '@/components/common/collapsible-filters'
import { FollowersFilter } from '@/components/common/followers-filter'
import { MultiSelectFilter } from '@/components/common/multi-select-filter'
import { PlatformMark } from '@/components/common/platform-badge'
import { StageDot } from '@/components/common/stage-badge'
import type { InfluencerFilters, Platform, Stage } from '@/types'
import { countActiveFilters } from './list-params'
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
  /** A platform's Onboarded tab is already one platform. */
  hidePlatform?: boolean
  /** No owner filter: executives only see their own influencers, and the pool has no owners. */
  hideAssigned?: boolean
  /** Documents aren't kept for the Unassigned Pool, so it has no Agreement / Insights filters. */
  hideDocuments?: boolean
  /** Whose options and counts: the influencers list (default) or the Unassigned Pool. */
  source?: FilterSource
  /** A followers range for the platform's account (the Onboarded tabs), next to Total reach. */
  showFollowers?: boolean
  /** Filters the page sets itself (the Onboarded tabs' rule): counted, but not shown as choices. */
  baseFilters?: InfluencerFilters
}

/** Category / Platform / Country → State → City / Stage / Assigned / Total reach. Shared by the list, pipeline, pool and Onboarded tabs. */
export function InfluencerFilterBar({
  filters,
  onChange,
  hideStage,
  hidePlatform,
  hideAssigned,
  hideDocuments,
  source = 'influencers',
  baseFilters,
  showFollowers,
}: InfluencerFilterBarProps) {
  const country = filters.country ?? NONE
  const state = filters.state ?? NONE
  const city = filters.city ?? NONE
  // Every active filter goes along, so each facet's counts follow the others (its own selection excluded server-side).
  const optionFilters = useMemo(() => ({ ...filters, ...baseFilters }), [filters, baseFilters])
  const { data: options, isLoading, isError, isPlaceholderData } = useFilterOptions(optionFilters, source)
  const hint = isError ? 'Couldn’t load options. Try again later.' : undefined

  // Counts of the previous selection stay on screen (dimmed) while new ones load. States and cities are different:
  // when the country / state selection changed, the old lists are the wrong ones, so they show a skeleton instead.
  const hierarchy = `${country.join('|')}/${state.join('|')}`
  const [loadedHierarchy, setLoadedHierarchy] = useState<string | null>(null)
  if (options && !isPlaceholderData && loadedHierarchy !== hierarchy) setLoadedHierarchy(hierarchy)
  const refreshing = isPlaceholderData
  const narrowing = isLoading || (isPlaceholderData && loadedHierarchy !== hierarchy)

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
    <div className="flex flex-wrap items-center gap-2">
      <CollapsibleFilters activeCount={countActiveFilters(filters)}>
        <MultiSelectFilter
          label="Category"
          options={options?.categories}
          selected={filters.category ?? []}
          onChange={(category) => onChange({ category })}
          loading={isLoading}
          refreshing={refreshing}
          hint={hint}
        />
        {!hidePlatform && (
          <MultiSelectFilter
            label="Platform"
            options={options?.platforms}
            selected={filters.platform ?? []}
            onChange={(next) => onChange({ platform: next as Platform[] })}
            loading={isLoading}
            refreshing={refreshing}
            hint={hint}
            renderOption={(o) => (
              <>
                <PlatformMark platform={o.value as Platform} />
                {o.label}
              </>
            )}
          />
        )}
        <MultiSelectFilter
          label="Country"
          options={options?.countries}
          selected={country}
          onChange={(next) => onChange({ country: next })}
          loading={isLoading}
          refreshing={refreshing}
          hint={hint}
        />
        <MultiSelectFilter
          label="State"
          options={options?.states}
          selected={state}
          onChange={(next) => onChange({ state: next })}
          loading={narrowing}
          refreshing={refreshing}
          hint={hint}
        />
        <MultiSelectFilter
          label="City"
          options={options?.cities}
          selected={city}
          onChange={(next) => onChange({ city: next })}
          loading={narrowing}
          refreshing={refreshing}
          hint={hint}
        />
        {!hideStage && (
          <MultiSelectFilter
            label="Stage"
            options={options?.stages}
            selected={filters.stage ?? []}
            onChange={(next) => onChange({ stage: next as Stage[] })}
            loading={isLoading}
            refreshing={refreshing}
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
            refreshing={refreshing}
            hint={hint}
            searchPlaceholder="Search team…"
          />
        )}
        {!hideDocuments && (
          <>
            <MultiSelectFilter
              label="Agreement"
              options={options?.agreement}
              selected={filters.agreement ? [filters.agreement] : NONE}
              onChange={(next) => onChange({ agreement: latestChoice(next) as InfluencerFilters['agreement'] })}
              loading={isLoading}
              refreshing={refreshing}
              hint={hint}
            />
            <MultiSelectFilter
              label="Insights"
              options={options?.insights}
              selected={filters.insights ? [filters.insights] : NONE}
              onChange={(next) => onChange({ insights: latestChoice(next) as InfluencerFilters['insights'] })}
              loading={isLoading}
              refreshing={refreshing}
              hint={hint}
            />
          </>
        )}
        {showFollowers && (
          <FollowersFilter
            label="Followers"
            min={filters.followers_min}
            max={filters.followers_max}
            onChange={({ min, max }) => onChange({ followers_min: min, followers_max: max })}
          />
        )}
        <FollowersFilter
          label="Total reach"
          min={filters.reach_min}
          max={filters.reach_max}
          onChange={({ min, max }) => onChange({ reach_min: min, reach_max: max })}
        />
      </CollapsibleFilters>
    </div>
  )
}
