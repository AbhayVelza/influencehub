import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type RowSelectionState,
  type Updater,
  type VisibilityState,
} from '@tanstack/react-table'
import { ArrowDown, ArrowUp, ArrowUpDown, Settings2 } from 'lucide-react'
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
    <div className="overflow-hidden rounded-lg border bg-card">
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
                      className={cn('bg-muted/40', meta?.className, meta?.align === 'right' && 'text-right')}
                      aria-sort={isSorted ? (sortDesc ? 'descending' : 'ascending') : undefined}
                    >
                      {meta?.sortKey ? (
                        <button
                          type="button"
                          onClick={() => toggleSort(meta.sortKey!, !!meta.sortDescFirst)}
                          className={cn(
                            'inline-flex items-center gap-1 rounded hover:text-foreground',
                            meta.align === 'right' && 'flex-row-reverse',
                          )}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {isSorted ? (
                            sortDesc ? (
                              <ArrowDown className="size-3.5" />
                            ) : (
                              <ArrowUp className="size-3.5" />
                            )
                          ) : (
                            <ArrowUpDown className="size-3.5 opacity-40" />
                          )}
                        </button>
                      ) : (
                        flexRender(header.column.columnDef.header, header.getContext())
                      )}
                    </TableHead>
                  )
                })}
                <TableHead className="w-10 bg-muted/40 pr-2 text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon-sm" aria-label="Choose columns">
                        <Settings2 />
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
                        <div className="flex items-center gap-2.5">
                          <Skeleton className="size-8 rounded-full" />
                          <Skeleton className="h-4 w-28" />
                        </div>
                      ) : (
                        <Skeleton className={cn('h-4', column.id === 'select' ? 'w-4' : 'w-16')} />
                      )}
                    </TableCell>
                  ))}
                  <TableCell />
                </TableRow>
              ))
            ) : rows.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={visibleColumns.length + 1} className="p-0">
                  {emptyContent}
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() ? 'selected' : undefined}
                  className="cursor-pointer"
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
                  <TableCell />
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
