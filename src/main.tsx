import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from '@/App'
import { initAuth } from '@/lib/auth'
import './index.css'

// Restore the session before the first render, so a signed-in user isn't bounced to /login.
void initAuth().finally(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})
