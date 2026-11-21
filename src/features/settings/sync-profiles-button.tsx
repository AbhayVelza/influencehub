import { RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useCan } from '@/hooks/use-me'
import { useProfileLookup } from '@/hooks/use-integrations'
import { formatNumber } from '@/lib/format'
import { PLATFORM_META } from '@/lib/platforms'
import { getErrorMessage } from '@/services'
import type { Platform } from '@/types'
import { useSyncAll } from './queries'

/** The background sync's pace per platform (server/sync-worker.ts). */
const PER_HOUR: Partial<Record<Platform, number>> = { instagram: 90, youtube: 240 }

/** Admin "Sync profiles" (Influencers header, Settings → Instagram): only while a platform is connected. */
export function SyncProfilesButton() {
  const canManage = useCan('integrations:manage')
  const connected = useProfileLookup()
  const sync = useSyncAll()
  if (!canManage || !connected.length) return null

  const pace = connected
    .filter((p) => PER_HOUR[p])
    .map((p) => `${PLATFORM_META[p].label} about ${PER_HOUR[p]} an hour`)
    .join(', ')
  const run = () =>
    sync.mutate(undefined, {
      onSuccess: ({ queued, switched }) =>
        toast.success(`${formatNumber(queued)} accounts queued`, {
          description: `${switched ? `${formatNumber(switched)} switched to auto-sync. ` : ''}They sync in the background${pace ? ` (${pace})` : ''}.`,
        }),
      onError: (err) => toast.error('Couldn’t start the sync', { description: getErrorMessage(err) }),
    })

  return (
    <Button variant="outline" onClick={run} disabled={sync.isPending}>
      <RefreshCw className={sync.isPending ? 'animate-spin' : undefined} />
      Sync profiles
    </Button>
  )
}
