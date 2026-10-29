import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { BadgeCheck, Info, Loader2, RotateCcw, Search, UserX } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { FormProvider, useForm } from 'react-hook-form'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { PersonAvatar } from '@/components/common/person-avatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { useJob } from '@/hooks/use-job'
import { useCan, useMe } from '@/hooks/use-me'
import { ACCOUNT_TYPE_LABEL } from '@/lib/constants'
import { formatCompact, formatPercent } from '@/lib/format'
import { fieldSchemas, influencerDetailsSchema, normalizeHandle, validateField } from '@/lib/schemas'
import { getErrorMessage, instagramApi } from '@/services'
import type { InstagramLookupErrorCode, InstagramProfile } from '@/types'
import { AlreadyInCrm } from './already-in-crm'
import { conflictFromError, type ConflictState } from './conflict'
import type { ManualPrefill } from './context'
import { DetailsFields } from './details-fields'
import { afterCreate, detailDefaults, useCreateInfluencer } from './queries'

function ProfilePreview({ profile }: { profile: InstagramProfile }) {
  return (
    <div className="flex gap-3 rounded-lg border bg-muted/30 p-3" aria-label="Instagram profile preview">
      <PersonAvatar name={profile.name} src={profile.profile_pic_url} className="size-14 text-base" />
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-x-2">
          <span className="font-medium">{profile.name}</span>
          {profile.is_verified && <BadgeCheck className="size-4 text-sky-500" aria-label="Verified" />}
          <span className="text-sm text-muted-foreground">@{profile.username}</span>
          <span className="rounded-full border px-2 text-xs">{ACCOUNT_TYPE_LABEL[profile.account_type]}</span>
        </div>
        <p className="text-sm tabular-nums">
          <strong className="font-semibold">{formatCompact(profile.followers)}</strong> followers ·{' '}
          {formatCompact(profile.following)} following · {formatCompact(profile.posts_count)} posts ·{' '}
          {formatPercent(profile.engagement_rate, 2)} engagement
        </p>
        {profile.bio && <p className="text-sm text-muted-foreground">{profile.bio}</p>}
      </div>
    </div>
  )
}

type LookupFailure = Exclude<InstagramLookupErrorCode, 'already_exists' | 'in_pool' | 'assigned_to_other'>

const FAILURES: Record<LookupFailure, { title: string; body: string }> = {
  personal_account: {
    title: 'Personal account',
    body: 'Instagram only shares data for Business and Creator accounts. You can still add this influencer manually.',
  },
  not_found: { title: 'Account not found', body: 'No Instagram account has that username. Check the spelling and try again.' },
  rate_limited: { title: 'Instagram is rate limiting us', body: 'Too many lookups right now. Wait a few minutes, then try again.' },
}

function SaveProfileForm({ profile, onDone }: { profile: InstagramProfile; onDone: () => void }) {
  const navigate = useNavigate()
  const { data: me } = useMe()
  const canReassign = useCan('influencer:reassign')
  const create = useCreateInfluencer()
  const [conflict, setConflict] = useState<ConflictState | null>(null)
  const form = useForm({
    resolver: zodResolver(influencerDetailsSchema),
    defaultValues: { ...detailDefaults(me?.id), name: profile.name },
  })

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const created = await create.mutateAsync({
        ...values,
        instagram_handle: profile.username,
        followers: profile.followers,
        following: profile.following,
        posts_count: profile.posts_count,
        engagement_rate: profile.engagement_rate,
        bio: profile.bio,
        is_verified: profile.is_verified,
        account_type: profile.account_type,
        profile_pic_url: profile.profile_pic_url,
      })
      const next = afterCreate(created, canReassign)
      toast.success(next.message)
      onDone()
      navigate(next.path)
    } catch (err) {
      const found = await conflictFromError(err, profile.username)
      if (found) return setConflict(found)
      toast.error('Couldn’t add the influencer', { description: getErrorMessage(err) })
    }
  })

  return (
    <FormProvider {...form}>
      <form onSubmit={onSubmit} className="space-y-4" noValidate aria-label="Add details">
        <ProfilePreview profile={profile} />
        {conflict && <AlreadyInCrm {...conflict} onDone={onDone} />}
        <DetailsFields idPrefix="ig" />
        <div className="flex justify-end">
          <Button type="submit" disabled={create.isPending}>
            {create.isPending ? 'Saving…' : 'Save influencer'}
          </Button>
        </div>
      </form>
    </FormProvider>
  )
}

