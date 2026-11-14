import { zodResolver } from '@hookform/resolvers/zod'
import { UserPlus } from 'lucide-react'
import { useState, type ComponentProps } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { InlineTextField } from '@/components/common/inline-field'
import { PersonAvatar } from '@/components/common/person-avatar'
import { ErrorState } from '@/components/common/states'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useMe } from '@/hooks/use-me'
import { useTeam } from '@/hooks/use-team'
import { setMemberPassword } from '@/lib/auth'
import { MIN_PASSWORD_LENGTH, ROLE_LABEL } from '@/lib/constants'
import { PROTOTYPE } from '@/lib/mode'
import { memberLocationSchema, setPasswordSchema, teamMemberCreateSchema, type TeamMemberCreateInput } from '@/lib/schemas'
import { cn } from '@/lib/utils'
import { ApiError, getErrorMessage } from '@/services'
import type { Role, TeamMemberUpdate, User } from '@/types'
import { useAddMember, useUpdateMember } from './queries'

const ROLES = Object.keys(ROLE_LABEL) as Role[]

/** A labelled text input with its error message. */
function TextInput({ id, label, error, hint, ...props }: ComponentProps<typeof Input> & { id: string; label: string; error?: string; hint?: string }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined} {...props} />
      {error && (
        <p id={`${id}-error`} className="text-xs text-destructive">
          {error}
        </p>
      )}
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

const PASSWORD_HINT = `At least ${MIN_PASSWORD_LENGTH} characters. Share it with them securely.`

function AddMemberDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const add = useAddMember()
  const [formError, setFormError] = useState<string | null>(null)
  const form = useForm<TeamMemberCreateInput, unknown, ReturnType<typeof teamMemberCreateSchema.parse>>({
    resolver: zodResolver(teamMemberCreateSchema),
    defaultValues: { name: '', email: '', role: 'executive', location: '', password: '' },
  })
  const { register, control, handleSubmit, reset, setError, formState } = form
  const { errors } = formState

  const close = (next: boolean) => {
    if (add.isPending) return
    if (!next) {
      reset()
      setFormError(null)
    }
    onOpenChange(next)
  }

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null)
    try {
      const user = await add.mutateAsync(values)
      toast.success(`Added ${user.name} as ${ROLE_LABEL[user.role]}`)
      reset()
      onOpenChange(false)
    } catch (err) {
      const code = err instanceof ApiError ? err.code : null
      if (code === 'email_taken') setError('email', { message: getErrorMessage(err) }, { shouldFocus: true })
      else if (code === 'weak_password') setError('password', { message: getErrorMessage(err) }, { shouldFocus: true })
      else setFormError(getErrorMessage(err))
    }
  })

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <DialogHeader>
            <DialogTitle>Add a team member</DialogTitle>
            <DialogDescription>
              {PROTOTYPE
                ? 'Prototype mode: no sign-in. Switch to them from the account menu (Acting as) to try their role.'
                : 'They sign in with this email and the password you set, and can change it from their account menu.'}
            </DialogDescription>
          </DialogHeader>
          <TextInput id="member-name" label="Name" autoFocus autoComplete="off" error={errors.name?.message} {...register('name')} />
          <TextInput id="member-email" label="Email" type="email" autoComplete="off" error={errors.email?.message} {...register('email')} />
          <div className="grid gap-1.5">
            <Label htmlFor="member-role">Role</Label>
            <Controller
              control={control}
              name="role"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="member-role" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLES.map((r) => (
                      <SelectItem key={r} value={r}>
                        {ROLE_LABEL[r]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>
          <TextInput
            id="member-location"
            label="Location (optional)"
            placeholder="e.g. Mumbai office"
            error={errors.location?.message}
            {...register('location')}
          />
          {!PROTOTYPE && (
            <TextInput
              id="member-password"
              label="Initial password"
              type="password"
              autoComplete="new-password"
              hint={PASSWORD_HINT}
              error={errors.password?.message}
              {...register('password')}
            />
          )}
          {formError && (
            <p role="alert" className="text-sm text-destructive">
              {formError}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => close(false)} disabled={add.isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={add.isPending}>
              Add member
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** Server mode: an admin sets a new password for someone (e.g. they forgot theirs); it signs them out everywhere. */
function SetPasswordDialog({ user, onClose }: { user: User | null; onClose: () => void }) {
  const form = useForm<{ password: string }>({ resolver: zodResolver(setPasswordSchema), defaultValues: { password: '' } })
  const { register, handleSubmit, reset, setError, formState } = form
  const close = () => {
    if (formState.isSubmitting) return
    reset()
    onClose()
  }
  const onSubmit = handleSubmit(async ({ password }) => {
    if (!user) return
    try {
      await setMemberPassword(user.id, password)
      toast.success(`New password set for ${user.name}`)
      close()
    } catch (err) {
      setError('password', { message: getErrorMessage(err) }, { shouldFocus: true })
    }
  })
  return (
    <Dialog open={!!user} onOpenChange={(next) => !next && close()}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <DialogHeader>
            <DialogTitle>Set a password for {user?.name}</DialogTitle>
            <DialogDescription>They’re signed out everywhere and sign in again with this password.</DialogDescription>
          </DialogHeader>
          <TextInput
            id="set-password"
            label="New password"
            type="password"
            autoFocus
            autoComplete="new-password"
            hint={PASSWORD_HINT}
            error={formState.errors.password?.message}
            {...register('password')}
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={close} disabled={formState.isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={formState.isSubmitting}>
              Set password
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function TeamSettings() {
  const team = useTeam()
  const { data: me } = useMe()
  const update = useUpdateMember()
  const [addOpen, setAddOpen] = useState(false)
  const [passwordFor, setPasswordFor] = useState<User | null>(null)

  const change = (user: User, body: TeamMemberUpdate, success: string) =>
    update.mutate(
      { id: user.id, body },
      {
        onSuccess: () => toast.success(success),
        onError: (err) => toast.error(`Couldn’t update ${user.name}`, { description: getErrorMessage(err) }),
      },
    )

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="space-y-1.5">
          <CardTitle className="text-base">Team & roles</CardTitle>
          <CardDescription>
            {PROTOTYPE
              ? 'Add people to try each role (switch from the account menu). '
              : 'Add people with an initial password; deactivating someone signs them out. '}
            You can’t change your own role or deactivate yourself, and there’s always at least one admin.
          </CardDescription>
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <UserPlus />
          Add member
        </Button>
      </CardHeader>
      <CardContent>
        {team.isPending ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : team.isError ? (
          <ErrorState title="Couldn’t load the team" error={team.error} onRetry={() => team.refetch()} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Member</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {team.data.items.map((user) => {
                const self = user.id === me?.id
                return (
                  <TableRow key={user.id} className={cn(!user.is_active && 'text-muted-foreground')}>
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <PersonAvatar name={user.name} />
                        <div>
                          <p className="font-medium">
                            {user.name} {self && <span className="text-xs font-normal text-muted-foreground">(you)</span>}
                          </p>
                          <p className="text-xs text-muted-foreground">{user.email}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Select
                        value={user.role}
                        disabled={self || !user.is_active || update.isPending}
                        onValueChange={(role) => change(user, { role: role as Role }, `${user.name} is now ${ROLE_LABEL[role as Role]}`)}
                      >
                        <SelectTrigger size="sm" className="w-36" aria-label={`Role for ${user.name}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ROLES.map((r) => (
                            <SelectItem key={r} value={r}>
                              {ROLE_LABEL[r]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <InlineTextField
                        label={`Location for ${user.name}`}
                        value={user.location ?? ''}
                        placeholder="Add location"
                        schema={memberLocationSchema}
                        onSave={(location) => update.mutateAsync({ id: user.id, body: { location } })}
                      />
                    </TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          'rounded-full px-2 py-0.5 text-xs font-medium',
                          user.is_active ? 'bg-green-50 text-green-700 dark:bg-green-400/10 dark:text-green-300' : 'bg-muted text-muted-foreground',
                        )}
                      >
                        {user.is_active ? 'Active' : 'Deactivated'}
                      </span>
                    </TableCell>
                    <TableCell className="space-x-1 text-right">
                      {!PROTOTYPE && user.is_active && (
                        <Button variant="ghost" size="sm" onClick={() => setPasswordFor(user)}>
                          Set password
                        </Button>
                      )}
                      {!self && (
                        <Button
                          variant={user.is_active ? 'ghost' : 'outline'}
                          size="sm"
                          disabled={update.isPending}
                          onClick={() =>
                            change(user, { is_active: !user.is_active }, user.is_active ? `${user.name} deactivated` : `${user.name} reactivated`)
                          }
                        >
                          {user.is_active ? 'Deactivate' : 'Reactivate'}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
      <AddMemberDialog open={addOpen} onOpenChange={setAddOpen} />
      <SetPasswordDialog user={passwordFor} onClose={() => setPasswordFor(null)} />
    </Card>
  )
}
