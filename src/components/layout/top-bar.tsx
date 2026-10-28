import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAddInfluencer } from '@/features/add-influencer/context'
import { useCan } from '@/hooks/use-me'
import { GlobalSearch } from './global-search'
import { NotificationsMenu } from './notifications-menu'
import { UserMenu } from './user-menu'

export function TopBar() {
  const { open } = useAddInfluencer()
  const canCreate = useCan('influencer:create')
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b bg-background px-4 lg:px-6">
      <GlobalSearch />
      <div className="ml-auto flex items-center gap-1.5">
        {canCreate && (
          <Button onClick={() => open()}>
            <Plus />
            Add Influencer
          </Button>
        )}
        <NotificationsMenu />
        <UserMenu />
      </div>
    </header>
  )
}
