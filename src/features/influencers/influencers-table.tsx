import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type RowSelectionState,
  type Updater,
  type VisibilityState,
} from '@tanstack/react-table'
import { ArrowDown, ArrowUp, ChevronsUpDown, Settings } from 'lucide-react'
import { useMemo, useState, type MouseEvent, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import type { InfluencerSort, InfluencerSortKey } from '@/types'

const SKELETON_ROWS = 8

function loadVisibility(key: string, defaults: VisibilityState): VisibilityState {
  try {
    const stored = JSON.parse(localStorage.getItem(key) ?? 'null') as VisibilityState | null
    return stored ? { ...defaults, ...stored } : defaults
  } catch {
    return defaults
  }
}

function saveVisibility(key: string, state: VisibilityState) {
  try {
    localStorage.setItem(key, JSON.stringify(state))
  } catch {
    // Not persisted; the choice lasts for this session.
  }
}

interface InfluencersTableProps<T extends { id: string }> {
  rows: T[]
  columns: ColumnDef<T>[]
  /** localStorage key for the user's column choices. */
  visibilityKey: string
  /** Clicking a row (outside its links and controls). */
  onOpenRow: (row: T) => void
  isLoading: boolean
  /** Showing the previous page while the next one loads. */
  isStale: boolean
  sort: InfluencerSort | undefined
  onSortChange: (sort: InfluencerSort | undefined) => void
  selectedIds: Set<string>
  onSelectionChange: (changes: { selected: T[]; deselected: T[] }) => void
  /** Rendered in place of rows when there are none (empty / error state). */
  emptyContent: ReactNode
  /** Extra classes for the glass card (e.g. the pool's 20px radius). */
  className?: string
}

/** Server-sorted, selectable table with column visibility. Used by the influencers list and the pool. */
export function InfluencersTable<T extends { id: string }>({
  rows,
  columns,
  visibilityKey,
  onOpenRow,
  isLoading,
  isStale,
  sort,
  onSortChange,
  selectedIds,
  onSelectionChange,
  emptyContent,
  className,
}: InfluencersTableProps<T>) {
  const defaultVisibility = useMemo(
    () => Object.fromEntries(columns.map((c) => [c.id!, !c.meta?.hiddenByDefault])) as VisibilityState,
    [columns],
  )
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(() => loadVisibility(visibilityKey, defaultVisibility))

  const rowSelection = useMemo<RowSelectionState>(
    () => Object.fromEntries(rows.filter((r) => selectedIds.has(r.id)).map((r) => [r.id, true])),
    [rows, selectedIds],
  )

  const onRowSelectionChange = (updater: Updater<RowSelectionState>) => {
    const next = typeof updater === 'function' ? updater(rowSelection) : updater
    onSelectionChange({
      selected: rows.filter((r) => next[r.id] && !selectedIds.has(r.id)),
      deselected: rows.filter((r) => !next[r.id] && selectedIds.has(r.id)),
    })
  }

  const onVisibilityChange = (updater: Updater<VisibilityState>) => {
    setColumnVisibility((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      saveVisibility(visibilityKey, next)
      return next
    })
  }

  // This project doesn't use the React Compiler, so its memoization caveat for TanStack Table doesn't apply.
  // oxlint-disable-next-line react/incompatible-library
  const table = useReactTable({
    data: rows,
    columns,
    getRowId: (row) => row.id,
    getCoreRowModel: getCoreRowModel(),
    manualSorting: true,
    manualPagination: true,
    state: { rowSelection, columnVisibility },
    onRowSelectionChange,
    onColumnVisibilityChange: onVisibilityChange,
  })

  const sortKey = sort?.replace(/^-/, '') as InfluencerSortKey | undefined
  const sortDesc = sort?.startsWith('-') ?? false

  /** First click picks the column's natural direction, second flips it, third clears. */
  const toggleSort = (key: InfluencerSortKey, descFirst: boolean) => {
    if (sortKey !== key) return onSortChange(descFirst ? `-${key}` : key)
    if (sortDesc === descFirst) return onSortChange(descFirst ? key : `-${key}`)
    onSortChange(undefined)
  }

  const onRowClick = (event: MouseEvent, row: T) => {
    if ((event.target as HTMLElement).closest('a, button, input, label, [role="checkbox"], [role="menu"]')) return
    onOpenRow(row)
  }

  const visibleColumns = table.getVisibleLeafColumns()
  const hideable = table.getAllLeafColumns().filter((c) => c.getCanHide())

  return (
    // @container: the empty / error row is sized to the card's visible width (100cqw), not the table's.
    <div
      className={cn(
        '@container overflow-hidden rounded-2xl bg-surface-container-lowest/75 shadow-glass backdrop-blur-2xl',
        className,
      )}
    >
      <div className="overflow-x-auto">
        <Table className={cn(isStale && 'opacity-60 transition-opacity')}>
          <TableHeader>
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id} className="hover:bg-transparent">
                {group.headers.map((header) => {
                  const meta = header.column.columnDef.meta
                  const isSorted = meta?.sortKey && meta.sortKey === sortKey
                  return (
                    <TableHead
                      key={header.id}
                      className={cn(
                        meta?.className,
                        meta?.align === 'right' && 'text-right',
                        isSorted && 'font-semibold text-primary',
                      )}
                      aria-sort={isSorted ? (sortDesc ? 'descending' : 'ascending') : undefined}
                    >
                      {meta?.sortKey ? (
                        <button
                          type="button"
                          onClick={() => toggleSort(meta.sortKey!, !!meta.sortDescFirst)}
                          className={cn(
                            'group/sort -my-1.5 inline-flex min-h-7 cursor-pointer items-center gap-1 rounded py-1.5 uppercase transition-colors hover:text-primary',
                            meta.align === 'right' && 'flex-row-reverse',
                          )}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {isSorted ? (
                            sortDesc ? (
                              <ArrowDown className="size-3.5 text-primary" strokeWidth={2} />
                            ) : (
                              <ArrowUp className="size-3.5 text-primary" strokeWidth={2} />
                            )
                          ) : (
                            <ChevronsUpDown
                              className="size-3.5 text-outline transition-colors group-hover/sort:text-primary"
                              strokeWidth={1.75}
                            />
                          )}
                        </button>
                      ) : (
                        flexRender(header.column.columnDef.header, header.getContext())
                      )}
                    </TableHead>
                  )
                })}
                <TableHead className="w-12 pr-5 pl-2 text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="size-7 rounded-lg text-muted-foreground hover:bg-surface-container-high hover:text-on-surface"
                        aria-label="Choose columns"
                        title="Choose columns"
                      >
                        <Settings className="size-[18px]" strokeWidth={1.75} />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <DropdownMenuLabel>Columns</DropdownMenuLabel>
                      {hideable.map((column) => (
                        <DropdownMenuCheckboxItem
                          key={column.id}
                          checked={column.getIsVisible()}
                          onCheckedChange={(value) => column.toggleVisibility(!!value)}
                          onSelect={(e) => e.preventDefault()}
                        >
                          {column.columnDef.meta?.label ?? column.id}
                        </DropdownMenuCheckboxItem>
                      ))}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onSelect={() => onVisibilityChange(defaultVisibility)}>
                        Reset to default
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableHead>
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: SKELETON_ROWS }, (_, i) => (
                <TableRow key={i} className="hover:bg-transparent">
                  {visibleColumns.map((column) => (
                    <TableCell key={column.id}>
                      {column.id === 'name' ? (
                        <div className="flex items-center gap-3">
                          <Skeleton className="size-10 shrink-0 rounded-full" />
                          <div className="space-y-1.5">
                            <Skeleton className="h-3.5 w-28" />
                            <Skeleton className="h-2.5 w-20" />
                          </div>
                        </div>
                      ) : (
                        <Skeleton className={cn('h-4', column.id === 'select' ? 'w-4' : 'w-16')} />
                      )}
                    </TableCell>
                  ))}
                  <TableCell className="pr-5" />
                </TableRow>
              ))
            ) : rows.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={visibleColumns.length + 1} className="p-0 whitespace-normal">
                  {/* Pinned to the card's visible width, so the message stays on screen when the table is wider. */}
                  <div className="sticky left-0 w-[100cqw]">{emptyContent}</div>
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() ? 'selected' : undefined}
                  className="group cursor-pointer"
                  onClick={(e) => onRowClick(e, row.original)}
                >
                  {row.getVisibleCells().map((cell) => {
                    const meta = cell.column.columnDef.meta
                    return (
                      <TableCell
                        key={cell.id}
                        className={cn(meta?.className, meta?.align === 'right' && 'text-right tabular-nums')}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    )
                  })}
                  <TableCell className="pr-5" />
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
