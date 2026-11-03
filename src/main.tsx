import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from '@/App'
import { initAuth } from '@/lib/auth'
import './index.css'

// Restore the signed-in session before the first render, so a signed-in user isn't bounced to /login.
// A failure (e.g. Firebase config missing) is shown by the app (useAuthInitError), not thrown here.
initAuth().finally(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})
