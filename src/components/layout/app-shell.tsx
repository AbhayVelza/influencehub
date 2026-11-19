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
    <div className="space-y-space-lg px-4 py-6 sm:px-6 lg:px-space-xl">
      <div className="space-y-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-72" />
      </div>
      <Skeleton className="h-64 w-full rounded-2xl" />
    </div>
  )
}

/**
 * The blue backdrop behind every screen (decorative; the Stitch liquid-glass canvas): a light-to-sky-blue gradient
 * with soft cyan light, so the white glass cards stand out from it. One layer, shared by all pages.
 */
function AmbientCanvas() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-[linear-gradient(180deg,#eef7fd_0%,#d9eefa_40%,#c2e3f7_100%)] dark:bg-[linear-gradient(180deg,#0b0f14_0%,#0c1620_55%,#0f2331_100%)]"
    >
      {/* Deeper sky blue on the left and top, as in the approved screens. */}
      <div className="absolute -top-40 left-[8%] h-[720px] w-[720px] rounded-full bg-[#79d1ff]/50 blur-[140px] dark:bg-[#00b4f0]/12" />
      <div className="absolute top-[30%] -left-32 h-[620px] w-[620px] rounded-full bg-[#8fcff2]/65 blur-[130px] dark:bg-[#1d5e7d]/30" />
      <div className="absolute -right-24 -bottom-32 h-[680px] w-[680px] rounded-full bg-[#a9dcf7]/60 blur-[150px] dark:bg-[#0f3a50]/40" />
      {/* A brighter patch on the right keeps the reading area light. */}
      <div className="absolute top-[12%] right-[6%] h-[520px] w-[520px] rounded-full bg-white/55 blur-[150px] dark:bg-transparent" />
    </div>
  )
}

function ShellSkeleton() {
  return (
    <div className="relative flex h-svh bg-surface" aria-busy="true" aria-label="Loading">
      <AmbientCanvas />
      <div className="relative z-10 hidden w-64 shrink-0 lg:max-xl:w-[76px] space-y-3 bg-surface-container-lowest/65 p-4 shadow-glass backdrop-blur-2xl lg:block">
        <Skeleton className="h-9 w-36 rounded-xl" />
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-9 w-full rounded-xl" />
        ))}
      </div>
      <div className="relative z-10 min-w-0 flex-1">
        <div className="flex h-16 items-center bg-surface-container-lowest/70 px-4 shadow-bar backdrop-blur-2xl lg:px-space-xl">
          <Skeleton className="h-9 w-full max-w-lg rounded-xl" />
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
      <div className="flex h-svh items-center justify-center bg-surface">
        <ErrorState title="Couldn’t load your account" error={me.error} onRetry={() => me.refetch()} />
      </div>
    )
  }

  return (
    <AddInfluencerProvider>
      <div className="relative flex h-svh overflow-hidden bg-surface">
        <AmbientCanvas />
        <Sidebar />
        <div className="relative z-10 flex min-w-0 flex-1 flex-col">
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
