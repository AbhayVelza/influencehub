import { ShieldX } from 'lucide-react'
import { Suspense } from 'react'
import { Outlet } from 'react-router-dom'
import { ErrorState } from '@/components/common/states'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { AddInfluencerProvider } from '@/features/add-influencer/add-influencer-provider'
import { useMe } from '@/hooks/use-me'
import { signOut } from '@/lib/auth'
import { ApiError } from '@/services'
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

/** The /login route's fallback while the page loads (it renders outside the shell). */
export function LoginSkeleton() {
  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/40 p-6" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-80 w-full max-w-sm rounded-xl" />
    </div>
  )
}

/** Signed in, but the account was deactivated (403 from GET /me). */
function AccessDenied({ message }: { message: string }) {
  return (
    <main className="flex min-h-svh items-center justify-center bg-background p-6">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-3 flex size-10 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <ShieldX className="size-5" aria-hidden />
        </div>
        <h1 className="text-lg font-semibold">No access to InfluenceHub</h1>
        <p className="mt-1 text-sm text-muted-foreground">{message}</p>
        <Button className="mt-5" variant="outline" onClick={() => void signOut()}>
          Sign out
        </Button>
      </div>
    </main>
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
  const status = me.error instanceof ApiError ? me.error.status : null
  // 401: the session ended; the route guard sends the user to /login in a moment.
  if (me.isPending || status === 401) return <ShellSkeleton />
  if (status === 403) return <AccessDenied message={me.error!.message} />
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
