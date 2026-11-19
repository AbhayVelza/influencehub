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
    <div className="space-y-space-lg px-4 py-6 sm:px-6 lg:px-space-xl lg:py-space-lg">
      <PageHeader
        title="Onboarded"
        description="Every onboarded creator (Onboarded, Package Sent or Delivered), by platform. Pick a platform to see its list."
        className="[&_p]:max-w-2xl"
      />
      <ul aria-label="Platforms" className="grid grid-cols-1 gap-gutter sm:grid-cols-2 lg:grid-cols-4">
        {PLATFORMS.map((platform, i) => {
          const count = counts[i]
          return (
            <li key={platform}>
              <Link
                to={`/onboarded/${platform}`}
                className="group relative flex h-full flex-col justify-between overflow-hidden rounded-[20px] bg-surface-container-lowest/70 p-6 shadow-glass backdrop-blur-2xl transition-all duration-200 hover:-translate-y-1 hover:shadow-glass-glow focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none dark:ring-1 dark:ring-white/5"
              >
                <div className="flex items-start justify-between">
                  <PlatformIcon platform={platform} className="size-[52px] rounded-[14px] shadow-md" />
                  <ChevronRight
                    aria-hidden
                    className="size-5 shrink-0 text-muted-foreground transition-[color,transform] duration-150 group-hover:translate-x-0.5 group-hover:text-on-tertiary-container"
                    strokeWidth={1.75}
                  />
                </div>
                <div className="mt-6 flex flex-col">
                  <span className="truncate text-headline-md font-semibold tracking-tight text-primary">{PLATFORM_META[platform].label}</span>{' '}
                  <div className="mt-1 flex min-h-10 items-baseline justify-between gap-2">
                    {count.isPending ? (
                      <Skeleton className="h-9 w-20 self-center rounded-lg" />
                    ) : count.isError ? (
                      <span className="text-body-md text-muted-foreground">Couldn’t load the count</span>
                    ) : (
                      <>
                        <span className="text-display-lg-mobile font-bold text-primary tabular-nums">{formatNumber(count.data ?? 0)}</span>{' '}
                        <span className="text-label-md text-muted-foreground">onboarded</span>
                      </>
                    )}
                  </div>
                </div>
              </Link>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
