import { Plus } from 'lucide-react'
import { ComingSoonButton } from '@/components/common/coming-soon-button'
import { GlobalSearch } from './global-search'
import { NotificationsMenu } from './notifications-menu'
import { UserMenu } from './user-menu'

export function TopBar() {
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b bg-background px-4 lg:px-6">
      <GlobalSearch />
      <div className="ml-auto flex items-center gap-1.5">
        <ComingSoonButton phase={4}>
          <Plus />
          Add Influencer
        </ComingSoonButton>
        <NotificationsMenu />
        <UserMenu />
      </div>
    </header>
  )
}
