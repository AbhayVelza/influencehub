import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAddInfluencer } from '@/features/add-influencer/context'
import { useCan } from '@/hooks/use-me'
import { GlobalSearch } from './global-search'
import { NotificationsMenu } from './notifications-menu'
import { MobileNav } from './sidebar'
import { UserMenu } from './user-menu'

export function TopBar() {
  const { open } = useAddInfluencer()
  const canCreate = useCan('influencer:create')
  // Brand Specialists have no follow-ups or claims to be told about. Their search covers onboarded creators only.
  const crm = useCan('crm:access')
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b sm:gap-3 bg-background px-2 sm:px-4 lg:px-6">
      <MobileNav />
      <GlobalSearch />
      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        {canCreate && (
          <Button onClick={() => open()} aria-label="Add Influencer">
            <Plus />
            <span className="hidden sm:inline">Add Influencer</span>
          </Button>
        )}
        {crm && <NotificationsMenu />}
        <UserMenu />
      </div>
    </header>
  )
}
