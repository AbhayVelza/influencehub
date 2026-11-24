import { Check, ChevronDown } from 'lucide-react'
import { useEffect, useRef, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import type { FilterOption } from '@/types'

/** Counts are optional: lists without a counts endpoint (e.g. packages) leave them out. */
type Option = Omit<FilterOption, 'count'> & { count?: number }

interface MultiSelectFilterProps {
  label: string
  options: Option[] | undefined
  selected: string[]
  onChange: (values: string[]) => void
  /** Shows skeleton rows instead of options (initial load, or options that are being narrowed). */
  loading?: boolean
  /** The counts are from the previous selection and are being replaced: shown dimmed. */
  refreshing?: boolean
  searchPlaceholder?: string
  /** Shown instead of options when they can't be chosen yet. */
  hint?: string
  renderOption?: (option: Option) => ReactNode
}

/** Searchable multi-select with counts, used for list and pipeline filters. */
export function MultiSelectFilter({
  label,
  options,
  selected,
  onChange,
  loading,
  refreshing,
  searchPlaceholder,
  hint,
  renderOption,
}: MultiSelectFilterProps) {
  const selectedSet = new Set(selected)
  // Toggles build on the latest choice, not the prop, so quick successive clicks don't drop selections
  // while the parent's update is still in flight.
  const latest = useRef(selected)
  useEffect(() => {
    latest.current = selected
  }, [selected])
  const toggle = (value: string) => {
    const current = latest.current
    const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value]
    latest.current = next
    onChange(next)
  }
  const firstLabel = options?.find((o) => o.value === selected[0])?.label ?? selected[0]

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            'max-w-56 gap-1.5 px-3.5',
            selected.length > 0 && 'bg-tertiary-fixed/40 hover:bg-tertiary-fixed/60 aria-expanded:bg-tertiary-fixed/60 dark:bg-tertiary-fixed/40',
          )}
        >
          <span className={cn(selected.length > 0 ? 'text-muted-foreground' : 'text-on-surface')}>{label}</span>
          {selected.length === 1 && <span className="truncate font-semibold text-primary">{firstLabel}</span>}
          {selected.length > 1 && (
            <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 tabular-nums text-[10px] font-bold text-on-primary">
              {selected.length}
            </span>
          )}
          <ChevronDown className="size-[15px] text-outline" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-0">
        <Command>
          <CommandInput placeholder={searchPlaceholder ?? `Search ${label.toLowerCase()}…`} />
          <CommandList>
            {loading ? (
              <div className="space-y-2 p-3">
                {Array.from({ length: 4 }, (_, i) => (
                  <Skeleton key={i} className="h-5 w-full" />
                ))}
              </div>
            ) : hint ? (
              <p className="px-3 py-6 text-center text-body text-muted-foreground">{hint}</p>
            ) : (
              <>
                <CommandEmpty>No matches.</CommandEmpty>
                <CommandGroup>
                  {(options ?? []).map((option) => {
                    const isSelected = selectedSet.has(option.value)
                    // Nothing matches the other filters: still listed (so it can be unticked), but dimmed.
                    const empty = option.count === 0 && !isSelected
                    return (
                      <CommandItem
                        key={option.value}
                        value={option.value}
                        keywords={[option.label]}
                        onSelect={() => toggle(option.value)}
                        aria-checked={isSelected}
                        className={cn('[&>svg:last-child]:hidden', empty && 'text-muted-foreground')}
                      >
                        <span
                          className={cn(
                            'flex size-4 shrink-0 items-center justify-center rounded-[4px] border',
                            isSelected ? 'border-primary bg-primary text-primary-foreground' : 'border-input',
                          )}
                        >
                          {isSelected && <Check className="size-3" />}
                        </span>
                        <span className="flex min-w-0 flex-1 items-center gap-1.5 truncate">
                          {renderOption ? renderOption(option) : option.label}
                        </span>
                        {option.count !== undefined && (
                          <span
                            className={cn('text-small text-muted-foreground tabular-nums transition-opacity', refreshing && 'opacity-50')}
                          >
                            {option.count}
                          </span>
                        )}
                      </CommandItem>
                    )
                  })}
                </CommandGroup>
              </>
            )}
          </CommandList>
          {selected.length > 0 && (
            <div className="border-t p-1">
              <Button variant="ghost" size="sm" className="w-full" onClick={() => onChange([])}>
                Clear {label.toLowerCase()}
              </Button>
            </div>
          )}
        </Command>
      </PopoverContent>
    </Popover>
  )
}
