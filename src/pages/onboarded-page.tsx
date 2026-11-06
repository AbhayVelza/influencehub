import { ChevronRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { PageHeader } from '@/components/common/page-header'
import { PlatformIcon } from '@/components/common/platform-icon'
import { Skeleton } from '@/components/ui/skeleton'
import { useOnboardedCounts } from '@/features/onboarded/queries'
import { formatNumber } from '@/lib/format'
import { PLATFORM_META, PLATFORMS } from '@/lib/platforms'

export default function OnboardedPage() {
  const counts = useOnboardedCounts()

  return (
    <div className="space-y-4 p-6">
      <PageHeader
        title="Onboarded"
        description="Every onboarded creator (Onboarded, Package Sent or Delivered), by platform. Pick a platform to see its list."
      />
      <ul aria-label="Platforms" className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-4">
        {PLATFORMS.map((platform, i) => {
          const count = counts[i]
          return (
            <li key={platform}>
              <Link
                to={`/onboarded/${platform}`}
                className="flex items-center gap-3 rounded-lg border bg-card p-4 transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <PlatformIcon platform={platform} className="size-10" />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{PLATFORM_META[platform].label}</div>
                  <div className="text-sm text-muted-foreground">
                    {count.isPending ? (
                      <Skeleton className="mt-1 h-4 w-20" />
                    ) : count.isError ? (
                      'Couldn’t load the count'
                    ) : (
                      `${formatNumber(count.data ?? 0)} onboarded`
                    )}
                  </div>
                </div>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              </Link>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
