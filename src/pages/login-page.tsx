import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Navigate, useSearchParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AuthError, signIn, useAuthUser } from '@/lib/auth'
import { loginSchema, type LoginInput } from '@/lib/schemas'

/** Only same-app paths: "/x" but never "//host" or "/\host", which browsers treat as another site. */
function safeNextPath(next: string | null): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return '/'
  return next
}

/**
 * Email + password sign-in. There's no sign-up: admins add people in Settings > Team. Once signed in, the auth
 * module resets the session and this page redirects to `?next=` (where the route guard sent the user from).
 */
export default function LoginPage() {
  const user = useAuthUser()
  const [params] = useSearchParams()
  const next = safeNextPath(params.get('next'))
  const [error, setError] = useState<string | null>(null)
  const form = useForm<LoginInput, unknown, ReturnType<typeof loginSchema.parse>>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  })
  const { register, handleSubmit, formState } = form
  const { errors, isSubmitting } = formState

  const onSubmit = handleSubmit(async ({ email, password }) => {
    setError(null)
    try {
      await signIn(email, password)
      // The redirect happens on the next render, once useAuthUser reports the user.
    } catch (err) {
      setError(err instanceof AuthError ? err.message : 'Couldn’t sign in. Try again.')
    }
  })

  if (user) return <Navigate to={next} replace />

  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/40 p-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex items-center justify-center gap-2">
          <div
            aria-hidden
            className="flex size-8 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground"
          >
            IH
          </div>
          <span className="font-heading text-lg font-semibold tracking-tight">InfluenceHub</span>
        </div>
        <Card className="[--card-spacing:--spacing(6)]">
          <CardHeader>
            <h1 className="font-heading text-xl font-semibold tracking-tight">Sign in to InfluenceHub</h1>
            <CardDescription>Use the email and password your admin gave you.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="space-y-4" noValidate>
              <div className="grid gap-1.5">
                <Label htmlFor="login-email">Email</Label>
                <Input
                  id="login-email"
                  type="email"
                  autoComplete="username"
                  inputMode="email"
                  autoFocus
                  aria-invalid={!!errors.email}
                  aria-describedby={errors.email ? 'login-email-error' : undefined}
                  {...register('email')}
                />
                {errors.email && (
                  <p id="login-email-error" className="text-xs text-destructive">
                    {errors.email.message}
                  </p>
                )}
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="login-password">Password</Label>
                <Input
                  id="login-password"
                  type="password"
                  autoComplete="current-password"
                  aria-invalid={!!errors.password}
                  aria-describedby={errors.password ? 'login-password-error' : undefined}
                  {...register('password')}
                />
                {errors.password && (
                  <p id="login-password-error" className="text-xs text-destructive">
                    {errors.password.message}
                  </p>
                )}
              </div>
              {error && (
                <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </p>
              )}
              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? 'Signing in…' : 'Sign in'}
              </Button>
            </form>
          </CardContent>
        </Card>
        <p className="text-center text-sm text-muted-foreground">No account? Ask an admin to add you.</p>
      </div>
    </main>
  )
}
