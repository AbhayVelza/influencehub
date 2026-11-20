import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from '@/App'
import { initAuth } from '@/lib/auth'
import { API_BASE } from '@/lib/env'
import { PROTOTYPE } from '@/lib/mode'
import './index.css'

// End-to-end tests (e2e/, dev server, prototype mode only): set up data through the same in-browser API the app uses.
if (import.meta.env.DEV && PROTOTYPE) {
  ;(window as unknown as { __ihApi: unknown }).__ihApi = async (method: string, path: string, body?: unknown) => {
    const { handleApiRequest } = await import('@/backend')
    const res = await handleApiRequest(
      new Request(new URL(`${API_BASE}${path}`, window.location.origin), {
        method,
        headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
    )
    const text = await res.text()
    return { status: res.status, body: text ? (JSON.parse(text) as unknown) : null }
  }
}

// Restore the session before the first render, so a signed-in user isn't bounced to /login.
void initAuth().finally(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})
