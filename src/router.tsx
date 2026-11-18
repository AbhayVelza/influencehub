import { createBrowserRouter } from 'react-router-dom'
import { AppShell } from '@/components/layout/app-shell'
import { RequirePermission } from '@/components/common/require-permission'
import {
  CallsPage,
  DashboardPage,
  DocumentsPage,
  DuplicatesPage,
  InfluencerDetailPage,
  InfluencersPage,
  NotFoundPage,
  OnboardedPage,
  OnboardedPlatformPage,
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
      { path: 'influencers', element: <RequirePermission permission="influencer:view"><InfluencersPage /></RequirePermission> },
      { path: 'influencers/:id', element: <InfluencerDetailPage /> },
      { path: 'pool', element: <RequirePermission permission="crm:access"><PoolPage /></RequirePermission> },
      {
        path: 'duplicates',
        element: (
          <RequirePermission permission="influencer:merge">
            <DuplicatesPage />
          </RequirePermission>
        ),
      },
      {
        path: 'onboarded',
        children: [
          {
            index: true,
            element: (
              <RequirePermission permission="influencer:view">
                <OnboardedPage />
              </RequirePermission>
            ),
          },
          {
            path: ':platform',
            element: (
              <RequirePermission permission="influencer:view">
                <OnboardedPlatformPage />
              </RequirePermission>
            ),
          },
        ],
      },
      { path: 'pipeline', element: <RequirePermission permission="crm:access"><PipelinePage /></RequirePermission> },
      { path: 'calls', element: <RequirePermission permission="crm:access"><CallsPage /></RequirePermission> },
      { path: 'packages', element: <RequirePermission permission="crm:access"><PackagesPage /></RequirePermission> },
      { path: 'documents', element: <RequirePermission permission="crm:access"><DocumentsPage /></RequirePermission> },
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
