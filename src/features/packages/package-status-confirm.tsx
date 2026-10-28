import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { STAGE_META } from '@/lib/constants'
import type { Stage } from '@/types'
import type { StageChangingStatus } from './queries'

const EFFECT: Record<StageChangingStatus, Stage> = { delivered: 'delivered', returned: 'onboarded' }

interface PackageStatusConfirmProps {
  status: StageChangingStatus | null
  influencerName: string
  /** Current stage, when known; decides the wording of the effect. */
  influencerStage?: Stage
  pending?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function PackageStatusConfirm({ status, influencerName, influencerStage, pending, onConfirm, onCancel }: PackageStatusConfirmProps) {
  const target = status ? STAGE_META[EFFECT[status]].label : ''
  const effect =
    influencerStage === undefined
      ? `If ${influencerName} is in Package Sent, they’ll move to ${target}.`
      : influencerStage === 'package_sent'
        ? `${influencerName} will move from Package Sent to ${target}.`
        : `${influencerName} is in ${STAGE_META[influencerStage].label}, so their stage won’t change.`

  return (
    <AlertDialog open={status !== null} onOpenChange={(open) => !open && !pending && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{status === 'delivered' ? 'Mark package delivered?' : 'Mark package returned?'}</AlertDialogTitle>
          <AlertDialogDescription>{effect}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant={status === 'returned' ? 'destructive' : 'default'}
            disabled={pending}
            onClick={(e) => {
              e.preventDefault()
              onConfirm()
            }}
          >
            {status === 'delivered' ? 'Mark delivered' : 'Mark returned'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
