import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueries } from '@tanstack/react-query'
import { BadgeCheck, Info, Loader2, RotateCcw, Search, UserX } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { FormProvider, useForm } from 'react-hook-form'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { PersonAvatar } from '@/components/common/person-avatar'
import { PlatformMark } from '@/components/common/platform-badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DuplicateWarning } from '@/features/duplicates/duplicate-warning'
import { useJob } from '@/hooks/use-job'
import { useCan, useMe } from '@/hooks/use-me'
import { exactMetric, formatMetric, LOOKUP_PLATFORMS, metricValue, PLATFORM_META, platformOfUrl } from '@/lib/platforms'
import { handleSchema, influencerDetailsSchema, validateField, type InfluencerDetailsInput } from '@/lib/schemas'
import { getErrorMessage, influencersApi, lookupApi } from '@/services'
import type { AccountCreate, AccountRef, DuplicateMatch, LookupErrorCode, LookupProfile, Platform } from '@/types'
import type { z } from 'zod'
import { AlreadyInCrm } from './already-in-crm'
import { conflictFromError, type ConflictState } from './conflict'
import type { ManualPrefill } from './context'
import { DetailsFields } from './details-fields'
import { afterCreate, detailDefaults, findDuplicates, useCreateInfluencer } from './queries'

function ProfilePreview({ profile }: { profile: LookupProfile }) {
  const meta = PLATFORM_META[profile.platform]
  return (
    <div className="space-y-3 rounded-lg border bg-muted/30 p-3" aria-label="Profile preview">
      <div className="flex gap-3">
        <PersonAvatar name={profile.display_name} src={profile.profile_pic_url} className="size-14 text-base" />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-x-2">
            <PlatformMark platform={profile.platform} />
            <span className="font-medium">{profile.display_name}</span>
            {profile.is_verified && <BadgeCheck className="size-4 text-sky-500" aria-label="Verified" />}
            <span className="text-sm text-muted-foreground">@{profile.handle}</span>
          </div>
          {profile.bio && <p className="text-sm text-muted-foreground">{profile.bio}</p>}
        </div>
      </div>
      <dl className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {meta.metrics.map((def) => {
          const value = metricValue(profile, def.key)
          return value === null ? null : (
            <div key={def.key} className="flex gap-1">
              <dd className="font-semibold tabular-nums" title={exactMetric(def, value)}>
                {formatMetric(def, value)}
              </dd>
              <dt className="text-muted-foreground">{def.label.toLowerCase()}</dt>
            </div>
          )
        })}
      </dl>
    </div>
  )
}

const FAILURES: Partial<Record<LookupErrorCode | 'not_supported', { title: string; body: string }>> = {
  personal_account: {
    title: 'Personal profile',
    body: 'Only Business / Creator accounts and public Pages share their data. You can still add this influencer manually.',
  },
  not_found: { title: 'Account not found', body: 'No account has that username. Check the spelling and try again.' },
  rate_limited: { title: 'Rate limited', body: 'Too many lookups right now. Wait a few minutes, then try again.' },
}

/** Other accounts found in the bio or links, each checked against the CRM before it can be added. */
function LinkedAccounts({
  accounts,
  selected,
  onToggle,
}: {
  accounts: AccountRef[]
  selected: string[]
  onToggle: (key: string, on: boolean) => void
}) {
  const checks = useQueries({
    queries: accounts.map((a) => ({
      queryKey: ['check-handle', a.platform, a.handle],
      queryFn: ({ signal }: { signal: AbortSignal }) => influencersApi.checkHandle(a.platform, a.handle, signal),
      staleTime: 10_000,
    })),
  })
  if (!accounts.length) return null
  return (
    <div className="space-y-1.5 rounded-md border p-3 text-sm">
      {accounts.map((a, i) => {
        const key = `${a.platform}:${a.handle}`
        const taken = checks[i]?.data?.available === false
        return (
          <label key={key} className="flex items-center gap-2">
            <Checkbox checked={selected.includes(key)} disabled={taken} onCheckedChange={(v) => onToggle(key, !!v)} />
            <span>
              Also found: {PLATFORM_META[a.platform].label} @{a.handle}.{' '}
              {taken ? <span className="text-muted-foreground">Already in the CRM.</span> : 'Add it?'}
            </span>
          </label>
        )
      })}
    </div>
  )
}

