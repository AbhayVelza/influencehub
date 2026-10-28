import { zodResolver } from '@hookform/resolvers/zod'
import { UserPlus } from 'lucide-react'
import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { toast } from 'sonner'
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
import { ROLE_LABEL } from '@/lib/constants'
import { inviteSchema, type InviteInput } from '@/lib/schemas'
import { cn } from '@/lib/utils'
import { getErrorMessage } from '@/services'
import type { Role, User } from '@/types'
import { useInviteMember, useUpdateMember } from './queries'

const ROLES = Object.keys(ROLE_LABEL) as Role[]

function InviteDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const invite = useInviteMember()
  const form = useForm<InviteInput, unknown, ReturnType<typeof inviteSchema.parse>>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { email: '', role: 'executive', name: '' },
  })
  const { register, control, handleSubmit, reset, setError, formState } = form

  const onSubmit = handleSubmit(async (values) => {
    try {
      const user = await invite.mutateAsync({ email: values.email, role: values.role, name: values.name ?? undefined })
      toast.success(`Invited ${user.name} as ${ROLE_LABEL[user.role]}`)
      reset()
      onOpenChange(false)
    } catch (err) {
      setError('email', { message: getErrorMessage(err) })
    }
  })

  return (
    <Dialog open={open} onOpenChange={(next) => !invite.isPending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <DialogHeader>
            <DialogTitle>Invite a team member</DialogTitle>
            <DialogDescription>They’ll get access with the role you choose.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="invite-email">Email</Label>
            <Input id="invite-email" type="email" autoFocus aria-invalid={!!formState.errors.email} {...register('email')} />
            {formState.errors.email && <p className="text-xs text-destructive">{formState.errors.email.message}</p>}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="invite-role">Role</Label>
            <Controller
              control={control}
              name="role"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="invite-role" className="w-full">
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
          <div className="grid gap-1.5">
            <Label htmlFor="invite-name">
              Name <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Input id="invite-name" {...register('name')} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={invite.isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={invite.isPending}>
              Send invite
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
  const [inviteOpen, setInviteOpen] = useState(false)

  const change = (user: User, body: Partial<Pick<User, 'role' | 'is_active'>>, success: string) =>
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
          <CardDescription>You can’t change your own role or deactivate yourself, and there’s always at least one admin.</CardDescription>
        </div>
        <Button onClick={() => setInviteOpen(true)}>
          <UserPlus />
          Invite member
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
                      <span
                        className={cn(
                          'rounded-full px-2 py-0.5 text-xs font-medium',
                          user.is_active ? 'bg-green-50 text-green-700 dark:bg-green-400/10 dark:text-green-300' : 'bg-muted text-muted-foreground',
                        )}
                      >
                        {user.is_active ? 'Active' : 'Deactivated'}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
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
      <InviteDialog open={inviteOpen} onOpenChange={setInviteOpen} />
    </Card>
  )
}
