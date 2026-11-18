import type { ReactNode } from 'react'
import { formatNumber, formatPercent } from '@/lib/format'
import { SERIES } from './chart-style'

export interface MeterRow {
  key: string
  label: ReactNode
  /** Plain-text name for screen readers. */
  name: string
  value: number
}

/**
 * Several shares, one per named row, each against the same whole (e.g. creators with an account on each platform,
 * out of all creators): a name, a bar on a lighter track of the same hue, and the figure. Every value is printed, so
 * there's no separate table view.
 */
export function MeterList({ rows, whole, unit }: { rows: MeterRow[]; whole: number; unit: string }) {
  if (rows.length === 0 || whole === 0) return <p className="py-6 text-center text-sm text-muted-foreground">Nothing to show yet.</p>
  return (
    <ul className="space-y-3">
      {rows.map((r) => {
        const pct = (r.value / whole) * 100
        return (
          <li key={r.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 sm:grid-cols-[8rem_minmax(0,1fr)_auto]">
            <span className="truncate text-sm">{r.label}</span>
            <span
              className="relative order-last col-span-2 h-2 overflow-hidden rounded-full sm:order-none sm:col-span-1"
              style={{ background: `color-mix(in oklab, ${SERIES} 18%, transparent)` }}
              role="meter"
              aria-label={`${r.name}: ${formatNumber(r.value)} of ${formatNumber(whole)} ${unit.toLowerCase()}`}
              aria-valuemin={0}
              aria-valuemax={whole}
              aria-valuenow={r.value}
            >
              <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${pct}%`, background: SERIES }} />
            </span>
            <span className="text-right text-sm tabular-nums">
              {formatNumber(r.value)} <span className="text-xs text-muted-foreground">({formatPercent(pct, 0)})</span>
            </span>
          </li>
        )
      })}
    </ul>
  )
}
