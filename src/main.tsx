import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from '@/App'
import './index.css'

async function enableMocking() {
  // VITE_USE_MOCKS is a build-time literal (vite.config define). Checked inline, not via USE_MOCKS from
  // lib/env, so the bundler folds it here: without mocks the dynamic import below, MSW and the fixtures
  // are left out of the production bundle.
  if (import.meta.env.VITE_USE_MOCKS !== 'true') return
  const { startMockApi } = await import('@/mocks/browser')
  await startMockApi()
}

enableMocking()
  // If the mock worker can't start (e.g. service workers blocked), still render; API calls will show errors.
  .catch((err: unknown) => console.error('Mock API failed to start', err))
  .finally(() => {
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <App />
      </StrictMode>,
    )
  })
