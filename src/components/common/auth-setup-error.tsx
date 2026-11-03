import { KeyRound } from 'lucide-react'
import type { AuthError } from '@/lib/auth'

/** Sign-in couldn't start (e.g. the Firebase config env vars are missing from this build). */
export function AuthSetupError({ error }: { error: AuthError }) {
  return (
    <main className="flex min-h-svh items-center justify-center bg-background p-6">
      <div role="alert" className="max-w-md text-center">
        <div className="mx-auto mb-3 flex size-10 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <KeyRound className="size-5" />
        </div>
        <h1 className="text-lg font-semibold">Sign-in isn’t available</h1>
        <p className="mt-1 text-sm text-muted-foreground">{error.message}</p>
        <p className="mt-3 text-sm text-muted-foreground">Ask an admin to check the app’s Firebase settings (see docs/auth.md).</p>
      </div>
    </main>
  )
}
