import { Suspense } from 'react'
import { Outlet } from 'react-router-dom'
import { ErrorState } from '@/components/common/states'
import { Skeleton } from '@/components/ui/skeleton'
import { AddInfluencerProvider } from '@/features/add-influencer/add-influencer-provider'
import { useMe } from '@/hooks/use-me'
import { Sidebar } from './sidebar'
import { TopBar } from './top-bar'

export function PageSkeleton() {
  return (
    <div className="space-y-6 p-6">
      <div className="space-y-2">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>
      <Skeleton className="h-64 w-full" />
    </div>
  )
}

function ShellSkeleton() {
  return (
    <div className="flex h-svh" aria-busy="true" aria-label="Loading">
      <div className="w-56 shrink-0 space-y-3 border-r bg-sidebar p-4">
        <Skeleton className="h-7 w-32" />
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </div>
      <div className="flex-1">
        <div className="flex h-14 items-center border-b px-6">
          <Skeleton className="h-8 w-80" />
        </div>
        <PageSkeleton />
      </div>
    </div>
  )
}

export function AppShell() {
  const me = useMe()

  if (me.isPending) return <ShellSkeleton />
  if (me.isError) {
    return (
      <div className="flex h-svh items-center justify-center">
        <ErrorState title="Couldn’t load your account" error={me.error} onRetry={() => me.refetch()} />
      </div>
    )
  }

  return (
    <AddInfluencerProvider>
      <div className="flex h-svh min-w-[1024px] overflow-hidden">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar />
          <main className="flex-1 overflow-y-auto">
            <Suspense fallback={<PageSkeleton />}>
              <Outlet />
            </Suspense>
          </main>
        </div>
      </div>
    </AddInfluencerProvider>
  )
}
