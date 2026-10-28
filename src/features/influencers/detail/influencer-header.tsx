import { ArrowLeft, BadgeCheck, ChevronDown, Copy, ExternalLink, MapPin, MoreHorizontal, Package, PhoneCall, Trash2, UserRound } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { PersonAvatar } from '@/components/common/person-avatar'
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
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useCan, useMe } from '@/hooks/use-me'
import { useTeam } from '@/hooks/use-team'
import { copyToClipboard } from '@/lib/clipboard'
import { formatLocation } from '@/lib/format'
import { getErrorMessage } from '@/services'
import type { Influencer, Stage } from '@/types'
import { listReturnPath } from '../list-params'
import { useDeleteInfluencer, useUpdateInfluencer } from '../detail-queries'
import { StageControl } from './stage-control'
import { StageStepper } from './stage-stepper'

function OwnerControl({ influencer }: { influencer: Influencer }) {
  const team = useTeam()
  const { data: me } = useMe()
  const canReassign = useCan('influencer:reassign')
  const canClaim = useCan('influencer:claim')
  const update = useUpdateInfluencer(influencer.id)
  const owner = team.data?.items.find((u) => u.id === influencer.assigned_to)
  const label = influencer.assigned_to ? (owner?.name ?? '…') : 'Unassigned'

  const assign = (userId: string | null) =>
    update.mutate(
      { assigned_to: userId },
      {
        onSuccess: () => toast.success(userId ? `Assigned to ${team.data?.items.find((u) => u.id === userId)?.name}` : 'Unassigned'),
        onError: (err) => toast.error('Couldn’t change the owner', { description: getErrorMessage(err) }),
      },
    )

  if (!canReassign && canClaim && !influencer.assigned_to && me) {
    return (
      <Button
        variant="outline"
        disabled={update.isPending}
        onClick={() =>
          update.mutate(
            { assigned_to: me.id },
            {
              onSuccess: () => toast.success('Claimed — you’re now the owner'),
              onError: (err) => toast.error('Couldn’t claim', { description: getErrorMessage(err) }),
            },
          )
        }
      >
        <UserRound />
        Unassigned · Claim
      </Button>
    )
  }

  if (!canReassign) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span tabIndex={0} className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-sm text-muted-foreground">
            <UserRound className="size-4" />
            Owner: <span className="text-foreground">{label}</span>
          </span>
        </TooltipTrigger>
        <TooltipContent>Only managers and admins can reassign an owned influencer</TooltipContent>
      </Tooltip>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" disabled={update.isPending} aria-label={`Owner: ${label}. Change owner`}>
          <UserRound />
          <span className="text-muted-foreground">Owner:</span> {label}
          <ChevronDown className="opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel className="text-xs text-muted-foreground">Assign to</DropdownMenuLabel>
        {team.data?.items
          .filter((u) => u.is_active)
          .map((user) => (
            <DropdownMenuItem key={user.id} onSelect={() => assign(user.id)} disabled={user.id === influencer.assigned_to}>
              <PersonAvatar name={user.name} className="size-5 text-[9px]" />
              {user.name}
            </DropdownMenuItem>
          ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => assign(null)} disabled={!influencer.assigned_to}>
          Unassign
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

interface InfluencerHeaderProps {
  influencer: Influencer
  previousStage: Stage | null
  pipelinePosition: Stage | null
  hasInterestedCall: boolean
  hasTrackedPackage: boolean
  onLogCall: () => void
  onCreatePackage: () => void
}

export function InfluencerHeader({
  influencer,
  previousStage,
  pipelinePosition,
  hasInterestedCall,
  hasTrackedPackage,
  onLogCall,
  onCreatePackage,
}: InfluencerHeaderProps) {
  const navigate = useNavigate()
  const canDelete = useCan('influencer:delete')
  const remove = useDeleteInfluencer(influencer.id)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const location = formatLocation([influencer.city, influencer.state, influencer.country])

  const onDelete = () =>
    remove.mutate(undefined, {
      onSuccess: () => {
        toast.success(`${influencer.name} deleted`)
        navigate(listReturnPath())
      },
      onError: (err) => toast.error('Couldn’t delete', { description: getErrorMessage(err) }),
    })

  return (
    <header className="space-y-4">
      <Button asChild variant="ghost" size="sm" className="-ml-2 text-muted-foreground">
        <Link to={listReturnPath()}>
          <ArrowLeft />
          Influencers
        </Link>
      </Button>

      <div className="flex flex-wrap items-start gap-4">
        <PersonAvatar name={influencer.name} src={influencer.profile_pic_url} className="size-14 text-base" />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className="flex items-center gap-1.5 font-heading text-xl font-semibold tracking-tight">
              {influencer.name}
              {influencer.is_verified && <BadgeCheck className="size-5 text-sky-500" aria-label="Verified account" />}
            </h1>
            <a
              href={influencer.profile_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground hover:underline"
            >
              @{influencer.instagram_handle}
              <ExternalLink className="size-3.5" />
            </a>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            <span className="rounded-full border px-2 py-0.5 text-xs text-foreground">{influencer.category}</span>
            {location !== '—' && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-3.5" />
                {location}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <StageControl
          influencer={influencer}
          previousStage={previousStage}
          hasInterestedCall={hasInterestedCall}
          hasTrackedPackage={hasTrackedPackage}
        />
        <OwnerControl influencer={influencer} />
        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" onClick={() => onLogCall()}>
            <PhoneCall />
            Log call
          </Button>
          <Button variant="outline" onClick={() => onCreatePackage()}>
            <Package />
            Create package
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="More actions">
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem asChild>
                <a href={influencer.profile_url} target="_blank" rel="noreferrer">
                  <ExternalLink />
                  Open on Instagram
                </a>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => copyToClipboard(influencer.profile_url, 'Profile link copied')}>
                <Copy />
                Copy profile link
              </DropdownMenuItem>
              {canDelete && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onSelect={() => setConfirmDelete(true)}>
                    <Trash2 />
                    Delete influencer
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <StageStepper stage={influencer.stage} position={pipelinePosition} />

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {influencer.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This also removes their calls, packages and activity history. It can’t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={onDelete}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </header>
  )
}
