import { useQuery } from '@tanstack/react-query'
import { Download, SearchX, UserX } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader } from '@/components/common/page-header'
import { EmptyState, ErrorState } from '@/components/common/states'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatNumber, todayKey } from '@/lib/format'
import { downloadFile } from '@/lib/jobs'
import { PLATFORM_META } from '@/lib/platforms'
import { queryKeys } from '@/lib/query'
import { buildXlsx } from '@/lib/xlsx'
import { influencersApi } from '@/services'

/** Rows drawn at once; search narrows the rest. The download always has every row. */
const SHOWN = 300

/** Rejected influencers: kept so nobody contacts them again; only the name and Instagram handle are shown. */
export default function RejectedPage() {
  const query = useQuery({ queryKey: [...queryKeys.influencers, 'rejected'], queryFn: ({ signal }) => influencersApi.rejected(signal) })
  const [q, setQ] = useState('')
  const rows = useMemo(() => {
    const items = query.data?.items ?? []
    const term = q.trim().toLowerCase().replace(/^@/, '')
    return term ? items.filter((r) => `${r.name} ${r.instagram ?? ''}`.toLowerCase().includes(term)) : items
  }, [query.data, q])

  const download = () => {
    const blob = buildXlsx(
      'Rejected',
      ['Name', 'Instagram handle'],
      (query.data?.items ?? []).map((r) => [r.name, r.instagram ? `@${r.instagram}` : null]),
    )
    const url = URL.createObjectURL(blob)
    downloadFile(url, `rejected-influencers-${todayKey()}.xlsx`)
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
  }

  const total = query.data?.total ?? 0
  return (
    <div className="space-y-4">
      <PageHeader
        title="Rejected"
        description={query.isSuccess ? `${formatNumber(total)} rejected influencers` : 'Rejected influencers'}
        actions={
          <Button variant="outline" onClick={download} disabled={!total}>
            <Download />
            Download Excel
          </Button>
        }
      />
      {query.isPending ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : query.isError ? (
        <ErrorState title="Couldn’t load rejected influencers" error={query.error} onRetry={() => query.refetch()} />
      ) : total === 0 ? (
        <EmptyState icon={UserX} title="No rejected influencers" description="Influencers moved to Rejected appear here." />
      ) : (
        <>
          <Input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name or handle"
            aria-label="Search rejected influencers"
            className="max-w-sm"
          />
          {rows.length === 0 ? (
            <EmptyState icon={SearchX} title="No matches" description="Try another name or handle." />
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Instagram handle</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.slice(0, SHOWN).map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">
                        <Link to={`/influencers/${r.id}`} className="hover:underline">
                          {r.name}
                        </Link>
                      </TableCell>
                      <TableCell>
                        {r.instagram ? (
                          <a href={PLATFORM_META.instagram.url(r.instagram)} target="_blank" rel="noreferrer" className="text-muted-foreground hover:underline">
                            @{r.instagram}
                          </a>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          {rows.length > SHOWN && (
            <p className="text-body text-muted-foreground">
              Showing {formatNumber(SHOWN)} of {formatNumber(rows.length)}. Search to narrow, or download the full list.
            </p>
          )}
        </>
      )}
    </div>
  )
}
