import { RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useCan } from '@/hooks/use-me'
import { useProfileLookup } from '@/hooks/use-integrations'
import { formatNumber } from '@/lib/format'
import { getErrorMessage } from '@/services'
import { useSyncInstagramAll } from './queries'

/** Admin "Sync Instagram" (Influencers header, Settings → Instagram): only while Instagram is connected. */
export function SyncInstagramButton() {
  const canManage = useCan('integrations:manage')
  const connected = useProfileLookup().includes('instagram')
  const sync = useSyncInstagramAll()
  if (!canManage || !connected) return null

  const run = () =>
    sync.mutate(undefined, {
      onSuccess: ({ queued, switched }) =>
        toast.success(`${formatNumber(queued)} Instagram accounts queued`, {
          description: `${switched ? `${formatNumber(switched)} switched to auto-sync. ` : ''}About 90 sync per hour; a full pass takes about ${Math.max(1, Math.ceil(queued / 90))} h.`,
        }),
      onError: (err) => toast.error('Couldn’t start the sync', { description: getErrorMessage(err) }),
    })

  return (
    <Button variant="outline" onClick={run} disabled={sync.isPending}>
      <RefreshCw className={sync.isPending ? 'animate-spin' : undefined} />
      Sync Instagram
    </Button>
  )
}
