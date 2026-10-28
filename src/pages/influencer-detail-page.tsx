import { SearchX } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { EmptyState, ErrorState } from '@/components/common/states'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { LogCallDialog } from '@/features/calls/log-call-dialog'
import { useInfluencerCalls } from '@/features/calls/queries'
import {
  pipelinePosition,
  previousStageOf,
  useInfluencer,
  useInfluencerActivity,
} from '@/features/influencers/detail-queries'
import { ActivityTab } from '@/features/influencers/detail/activity-tab'
import { CallsTab } from '@/features/influencers/detail/calls-tab'
import { InfluencerHeader } from '@/features/influencers/detail/influencer-header'
import { InstagramPanel } from '@/features/influencers/detail/instagram-panel'
import { OverviewTab } from '@/features/influencers/detail/overview-tab'
import { PackagesTab } from '@/features/influencers/detail/packages-tab'
import { listReturnPath } from '@/features/influencers/list-params'
import { PackageDrawer } from '@/features/packages/package-drawer'
import { usePackages } from '@/features/packages/queries'
import { ApiError } from '@/services'
import type { Package } from '@/types'

const TABS = ['overview', 'calls', 'packages', 'activity'] as const
type Tab = (typeof TABS)[number]

function DetailSkeleton() {
  return (
    <div className="space-y-6 p-6" aria-busy="true" aria-label="Loading influencer">
      <Skeleton className="h-6 w-28" />
      <div className="flex items-center gap-4">
        <Skeleton className="size-14 rounded-full" />
        <div className="space-y-2">
          <Skeleton className="h-6 w-56" />
          <Skeleton className="h-4 w-72" />
        </div>
      </div>
      <Skeleton className="h-8 w-full" />
      <div className="grid gap-6 lg:grid-cols-[20rem_1fr]">
        <Skeleton className="h-96" />
        <Skeleton className="h-96" />
      </div>
    </div>
  )
}

export default function InfluencerDetailPage() {
  const { id = '' } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const influencer = useInfluencer(id)
  const activity = useInfluencerActivity(id)
  const calls = useInfluencerCalls(id)
  const packages = usePackages({ influencer_id: id, page_size: 100 })

  const [callDialog, setCallDialog] = useState<{ open: boolean; intent?: 'contacted' }>({ open: false })
  const [packageDrawer, setPackageDrawer] = useState<{ open: boolean; pkg?: Package | null; intent?: 'package_sent' }>({
    open: false,
  })

  const tabParam = searchParams.get('tab')
  const tab: Tab = TABS.includes(tabParam as Tab) ? (tabParam as Tab) : 'overview'
  const setTab = (next: string) =>
    setSearchParams(
      (prev) => {
        const sp = new URLSearchParams(prev)
        if (next === 'overview') sp.delete('tab')
        else sp.set('tab', next)
        return sp
      },
      { replace: true },
    )

  const pages = activity.data?.pages.map((p) => p.items) ?? []
  const inf = influencer.data
  const previousStage = inf ? previousStageOf(inf, pages) : null

  // On hold for a long time: keep paging the activity log until the move onto hold is found.
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = activity
  useEffect(() => {
    if (inf?.stage === 'on_hold' && !previousStage && hasNextPage && !isFetchingNextPage) void fetchNextPage()
  }, [inf?.stage, previousStage, hasNextPage, isFetchingNextPage, fetchNextPage])

  if (influencer.isPending) return <DetailSkeleton />
  if (influencer.isError) {
    if (influencer.error instanceof ApiError && influencer.error.status === 404) {
      return (
        <EmptyState
          icon={SearchX}
          title="Influencer not found"
          description="They may have been deleted, or the link is wrong."
          action={
            <Button asChild variant="outline">
              <Link to={listReturnPath()}>Back to influencers</Link>
            </Button>
          }
          className="py-24"
        />
      )
    }
    return (
      <ErrorState
        title="Couldn’t load this influencer"
        error={influencer.error}
        onRetry={() => influencer.refetch()}
        className="py-24"
      />
    )
  }

  const data = influencer.data
  const callCount = calls.data?.total
  const packageCount = packages.data?.total
  const openLogCall = (intent?: 'contacted') => setCallDialog({ open: true, intent })
  const openPackage = (intent?: 'package_sent', pkg?: Package) => setPackageDrawer({ open: true, intent, pkg })

  return (
    <div className="space-y-6 p-6">
      <InfluencerHeader
        influencer={data}
        previousStage={previousStage}
        pipelinePosition={pipelinePosition(data, pages)}
        hasInterestedCall={!!calls.data?.items.some((c) => c.outcome === 'interested')}
        hasTrackedPackage={!!packages.data?.items.some((p) => p.courier && p.tracking_number)}
        onLogCall={openLogCall}
        onCreatePackage={() => openPackage()}
      />

      <div className="grid items-start gap-6 lg:grid-cols-[19rem_minmax(0,1fr)]">
        <InstagramPanel influencer={data} />

        <Tabs value={tab} onValueChange={setTab} className="min-w-0 gap-4">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="calls">Calls{callCount ? ` (${callCount})` : ''}</TabsTrigger>
            <TabsTrigger value="packages">Packages{packageCount ? ` (${packageCount})` : ''}</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
          </TabsList>
          <TabsContent value="overview">
            <OverviewTab influencer={data} />
          </TabsContent>
          <TabsContent value="calls">
            <CallsTab influencerId={data.id} onLogCall={() => openLogCall()} />
          </TabsContent>
          <TabsContent value="packages">
            <PackagesTab influencerId={data.id} onCreate={() => openPackage()} onEdit={(pkg) => openPackage(undefined, pkg)} />
          </TabsContent>
          <TabsContent value="activity">
            <ActivityTab activity={activity} />
          </TabsContent>
        </Tabs>
      </div>

      <LogCallDialog
        influencer={data}
        open={callDialog.open}
        intent={callDialog.intent}
        onOpenChange={(open) => setCallDialog((s) => ({ ...s, open }))}
      />
      <PackageDrawer
        influencer={data}
        pkg={packageDrawer.pkg}
        intent={packageDrawer.intent}
        open={packageDrawer.open}
        onOpenChange={(open) => setPackageDrawer((s) => ({ ...s, open }))}
      />
    </div>
  )
}