export function InstagramTab({ onDone, onManual }: { onDone: () => void; onManual: (prefill: ManualPrefill) => void }) {
  const [input, setInput] = useState('')
  const [inputError, setInputError] = useState<string | null>(null)
  const [handle, setHandle] = useState<string | null>(null)
  const [jobId, setJobId] = useState<string | null>(null)
  const [conflict, setConflict] = useState<ConflictState | null>(null)
  const lookup = useMutation({ mutationFn: (username: string) => instagramApi.lookup(username) })
  const job = useJob<InstagramProfile>(jobId)

  const start = (event?: FormEvent) => {
    event?.preventDefault()
    const result = validateField(fieldSchemas.instagram_handle, normalizeHandle(input))
    if (!result.ok) return setInputError(result.error)
    setInputError(null)
    setConflict(null)
    setJobId(null)
    setHandle(result.value)
    lookup.mutate(result.value, {
      onSuccess: ({ job_id }) => setJobId(job_id),
      onError: async (err) => {
        const found = await conflictFromError(err, result.value)
        if (found) return setConflict(found)
        setInputError(getErrorMessage(err))
      },
    })
  }

  const reset = () => {
    setJobId(null)
    setHandle(null)
    setConflict(null)
    setInput('')
  }

  const status = job.data?.status
  const running = lookup.isPending || (jobId !== null && status !== 'succeeded' && status !== 'failed')
  const failure = status === 'failed' ? (job.data?.error?.code as LookupFailure | undefined) : undefined
  const profile = status === 'succeeded' ? job.data?.result : null

  if (profile) {
    return (
      <div className="space-y-3">
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" onClick={reset}>
            <RotateCcw />
            Look up someone else
          </Button>
        </div>
        <SaveProfileForm profile={profile} onDone={onDone} />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <form onSubmit={start} className="grid gap-1.5" noValidate>
        <Label htmlFor="ig-username">Instagram username or profile link</Label>
        <div className="flex gap-2">
          <Input
            id="ig-username"
            value={input}
            onChange={(e) => {
              setInput(e.target.value)
              setInputError(null)
            }}
            placeholder="@riyastyle or instagram.com/riyastyle"
            autoFocus
            autoComplete="off"
            aria-invalid={!!inputError}
            aria-describedby={inputError ? 'ig-username-error' : undefined}
            disabled={running}
          />
          <Button type="submit" disabled={running || !input.trim()}>
            {running ? <Loader2 className="animate-spin" /> : <Search />}
            Fetch
          </Button>
        </div>
        {inputError && (
          <p id="ig-username-error" className="text-xs text-destructive">
            {inputError}
          </p>
        )}
      </form>

      {running && (
        <div className="space-y-1" aria-live="polite">
          <Progress value={job.data?.progress ?? 5} aria-label="Lookup progress" />
          <p className="text-xs text-muted-foreground">Fetching @{handle} from Instagram…</p>
        </div>
      )}

      {conflict && <AlreadyInCrm {...conflict} onDone={onDone} />}

      {failure && (
        <div role="alert" className="space-y-3 rounded-md border bg-muted/40 p-3 text-sm">
          <div className="flex gap-2">
            {failure === 'personal_account' ? (
              <UserX className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            ) : (
              <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            )}
            <div>
              <p className="font-medium">{FAILURES[failure]?.title ?? 'Lookup failed'}</p>
              <p className="text-muted-foreground">{FAILURES[failure]?.body ?? job.data?.error?.message}</p>
            </div>
          </div>
          <div className="flex gap-2">
            {failure === 'personal_account' && handle && (
              <Button size="sm" onClick={() => onManual({ instagram_handle: handle, account_type: 'personal' })}>
                Enter manually
              </Button>
            )}
            {failure === 'rate_limited' && (
              <Button size="sm" variant="outline" onClick={() => start()}>
                Try again
              </Button>
            )}
          </div>
        </div>
      )}

      {!running && !failure && !conflict && (
        <p className="text-sm text-muted-foreground">
          Works for Business and Creator accounts. We’ll fetch their profile picture, followers, engagement and bio.
        </p>
      )}
    </div>
  )
}
