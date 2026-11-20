import { ArrowRight } from 'lucide-react'
import { useState, type ReactNode } from 'react'
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
    <div className="rounded-xl bg-popover/90 px-2.5 py-1.5 text-body-sm shadow-glass-hover backdrop-blur-2xl">
      <div className="font-semibold text-popover-foreground tabular-nums">{formatNumber(datum.value)}</div>
      <div className="text-muted-foreground">
        {unit} · {datum.label}
      </div>
    </div>
  )
}

/**
 * Single-series horizontal bars (one measure across categories), with a table view so values never depend
 * on hovering. The card title names the series, so there's no legend. The header holds the title, an optional
 * subtitle and the chart/table toggle (the Stitch "Show as table →" text action).
 */
export function BarListChart({
  title,
  description,
  data,
  unit,
  labelHeader,
}: {
  title: ReactNode
  description?: ReactNode
  data: Datum[]
  unit: string
  labelHeader: string
}) {
  const [showTable, setShowTable] = useState(false)
  const height = data.length * ROW_HEIGHT + 24

  return (
    <div>
      <div className="mb-space-md flex items-start justify-between gap-space-sm">
        <div className="min-w-0">
          <h2 className="text-headline-sm font-semibold tracking-tight text-primary">{title}</h2>
          {description && <p className="mt-0.5 text-body-sm text-muted-foreground">{description}</p>}
        </div>
        <Button
          variant="link"
          size="xs"
          className="group/toggle h-auto min-h-7 shrink-0 gap-1 px-0 py-1 text-label-md hover:no-underline"
          onClick={() => setShowTable((v) => !v)}
        >
          {showTable ? 'Show chart' : 'Show as table'}
          <ArrowRight aria-hidden className="size-4 transition-transform group-hover/toggle:translate-x-0.5" />
        </Button>
      </div>
      {showTable ? (
        <table className="w-full text-body-md">
          <thead>
            <tr className="text-[11px] tracking-wider text-muted-foreground uppercase">
              <th className="py-1.5 text-left font-semibold">{labelHeader}</th>
              <th className="py-1.5 text-right font-semibold">{unit}</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.label} className="border-t border-surface-container">
                <td className="py-2 text-on-surface">{d.label}</td>
                <td className="py-2 text-right font-medium text-primary tabular-nums">{formatNumber(d.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div style={{ height }} role="img" aria-label={`${unit} by ${labelHeader.toLowerCase()}: ${data.map((d) => `${d.label} ${d.value}`).join(', ')}`}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ top: 0, right: 12, bottom: 0, left: 0 }} barCategoryGap={4}>
              <CartesianGrid horizontal={false} stroke="var(--border)" strokeWidth={1} strokeDasharray="3 4" />
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
    </div>
  )
}