function SaveProfileForm({ profile, onDone }: { profile: LookupProfile; onDone: () => void }) {
  const navigate = useNavigate()
  const { data: me } = useMe()
  const canReassign = useCan('influencer:reassign')
  const create = useCreateInfluencer()
  const [conflict, setConflict] = useState<ConflictState | null>(null)
  const [linked, setLinked] = useState<string[]>([])
  const [matches, setMatches] = useState<DuplicateMatch[] | null>(null)
  const [busy, setBusy] = useState(false)
  const form = useForm<InfluencerDetailsInput, unknown, z.output<typeof influencerDetailsSchema>>({
    resolver: zodResolver(influencerDetailsSchema),
    defaultValues: { ...detailDefaults(me?.id), name: profile.display_name },
  })

  const accounts = (): AccountCreate[] => [
    {
      platform: profile.platform,
      handle: profile.handle,
      metrics: profile.metrics,
      display_name: profile.display_name,
      profile_pic_url: profile.profile_pic_url,
      bio: profile.bio,
      links: profile.links,
      is_verified: profile.is_verified,
    },
    ...profile.linked_accounts
      .filter((a) => linked.includes(`${a.platform}:${a.handle}`))
      .map((a) => ({ platform: a.platform, handle: a.handle })),
  ]

  const save = async (values: z.output<typeof influencerDetailsSchema>, acknowledged: boolean) => {
    setBusy(true)
    try {
      if (!acknowledged) {
        const found = await findDuplicates({
          name: values.name,
          email: values.email,
          phone: values.phone,
          city: values.city,
          accounts: [
            { platform: profile.platform, handle: profile.handle, bio: profile.bio, links: profile.links },
            ...accounts().slice(1),
          ],
        })
        if (found.length) return setMatches(found)
      }
      const created = await create.mutateAsync({ ...values, accounts: accounts() })
      const next = afterCreate(created, canReassign)
      toast.success(next.message)
      onDone()
      navigate(next.path)
    } catch (err) {
      const found = await conflictFromError(err, profile.platform, profile.handle)
      if (found) setConflict(found)
      else toast.error('Couldn’t add the influencer', { description: getErrorMessage(err) })
    } finally {
      setBusy(false)
    }
  }

  /** Same creator: put the looked-up account (and the ticked linked ones) on the existing profile instead. */
  const addToExisting = async (match: DuplicateMatch) => {
    if (!match.influencer_id) return
    setBusy(true)
    try {
      for (const body of accounts()) await influencersApi.addAccount(match.influencer_id, body)
      toast.success(`Added to ${match.influencer?.name}`)
      onDone()
      navigate(`/influencers/${match.influencer_id}`)
    } catch (err) {
      toast.error('Couldn’t add the account', { description: getErrorMessage(err) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <FormProvider {...form}>
      {/* Editing after a duplicate warning makes it out of date. */}
      <form
        onSubmit={form.handleSubmit((v) => save(v, false))}
        onChange={() => setMatches(null)}
        className="space-y-4"
        noValidate
        aria-label="Add details"
      >
        <ProfilePreview profile={profile} />
        <LinkedAccounts
          accounts={profile.linked_accounts}
          selected={linked}
          onToggle={(key, on) => setLinked((l) => (on ? [...l, key] : l.filter((k) => k !== key)))}
        />
        {conflict && <AlreadyInCrm {...conflict} onDone={onDone} />}
        <DetailsFields idPrefix="ig" />
        {matches ? (
          <DuplicateWarning
            matches={matches}
            busy={busy}
            onUseExisting={(m) => void addToExisting(m)}
            proceedLabel="Create anyway"
            onLeave={onDone}
            onProceed={() => void form.handleSubmit((v) => save(v, true))()}
          />
        ) : (
          <div className="flex justify-end">
            <Button type="submit" disabled={busy}>
              {busy ? 'Saving…' : 'Save influencer'}
            </Button>
          </div>
        )}
      </form>
    </FormProvider>
  )
}

export function LookupTab({ onDone, onManual }: { onDone: () => void; onManual: (prefill: ManualPrefill) => void }) {
  const [platform, setPlatform] = useState<Platform>('instagram')
  const [input, setInput] = useState('')
  const [inputError, setInputError] = useState<string | null>(null)
  const [handle, setHandle] = useState<string | null>(null)
  const [jobId, setJobId] = useState<string | null>(null)
  const [conflict, setConflict] = useState<ConflictState | null>(null)
  const lookup = useMutation({ mutationFn: lookupApi.start })
  const job = useJob<LookupProfile>(jobId)
  const label = PLATFORM_META[platform].label

  const start = (event?: FormEvent) => {
    event?.preventDefault()
    // A pasted profile link decides the platform.
    const fromUrl = platformOfUrl(input)
    const target = fromUrl && LOOKUP_PLATFORMS.includes(fromUrl) ? fromUrl : platform
    if (target !== platform) setPlatform(target)
    const result = validateField(handleSchema(target), input)
    if (!result.ok) return setInputError(result.error)
    setInputError(null)
    setConflict(null)
    setJobId(null)
    setHandle(result.value)
    lookup.mutate(
      { platform: target, username: result.value },
      {
        onSuccess: ({ job_id }) => setJobId(job_id),
        onError: async (err) => {
          const found = await conflictFromError(err, target, result.value)
          if (found) return setConflict(found)
          setInputError(getErrorMessage(err))
        },
      },
    )
  }

  const reset = () => {
    setJobId(null)
    setHandle(null)
    setConflict(null)
    setInput('')
  }

  const status = job.data?.status
  const running = lookup.isPending || (jobId !== null && status !== 'succeeded' && status !== 'failed')
  const failure = status === 'failed' ? (job.data?.error?.code as keyof typeof FAILURES | undefined) : undefined
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
        <Label htmlFor="lookup-username">Username or profile link</Label>
        <div className="flex gap-2">
          <Select value={platform} onValueChange={(v) => setPlatform(v as Platform)} disabled={running}>
            <SelectTrigger className="w-40" aria-label="Platform">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LOOKUP_PLATFORMS.map((p) => (
                <SelectItem key={p} value={p}>
                  <PlatformMark platform={p} />
                  {p === 'facebook' ? 'Facebook Page' : PLATFORM_META[p].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            id="lookup-username"
            value={input}
            onChange={(e) => {
              setInput(e.target.value)
              setInputError(null)
            }}
            placeholder={`@riyastyle or ${PLATFORM_META[platform].url('riyastyle').replace(/^https:\/\/(www\.)?/, '')}`}
            autoFocus
            autoComplete="off"
            aria-invalid={!!inputError}
            aria-describedby={inputError ? 'lookup-username-error' : undefined}
            disabled={running}
          />
          <Button type="submit" disabled={running || !input.trim()}>
            {running ? <Loader2 className="animate-spin" /> : <Search />}
            Fetch
          </Button>
        </div>
        {inputError && (
          <p id="lookup-username-error" className="text-xs text-destructive">
            {inputError}
          </p>
        )}
      </form>

      {running && (
        <div className="space-y-1" aria-live="polite">
          <Progress value={job.data?.progress ?? 5} aria-label="Lookup progress" />
          <p className="text-xs text-muted-foreground">
            Fetching @{handle} from {label}…
          </p>
        </div>
      )}

      {conflict && <AlreadyInCrm {...conflict} onDone={onDone} />}

      {status === 'failed' && (
        <div role="alert" className="space-y-3 rounded-md border bg-muted/40 p-3 text-sm">
          <div className="flex gap-2">
            {failure === 'personal_account' ? (
              <UserX className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            ) : (
              <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            )}
            <div>
              <p className="font-medium">{(failure && FAILURES[failure]?.title) ?? 'Lookup failed'}</p>
              <p className="text-muted-foreground">{(failure && FAILURES[failure]?.body) ?? job.data?.error?.message}</p>
            </div>
          </div>
          <div className="flex gap-2">
            {failure === 'personal_account' && handle && (
              <Button size="sm" onClick={() => onManual({ platform, handle, personal: true })}>
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

      {!running && status !== 'failed' && !conflict && (
        <p className="text-sm text-muted-foreground">
          Works for Instagram Business / Creator accounts, YouTube channels, Threads and public Facebook Pages. TikTok and
          Pinterest are connected by the creator; LinkedIn and Snapchat are added manually.
        </p>
      )}
    </div>
  )
}
