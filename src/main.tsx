import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from '@/App'
import { USE_MOCKS } from '@/lib/env'
import './index.css'

async function enableMocking() {
  if (!USE_MOCKS) return
  // Dynamic import keeps MSW and the fixtures out of the bundle when mocks are off.
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
