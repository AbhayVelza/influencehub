import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { formatCompact, formatNumber } from '@/lib/format'
import { ChartFrame, ChartTooltipBody } from './chart-frame'
import { AXIS_TICK, SERIES } from './chart-style'

interface Datum {
  key: string
  label: string
  fullLabel: string
  value: number
}

/**
 * One series over time: a 2px line with a ~10% wash, a crosshair that snaps to the nearest day, and a table view.
 * The card title names the series, so no legend.
 */
export function AreaTrendChart({ data, unit, labelHeader, height = 220 }: { data: Datum[]; unit: string; labelHeader: string; height?: number }) {
  return (
    <ChartFrame
      labelHeader={labelHeader}
      valueHeader={unit}
      rows={[...data].reverse().map((d) => ({ key: d.key, label: d.fullLabel, value: d.value }))}
      chart={
        <div style={{ height }} role="img" aria-label={`${unit} per ${labelHeader.toLowerCase()}, ${data[0]?.fullLabel} to ${data.at(-1)?.fullLabel}: total ${formatNumber(data.reduce((s, d) => s + d.value, 0))}`}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
              <CartesianGrid vertical={false} stroke="var(--chart-grid)" strokeWidth={1} />
              <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: 'var(--border)' }} interval="preserveStartEnd" minTickGap={16} />
              <YAxis allowDecimals={false} tick={AXIS_TICK} tickLine={false} axisLine={false} tickFormatter={(v: number) => (v >= 10_000 ? formatCompact(v) : formatNumber(v))} />
              <Tooltip
                cursor={{ stroke: 'var(--muted-foreground)', strokeWidth: 1 }}
                isAnimationActive={false}
                content={({ active, payload }) => {
                  const d = payload?.[0]?.payload as Datum | undefined
                  return active && d ? <ChartTooltipBody value={formatNumber(d.value)} label={`${unit} · ${d.fullLabel}`} /> : null
                }}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke={SERIES}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
                fill={SERIES}
                fillOpacity={0.1}
                activeDot={{ r: 4, fill: SERIES, stroke: 'var(--card)', strokeWidth: 2 }}
                dot={false}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      }
    />
  )
}
