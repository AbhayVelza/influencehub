import { Plus } from 'lucide-react'
import { useAddInfluencer } from '@/features/add-influencer/context'
import { useCan } from '@/hooks/use-me'
import { GlobalSearch } from './global-search'
import { NotificationsMenu } from './notifications-menu'
import { MobileNav } from './sidebar'
import { UserMenu } from './user-menu'

export function TopBar() {
  const { open } = useAddInfluencer()
  const canCreate = useCan('influencer:create')
  return (
    <header className="relative z-30 flex h-16 shrink-0 items-center justify-between gap-2 bg-surface-container-lowest/70 px-3 shadow-bar backdrop-blur-2xl sm:gap-space-lg sm:px-6 lg:px-space-xl">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <MobileNav />
        <GlobalSearch />
      </div>
      <div className="flex shrink-0 items-center gap-2 sm:gap-space-md">
        {canCreate && (
          <button
            type="button"
            onClick={() => open()}
            aria-label="Add Influencer"
            className="flex items-center gap-space-xs rounded-full bg-primary px-3 py-2.5 text-body-md font-semibold text-on-primary shadow-sm transition-all duration-150 outline-none hover:-translate-y-px hover:bg-primary/85 hover:shadow-[0_6px_18px_rgba(5,8,11,0.28)] focus-visible:ring-3 focus-visible:ring-ring/50 active:translate-y-0 active:scale-[0.98] sm:px-5"
          >
            <Plus className="size-4" />
            <span className="hidden sm:inline">Add Influencer</span>
          </button>
        )}
        <NotificationsMenu />
        <UserMenu />
      </div>
    </header>
  )
}
