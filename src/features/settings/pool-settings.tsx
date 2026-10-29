import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { ErrorState } from '@/components/common/states'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { poolSettingsSchema, type PoolSettingsInput } from '@/lib/schemas'
import { getErrorMessage } from '@/services'
import type { PoolSettings as PoolSettingsData } from '@/types'
import { usePoolSettings, useUpdatePoolSettings } from './queries'

const toInput = (s: PoolSettingsData): PoolSettingsInput => ({
  claim_limit: s.claim_limit === null ? '' : String(s.claim_limit),
  auto_release_days: s.auto_release_days === null ? '' : String(s.auto_release_days),
})

/** Optional guards for the Unassigned Pool. Empty = off. */
export function PoolSettings() {
  const settings = usePoolSettings()
  const update = useUpdatePoolSettings()
  const form = useForm<PoolSettingsInput, unknown, PoolSettingsData>({
    resolver: zodResolver(poolSettingsSchema),
    defaultValues: { claim_limit: '', auto_release_days: '' },
  })
  const { register, formState, reset } = form

  useEffect(() => {
    if (settings.data) reset(toInput(settings.data))
  }, [settings.data, reset])

  const onSubmit = form.handleSubmit((values) =>
    update.mutate(values, {
      onSuccess: (saved) => {
        reset(toInput(saved))
        toast.success('Pool settings saved')
      },
      onError: (err) => toast.error('Couldn’t save', { description: getErrorMessage(err) }),
    }),
  )

  if (settings.isPending) return <Skeleton className="h-64" />
  if (settings.isError) return <ErrorState title="Couldn’t load pool settings" error={settings.error} onRetry={() => settings.refetch()} />

  const errors = formState.errors
  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>Unassigned Pool</CardTitle>
        <CardDescription>Both guards are optional. Leave a field empty to turn it off.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-5" noValidate>
          <div className="grid gap-1.5">
            <Label htmlFor="claim-limit">Claim limit</Label>
            <div className="flex items-center gap-2">
              <Input
                id="claim-limit"
                inputMode="numeric"
                placeholder="Off"
                className="w-28"
                aria-invalid={!!errors.claim_limit}
                aria-describedby="claim-limit-hint"
                {...register('claim_limit')}
              />
              <span className="text-sm text-muted-foreground">uncontacted influencers per executive</span>
            </div>
            <p id="claim-limit-hint" className={errors.claim_limit ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'}>
              {errors.claim_limit?.message ??
                'Counts influencers an executive owns in Data Gathered. Claims beyond it are refused.'}
            </p>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="auto-release">Auto-release</Label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Return to the pool if no call is logged within</span>
              <Input
                id="auto-release"
                inputMode="numeric"
                placeholder="Off"
                className="w-20"
                aria-invalid={!!errors.auto_release_days}
                aria-describedby="auto-release-hint"
                {...register('auto_release_days')}
              />
              <span className="text-sm text-muted-foreground">days of claiming</span>
            </div>
            <p id="auto-release-hint" className={errors.auto_release_days ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'}>
              {errors.auto_release_days?.message ?? 'Executives get a notification the day before a claim is released.'}
            </p>
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" disabled={!formState.isDirty || update.isPending} onClick={() => reset()}>
              Discard
            </Button>
            <Button type="submit" disabled={!formState.isDirty || update.isPending}>
              {update.isPending ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
