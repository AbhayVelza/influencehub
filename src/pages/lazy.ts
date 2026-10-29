import { lazy } from 'react'

// Each screen is code-split; the shell shows a skeleton while one loads.
export const DashboardPage = lazy(() => import('@/pages/dashboard-page'))
export const InfluencersPage = lazy(() => import('@/pages/influencers-page'))
export const InfluencerDetailPage = lazy(() => import('@/pages/influencer-detail-page'))
export const PoolPage = lazy(() => import('@/pages/pool-page'))
export const PipelinePage = lazy(() => import('@/pages/pipeline-page'))
export const CallsPage = lazy(() => import('@/pages/calls-page'))
export const PackagesPage = lazy(() => import('@/pages/packages-page'))
export const SettingsPage = lazy(() => import('@/pages/settings-page'))
export const NotFoundPage = lazy(() => import('@/pages/not-found-page'))
