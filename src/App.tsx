import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from 'react-router-dom'
import { AuthSetupError } from '@/components/common/auth-setup-error'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useAuthInitError } from '@/lib/auth'
import { queryClient } from '@/lib/query'
import { useSessionKey } from '@/lib/session'
import { ThemeProvider } from '@/providers/theme-provider'
import { router } from '@/router'

export function App() {
  const session = useSessionKey()
  const authError = useAuthInitError()
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider delayDuration={300}>
          {authError ? <AuthSetupError error={authError} /> : <RouterProvider key={session} router={router} />}
          <Toaster position="bottom-right" richColors closeButton />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  )
}
