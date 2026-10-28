import { useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps } from 'recharts'
import { Button } from '@/components/ui/button'
import { formatNumber } from '@/lib/format'

const SERIES = 'var(--chart-series-1)'
const ROW_HEIGHT = 30
const BAR_SIZE = 22 // ≤ 24px: thin marks, the rest of the band is air

interface Datum {
  label: string
  value: number
}

function BarTooltip({ active, payload, unit }: Pick<TooltipContentProps, 'active' | 'payload'> & { unit: string }) {
  const datum = payload?.[0]?.payload as Datum | undefined
  if (!active || !datum) return null
  return (
    <div className="rounded-md border bg-popover px-2.5 py-1.5 text-xs shadow-md">
      <div className="font-semibold text-popover-foreground tabular-nums">{formatNumber(datum.value)}</div>
      <div className="text-muted-foreground">
        {unit} · {datum.label}
      </div>
    </div>
  )
}

/**
 * Single-series horizontal bars (one measure across categories), with a table view so values never depend
 * on hovering. The card title names the series, so there's no legend.
 */
export function BarListChart({ data, unit, labelHeader }: { data: Datum[]; unit: string; labelHeader: string }) {
  const [showTable, setShowTable] = useState(false)
  const height = data.length * ROW_HEIGHT + 24

  return (
    <div className="space-y-2">
      {showTable ? (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-muted-foreground">
              <th className="py-1 text-left font-normal">{labelHeader}</th>
              <th className="py-1 text-right font-normal">{unit}</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.label} className="border-t">
                <td className="py-1">{d.label}</td>
                <td className="py-1 text-right tabular-nums">{formatNumber(d.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div style={{ height }} role="img" aria-label={`${unit} by ${labelHeader.toLowerCase()}: ${data.map((d) => `${d.label} ${d.value}`).join(', ')}`}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ top: 0, right: 12, bottom: 0, left: 0 }} barCategoryGap={4}>
              <CartesianGrid horizontal={false} stroke="var(--border)" strokeWidth={1} />
              <XAxis
                type="number"
                allowDecimals={false}
                tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                type="category"
                dataKey="label"
                width={112}
                tick={{ fontSize: 12, fill: 'var(--foreground)' }}
                tickLine={false}
                axisLine={false}
                interval={0}
              />
              <Tooltip content={(props) => <BarTooltip {...props} unit={unit} />} cursor={{ fill: 'var(--muted)', opacity: 0.6 }} isAnimationActive={false} />
              <Bar dataKey="value" fill={SERIES} barSize={BAR_SIZE} radius={[0, 4, 4, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      <Button variant="link" size="xs" className="h-auto px-0 text-xs" onClick={() => setShowTable((v) => !v)}>
        {showTable ? 'Show chart' : 'Show as table'}
      </Button>
    </div>
  )
}
