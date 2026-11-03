import { Suspense } from 'react'
import { createBrowserRouter } from 'react-router-dom'
import { AppShell, LoginSkeleton } from '@/components/layout/app-shell'
import { RequireAuth } from '@/components/layout/require-auth'
import { RequirePermission } from '@/components/common/require-permission'
import {
  CallsPage,
  DashboardPage,
  DocumentsPage,
  DuplicatesPage,
  InfluencerDetailPage,
  InfluencersPage,
  LoginPage,
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
    path: 'login',
    element: (
      <Suspense fallback={<LoginSkeleton />}>
        <LoginPage />
      </Suspense>
    ),
  },
  {
    element: <RequireAuth />,
    children: [
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
          { path: 'pipeline', element: <PipelinePage /> },
          { path: 'calls', element: <CallsPage /> },
          { path: 'packages', element: <PackagesPage /> },
          { path: 'documents', element: <DocumentsPage /> },
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
    ],
  },
])
