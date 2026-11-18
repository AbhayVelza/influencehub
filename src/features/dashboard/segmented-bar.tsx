import { useState } from 'react'
import { formatNumber, formatPercent } from '@/lib/format'
import { cn } from '@/lib/utils'
import { ChartFrame } from './chart-frame'

export interface Part {
  key: string
  label: string
  value: number
}

/** Categorical slots in fixed order (index.css `--chart-cat-*`). Slot 4 (yellow) takes near-black text. */
const SLOTS = ['var(--chart-cat-1)', 'var(--chart-cat-2)', 'var(--chart-cat-3)', 'var(--chart-cat-4)', 'var(--chart-cat-5)']
const DARK_TEXT_SLOT = 3

/**
 * One whole split into ≤ 5 parts: a tall (28px) segmented bar with 2px surface gaps, the share printed inside where
 * it fits, a legend of names in block order, a hover / focus readout, and a table view. Colour follows the part
 * (its fixed slot), never its rank, so a part keeps its colour when another is zero.
 */
export function SegmentedBar({ parts, unit, labelHeader }: { parts: Part[]; unit: string; labelHeader: string }) {
  const [active, setActive] = useState<number | null>(null)
  const total = parts.reduce((s, p) => s + p.value, 0)
  const share = (v: number) => (total ? formatPercent((v / total) * 100, 0) : '—')

  if (total === 0) return <p className="py-6 text-center text-sm text-muted-foreground">Nothing to show yet.</p>

  const focused = active === null ? null : parts[active]
  return (
    <ChartFrame
      labelHeader={labelHeader}
      valueHeader={unit}
      extraHeader="Share"
      rows={parts.map((p) => ({ key: p.key, label: p.label, value: p.value, extra: share(p.value) }))}
      chart={
        <div className="space-y-3">
          <div
            className="flex h-7 w-full gap-0.5"
            role="group"
            aria-label={`${unit} by ${labelHeader.toLowerCase()}: ${parts.map((p) => `${p.label} ${p.value}`).join(', ')}`}
            onPointerLeave={() => setActive(null)}
          >
            {parts.map((p, i) =>
              p.value === 0 ? null : (
                <button
                  key={p.key}
                  type="button"
                  className={cn(
                    'flex min-w-1 items-center overflow-hidden rounded px-1.5 text-xs font-medium tabular-nums outline-none transition-opacity focus-visible:ring-2 focus-visible:ring-ring',
                    active !== null && active !== i && 'opacity-60',
                  )}
                  style={{ flexGrow: p.value, flexBasis: 0, background: SLOTS[i % SLOTS.length], color: i === DARK_TEXT_SLOT ? '#0b0b0b' : '#ffffff' }}
                  aria-label={`${p.label}: ${formatNumber(p.value)} (${share(p.value)})`}
                  onPointerEnter={() => setActive(i)}
                  onFocus={() => setActive(i)}
                  onBlur={() => setActive(null)}
                >
                  {/* Printed only where it clearly fits; otherwise the readout and table carry it. */}
                  {p.value / total >= 0.1 ? share(p.value) : null}
                </button>
              ),
            )}
          </div>
          <p className="h-4 text-xs text-muted-foreground" aria-live="polite">
            {focused ? (
              <>
                <span className="font-semibold text-foreground tabular-nums">{formatNumber(focused.value)}</span> · {focused.label} ·{' '}
                {share(focused.value)}
              </>
            ) : (
              <>
                <span className="font-semibold text-foreground tabular-nums">{formatNumber(total)}</span> {unit.toLowerCase()} in all
              </>
            )}
          </p>
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {parts.map((p, i) => (
              <li key={p.key} className="inline-flex items-center gap-1.5">
                <span className="size-2.5 rounded-sm" style={{ background: SLOTS[i % SLOTS.length] }} aria-hidden />
                {p.label}
              </li>
            ))}
          </ul>
        </div>
      }
    />
  )
}
