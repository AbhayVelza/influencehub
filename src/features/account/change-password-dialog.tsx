import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AuthError, changePassword } from '@/lib/auth'
import { MIN_PASSWORD_LENGTH } from '@/lib/constants'
import { changePasswordSchema, type ChangePasswordInput } from '@/lib/schemas'

const FIELDS = [
  { name: 'currentPassword', label: 'Current password', autoComplete: 'current-password' },
  { name: 'newPassword', label: 'New password', autoComplete: 'new-password' },
  { name: 'confirmPassword', label: 'Confirm new password', autoComplete: 'new-password' },
] as const

/** Opened from the account menu: the signed-in user changes their own password (re-checked against the current one). */
export function ChangePasswordDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [formError, setFormError] = useState<string | null>(null)
  const form = useForm<ChangePasswordInput, unknown, ReturnType<typeof changePasswordSchema.parse>>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  })
  const { register, handleSubmit, reset, setError, formState } = form
  const { errors, isSubmitting } = formState

  const close = (next: boolean) => {
    if (isSubmitting) return
    if (!next) {
      reset()
      setFormError(null)
    }
    onOpenChange(next)
  }

  const onSubmit = handleSubmit(async ({ currentPassword, newPassword }) => {
    setFormError(null)
    try {
      await changePassword(currentPassword, newPassword)
      toast.success('Password changed')
      reset()
      onOpenChange(false)
    } catch (err) {
      const code = err instanceof AuthError ? err.code : null
      const message = err instanceof AuthError ? err.message : 'Couldn’t change your password. Try again.'
      if (code === 'wrong_password') setError('currentPassword', { message }, { shouldFocus: true })
      else if (code === 'weak_password') setError('newPassword', { message }, { shouldFocus: true })
      else setFormError(message)
    }
  })

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <DialogHeader>
            <DialogTitle>Change password</DialogTitle>
            <DialogDescription>Use at least {MIN_PASSWORD_LENGTH} characters.</DialogDescription>
          </DialogHeader>
          {FIELDS.map(({ name, label, autoComplete }, i) => {
            const id = `change-password-${name}`
            const error = errors[name]
            return (
              <div key={name} className="grid gap-1.5">
                <Label htmlFor={id}>{label}</Label>
                <Input
                  id={id}
                  type="password"
                  autoComplete={autoComplete}
                  autoFocus={i === 0}
                  aria-invalid={!!error}
                  aria-describedby={error ? `${id}-error` : undefined}
                  {...register(name)}
                />
                {error && (
                  <p id={`${id}-error`} className="text-xs text-destructive">
                    {error.message}
                  </p>
                )}
              </div>
            )
          })}
          {formError && (
            <p role="alert" className="text-sm text-destructive">
              {formError}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => close(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              Change password
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
