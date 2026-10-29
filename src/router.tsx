import { createBrowserRouter } from 'react-router-dom'
import { AppShell } from '@/components/layout/app-shell'
import { RequirePermission } from '@/components/common/require-permission'
import {
  CallsPage,
  DashboardPage,
  DuplicatesPage,
  InfluencerDetailPage,
  InfluencersPage,
  NotFoundPage,
  PackagesPage,
  PipelinePage,
  PoolPage,
  SettingsPage,
} from '@/pages/lazy'

export const router = createBrowserRouter([
  {
    element: <AppShell />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'influencers', element: <InfluencersPage /> },
      { path: 'influencers/:id', element: <InfluencerDetailPage /> },
      { path: 'pool', element: <PoolPage /> },
      {
        path: 'duplicates',
        element: (
          <RequirePermission permission="influencer:merge">
            <DuplicatesPage />
          </RequirePermission>
        ),
      },
      { path: 'pipeline', element: <PipelinePage /> },
      { path: 'calls', element: <CallsPage /> },
      { path: 'packages', element: <PackagesPage /> },
      {
        path: 'settings',
        element: (
          <RequirePermission permission="integrations:manage">
            <SettingsPage />
          </RequirePermission>
        ),
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])
