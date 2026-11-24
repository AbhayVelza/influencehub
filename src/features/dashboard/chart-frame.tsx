import { useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { formatNumber } from '@/lib/format'

export interface TableRow {
  key: string
  label: ReactNode
  value: number
  /** Optional third column (a share, for part-to-whole charts). */
  extra?: string
}

/** A chart with its table view: every value stays readable without hovering (dataviz relief rule). */
export function ChartFrame({
  chart,
  rows,
  labelHeader,
  valueHeader,
  extraHeader,
}: {
  chart: ReactNode
  rows: TableRow[]
  labelHeader: string
  valueHeader: string
  extraHeader?: string
}) {
  const [showTable, setShowTable] = useState(false)
  return (
    <div className="space-y-2">
      {showTable ? (
        <div className="max-h-72 overflow-y-auto">
          <table className="w-full text-body">
            <thead>
              <tr className="text-small text-muted-foreground">
                <th className="py-1 text-left font-normal">{labelHeader}</th>
                <th className="py-1 text-right font-normal">{valueHeader}</th>
                {extraHeader && <th className="py-1 text-right font-normal">{extraHeader}</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className="border-t">
                  <td className="py-1">{r.label}</td>
                  <td className="py-1 text-right tabular-nums">{formatNumber(r.value)}</td>
                  {extraHeader && <td className="py-1 text-right tabular-nums text-muted-foreground">{r.extra}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        chart
      )}
      <Button variant="link" size="xs" className="h-auto px-0 text-small" onClick={() => setShowTable((v) => !v)}>
        {showTable ? 'Show chart' : 'Show as table'}
      </Button>
    </div>
  )
}

/** Tooltip body: the value leads, the label follows. */
export function ChartTooltipBody({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-md border bg-popover px-2.5 py-1.5 text-small shadow-md">
      <div className="font-semibold text-popover-foreground tabular-nums">{value}</div>
      <div className="text-muted-foreground">{label}</div>
    </div>
  )
}

