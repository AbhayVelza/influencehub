import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { formatCompact, formatNumber } from '@/lib/format'
import { ChartFrame, ChartTooltipBody } from './chart-frame'
import { AXIS_TICK, SERIES } from './chart-style'

interface Datum {
  key: string
  /** Axis label (short). */
  label: string
  /** Tooltip and table label (full). */
  fullLabel: string
  value: number
}

/**
 * Single-series columns over an ordered axis (weeks, size bands): one hue, ≤ 24px columns with 4px rounded caps,
 * hairline grid, per-column tooltip, and a table view. The card title names the series, so no legend.
 */
export function ColumnChart({
  data,
  unit,
  labelHeader,
  height = 220,
  showEveryLabel = false,
}: {
  data: Datum[]
  unit: string
  labelHeader: string
  height?: number
  /** Few, short categories (size bands): label every column instead of thinning the axis. */
  showEveryLabel?: boolean
}) {
  return (
    <ChartFrame
      labelHeader={labelHeader}
      valueHeader={unit}
      rows={data.map((d) => ({ key: d.key, label: d.fullLabel, value: d.value }))}
      chart={
        <div style={{ height }} role="img" aria-label={`${unit} by ${labelHeader.toLowerCase()}: ${data.map((d) => `${d.fullLabel} ${d.value}`).join(', ')}`}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: -16 }} barCategoryGap="20%">
              <CartesianGrid vertical={false} stroke="var(--chart-grid)" strokeWidth={1} />
              <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: 'var(--border)' }} interval={showEveryLabel ? 0 : 'preserveStartEnd'} minTickGap={8} />
              <YAxis allowDecimals={false} tick={AXIS_TICK} tickLine={false} axisLine={false} tickFormatter={(v: number) => (v >= 10_000 ? formatCompact(v) : formatNumber(v))} />
              <Tooltip
                cursor={{ fill: 'var(--muted)', opacity: 0.6 }}
                isAnimationActive={false}
                content={({ active, payload }) => {
                  const d = payload?.[0]?.payload as Datum | undefined
                  return active && d ? <ChartTooltipBody value={formatNumber(d.value)} label={`${unit} · ${d.fullLabel}`} /> : null
                }}
              />
              <Bar dataKey="value" fill={SERIES} maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      }
    />
  )
}
