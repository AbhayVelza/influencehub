import { useSearchParams } from 'react-router-dom'
import { PageHeader } from '@/components/common/page-header'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CategorySettings } from '@/features/settings/category-settings'
import { InstagramSettings } from '@/features/settings/instagram-settings'
import { PoolSettings } from '@/features/settings/pool-settings'
import { TeamSettings } from '@/features/settings/team-settings'

const TABS = ['instagram', 'team', 'categories', 'pool'] as const
type Tab = (typeof TABS)[number]

export default function SettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const param = searchParams.get('tab') as Tab | null
  const tab: Tab = param && TABS.includes(param) ? param : 'instagram'

  return (
    <div className="min-w-0 space-y-space-lg px-4 py-6 sm:px-6 lg:px-space-xl lg:py-space-lg">
      <PageHeader title="Settings" description="Admin only." />
      <Tabs
        value={tab}
        onValueChange={(next) => setSearchParams(next === 'instagram' ? {} : { tab: next }, { replace: true })}
        className="min-w-0 max-w-full gap-space-lg"
      >
        <TabsList className="min-w-0 max-w-full">
          <TabsTrigger value="instagram">Instagram</TabsTrigger>
          <TabsTrigger value="team">Team & roles</TabsTrigger>
          <TabsTrigger value="categories">Categories</TabsTrigger>
          <TabsTrigger value="pool">Unassigned Pool</TabsTrigger>
        </TabsList>
        <TabsContent value="instagram">
          <InstagramSettings />
        </TabsContent>
        <TabsContent value="team">
          <TeamSettings />
        </TabsContent>
        <TabsContent value="categories">
          <CategorySettings />
        </TabsContent>
        <TabsContent value="pool">
          <PoolSettings />
        </TabsContent>
      </Tabs>
    </div>
  )
}
