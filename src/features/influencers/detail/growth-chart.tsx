import { useState } from 'react'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps } from 'recharts'
import { Button } from '@/components/ui/button'
import { formatCompact, formatDate, formatNumber } from '@/lib/format'
import type { FollowerSnapshot } from '@/types'

const SERIES = 'var(--chart-series-1)'
const SURFACE = 'var(--card)'

function GrowthTooltip({ active, payload }: Pick<TooltipContentProps, 'active' | 'payload'>) {
  const point = payload?.[0]?.payload as FollowerSnapshot | undefined
  if (!active || !point) return null
  // Value leads, label follows; a short line key carries the series identity.
  return (
    <div className="rounded-md border bg-popover px-2.5 py-1.5 text-xs shadow-md">
      <div className="flex items-center gap-1.5">
        <span aria-hidden className="h-0.5 w-3 rounded-full" style={{ background: SERIES }} />
        <span className="font-semibold text-popover-foreground tabular-nums">{formatNumber(point.followers)}</span>
      </div>
      <div className="mt-0.5 text-muted-foreground">Followers · {formatDate(point.captured_at)}</div>
    </div>
  )
}

/** Weekly follower count. One series, so the heading names it and no legend is needed. */
export function GrowthChart({ snapshots }: { snapshots: FollowerSnapshot[] }) {
  const [showTable, setShowTable] = useState(false)
  if (snapshots.length < 2) return null

  const first = snapshots[0]!.followers
  const last = snapshots[snapshots.length - 1]!.followers
  const change = first ? ((last - first) / first) * 100 : 0

  return (
    <section aria-labelledby="growth-heading" className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <h4 id="growth-heading" className="text-xs font-medium text-muted-foreground">
          Followers, last {snapshots.length} weeks
        </h4>
        <span className="text-xs text-muted-foreground tabular-nums">
          {change >= 0 ? '+' : ''}
          {change.toFixed(1)}%
        </span>
      </div>

      {showTable ? (
        <table className="w-full text-xs">
          <caption className="sr-only">Weekly followers</caption>
          <thead>
            <tr className="text-muted-foreground">
              <th className="py-1 text-left font-normal">Week of</th>
              <th className="py-1 text-right font-normal">Followers</th>
            </tr>
          </thead>
          <tbody>
            {snapshots.map((s) => (
              <tr key={s.captured_at} className="border-t">
                <td className="py-1">{formatDate(s.captured_at)}</td>
                <td className="py-1 text-right tabular-nums">{formatNumber(s.followers)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="h-32" role="img" aria-label={`Followers grew ${change.toFixed(1)}% from ${formatNumber(first)} to ${formatNumber(last)}`}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={snapshots} margin={{ top: 6, right: 6, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--border)" strokeWidth={1} />
              <XAxis
                dataKey="captured_at"
                tickFormatter={(v: string) => formatDate(v, 'd MMM')}
                tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
                minTickGap={24}
              />
              <YAxis
                width={36}
                tickFormatter={(v: number) => formatCompact(v)}
                tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
                tickLine={false}
                axisLine={false}
                domain={['auto', 'auto']}
                tickCount={3}
              />
              <Tooltip
                content={(props) => <GrowthTooltip {...props} />}
                cursor={{ stroke: 'var(--muted-foreground)', strokeWidth: 1 }}
                isAnimationActive={false}
              />
              <Area
                type="monotone"
                dataKey="followers"
                stroke={SERIES}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
                fill={SERIES}
                fillOpacity={0.1}
                isAnimationActive={false}
                activeDot={{ r: 4, fill: SERIES, stroke: SURFACE, strokeWidth: 2 }}
                dot={(props) => {
                  const { cx, cy, index } = props as { cx: number; cy: number; index: number }
                  // End-dot marks the latest value; other points stay unmarked.
                  return index === snapshots.length - 1 ? (
                    <circle key="end" cx={cx} cy={cy} r={4} fill={SERIES} stroke={SURFACE} strokeWidth={2} />
                  ) : (
                    <g key={index} />
                  )
                }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      <Button variant="link" size="xs" className="h-auto px-0 text-xs" onClick={() => setShowTable((v) => !v)}>
        {showTable ? 'Show chart' : 'Show as table'}
      </Button>
    </section>
  )
}
