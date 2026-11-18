import { Link } from 'react-router-dom'
import { PersonAvatar } from '@/components/common/person-avatar'
import { AccountLabel, PlatformMarks } from '@/components/common/platform-badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ROLE_LABEL } from '@/lib/constants'
import { formatCompact, formatDate, formatNumber } from '@/lib/format'
import type { RecentlyOnboarded, TeamPerformanceRow } from '@/types'

const empty = (text: string) => <p className="py-6 text-center text-sm text-muted-foreground">{text}</p>

/** The 10 creators most recently moved onto Onboarded. Scrolls sideways on phones. */
export function RecentlyOnboardedTable({ rows }: { rows: RecentlyOnboarded[] }) {
  if (rows.length === 0) return empty('No one onboarded yet.')
  return (
    <div className="overflow-x-auto">
      <Table className="min-w-[40rem]">
        <TableHeader>
          <TableRow>
            <TableHead>Creator</TableHead>
            <TableHead>Platforms</TableHead>
            <TableHead className="text-right">Total followers</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>City</TableHead>
            <TableHead className="text-right">Onboarded</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell>
                <Link to={`/influencers/${r.id}`} className="flex min-w-0 items-center gap-2 hover:underline">
                  <PersonAvatar name={r.name} src={r.profile_pic_url} className="size-7" aria-hidden />
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{r.name}</span>
                    <AccountLabel account={r.primary_account} className="text-xs text-muted-foreground" />
                  </span>
                </Link>
              </TableCell>
              <TableCell>
                <PlatformMarks platforms={r.platforms} />
              </TableCell>
              <TableCell className="text-right tabular-nums" title={formatNumber(r.total_reach)}>
                {formatCompact(r.total_reach)}
              </TableCell>
              <TableCell>{r.category}</TableCell>
              <TableCell>{r.city ?? <span className="text-muted-foreground">—</span>}</TableCell>
              <TableCell className="text-right tabular-nums">{formatDate(r.onboarded_at)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

/** Per active member: owned influencers, calls this week, onboarded and Welcome Kits sent this month. */
export function TeamPerformanceTable({ rows }: { rows: TeamPerformanceRow[] }) {
  if (rows.length === 0) return empty('No team members yet.')
  return (
    <div className="overflow-x-auto">
      <Table className="min-w-[36rem]">
        <TableHeader>
          <TableRow>
            <TableHead>Member</TableHead>
            <TableHead className="text-right">Owned</TableHead>
            <TableHead className="text-right">Calls this week</TableHead>
            <TableHead className="text-right">Onboarded this month</TableHead>
            <TableHead className="text-right">Welcome Kits sent this month</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.user_id}>
              <TableCell>
                <span className="flex items-center gap-2">
                  <PersonAvatar name={r.name} src={null} className="size-7" aria-hidden />
                  <span>
                    <span className="block font-medium">{r.name}</span>
                    <span className="block text-xs text-muted-foreground">{ROLE_LABEL[r.role]}</span>
                  </span>
                </span>
              </TableCell>
              <TableCell className="text-right tabular-nums">{formatNumber(r.owned)}</TableCell>
              <TableCell className="text-right tabular-nums">{formatNumber(r.calls_this_week)}</TableCell>
              <TableCell className="text-right tabular-nums">{formatNumber(r.onboarded_this_month)}</TableCell>
              <TableCell className="text-right tabular-nums">{formatNumber(r.kits_sent_this_month)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
