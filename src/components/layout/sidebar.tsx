import type { LucideIcon } from 'lucide-react'
import {
  BadgeCheck,
  ChevronDown,
  Copy,
  Filter,
  Folder,
  Inbox,
  UserX,
  LayoutGrid,
  Menu,
  Package,
  PhoneCall,
  Settings,
  Users,
} from 'lucide-react'
import { useState, useSyncExternalStore, type MouseEvent, type ReactElement } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { PlatformIcon } from '@/components/common/platform-icon'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useDuplicatePairs } from '@/features/duplicates/queries'
import { useOnboardedCounts } from '@/features/onboarded/queries'
import { usePoolCount } from '@/features/pool/queries'
import { useDefaultMine, useFollowUps } from '@/hooks/use-follow-ups'
import { useCan } from '@/hooks/use-me'
import { formatCompact } from '@/lib/format'
import { PLATFORM_META, PLATFORMS } from '@/lib/platforms'
import { cn } from '@/lib/utils'

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  end?: boolean
  badge?: number
  /** Completes the badge's spoken text, e.g. "3 due today". */
  badgeLabel?: string
}

/** 1024–1279px: the sidebar is a compact icon rail (labels become screen-reader text, names show in tooltips). */
const RAIL_QUERY = '(min-width: 1024px) and (max-width: 1279.98px)'
function subscribeRail(onChange: () => void) {
  const mq = window.matchMedia(RAIL_QUERY)
  mq.addEventListener('change', onChange)
  return () => mq.removeEventListener('change', onChange)
}
function useIsRail() {
  return useSyncExternalStore(subscribeRail, () => window.matchMedia(RAIL_QUERY).matches, () => false)
}

/** In rail mode, names the icon-only link in a tooltip to its right. */
function RailTooltip({ label, children }: { label: string; children: ReactElement }) {
  const rail = useIsRail()
  if (!rail) return children
  return (
    <Tooltip>
      {/* A wrapper, not asChild on the link: Slot would merge into NavLink's className function and break it. */}
      <TooltipTrigger asChild>
        <span className="block">{children}</span>
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={10}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}

/** Nav item: 42px row, 14px label, 12px radius; hover = white glass lift; active = cyan tint + accent bar. */
const linkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-body-md font-medium transition-all duration-150 lg:max-xl:mx-auto lg:max-xl:size-11 lg:max-xl:justify-center lg:max-xl:p-0 lg:max-xl:hover:translate-x-0',
    isActive
      ? 'bg-tertiary-fixed/60 font-semibold text-primary shadow-sm ring-1 ring-on-tertiary-container/15 before:absolute before:top-2 before:bottom-2 before:left-0 before:w-[3px] before:rounded-full before:bg-on-tertiary-container dark:bg-tertiary-fixed/70'
      : 'text-on-surface-variant hover:translate-x-0.5 hover:bg-surface-container-lowest/90 hover:text-primary hover:shadow-[0_4px_14px_rgba(14,26,36,0.08)] dark:hover:bg-surface-container-high',
  )

function NavBadge({ value, label }: { value: number; label?: string }) {
  return (
    <span
      className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-on-primary tabular-nums lg:max-xl:absolute lg:max-xl:-top-0.5 lg:max-xl:-right-0.5 lg:max-xl:ml-0 lg:max-xl:h-4 lg:max-xl:min-w-4 lg:max-xl:px-1 lg:max-xl:text-[9px] lg:max-xl:ring-2 lg:max-xl:ring-surface-container-lowest"
      aria-label={`${value} ${label ?? ''}`.trim()}
    >
      {value > 99 ? '99+' : value}
    </span>
  )
}

function SidebarLink({ item }: { item: NavItem }) {
  const Icon = item.icon
  return (
    <RailTooltip label={item.label}>
      <NavLink to={item.to} end={item.end} className={linkClass}>
        {({ isActive }) => (
          <>
            <Icon className={cn('size-5 shrink-0 transition-colors group-hover:text-on-tertiary-container', isActive && 'text-on-tertiary-container')} strokeWidth={1.75} />
            <span className="truncate lg:max-xl:sr-only">{item.label}</span>
            {item.badge ? <NavBadge value={item.badge} label={item.badgeLabel} /> : null}
          </>
        )}
      </NavLink>
    </RailTooltip>
  )
}

/** One row per platform with its onboarded count (only mounted while the group is open). */
function OnboardedPlatformLinks() {
  const counts = useOnboardedCounts()
  return (
    <ul
      id="onboarded-platforms"
      aria-label="Onboarded by platform"
      className="mt-1 ml-6 space-y-1 border-l border-surface-container pl-3"
    >
      {PLATFORMS.map((platform, i) => {
        const total = counts[i]?.data
        return (
          <li key={platform}>
            <NavLink
              to={`/onboarded/${platform}`}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-label-md transition-all',
                  isActive
                    ? 'bg-surface-container-lowest/80 font-medium text-primary shadow-sm'
                    : 'text-on-surface-variant hover:translate-x-0.5 hover:bg-surface-container-lowest/90 hover:text-primary hover:shadow-sm dark:hover:bg-surface-container-high',
                )
              }
            >
              <PlatformIcon platform={platform} className="size-5 rounded-[6px]" />
              <span className="truncate">{PLATFORM_META[platform].label}</span>
              {total !== undefined && (
                <span className="ml-auto font-code text-[10px] text-outline tabular-nums">{formatCompact(total)}</span>
              )}
            </NavLink>
          </li>
        )
      })}
    </ul>
  )
}

/** "Onboarded" opens its overview; the chevron shows or hides one link per platform. Open while on its pages. */
function OnboardedGroup() {
  const { pathname } = useLocation()
  const inside = pathname === '/onboarded' || pathname.startsWith('/onboarded/')
  const [open, setOpen] = useState(inside)
  // Arriving from elsewhere (a link, the back button) opens the group.
  const [wasInside, setWasInside] = useState(inside)
  if (inside !== wasInside) {
    setWasInside(inside)
    if (inside) setOpen(true)
  }

  return (
    <div>
      <div className="relative">
        <RailTooltip label="Onboarded">
          <NavLink to="/onboarded" end className={(state) => cn(linkClass(state), 'max-lg:pr-9 xl:pr-9')}>
            {({ isActive }) => (
              <>
                <BadgeCheck className={cn('size-5 shrink-0 transition-colors group-hover:text-on-tertiary-container', isActive && 'text-on-tertiary-container')} strokeWidth={1.75} />
                <span className="truncate lg:max-xl:sr-only">Onboarded</span>
              </>
            )}
          </NavLink>
        </RailTooltip>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls="onboarded-platforms"
          aria-label={open ? 'Hide onboarded platforms' : 'Show onboarded platforms'}
          className="absolute top-1/2 right-1 flex size-8 -translate-y-1/2 items-center justify-center rounded-lg text-outline hover:bg-surface-container-lowest hover:text-primary hover:shadow-sm lg:max-xl:hidden"
        >
          <ChevronDown className={cn('size-4 transition-transform', open && 'rotate-180')} />
        </button>
      </div>
      {/* The per-platform list is reachable from the Onboarded overview while the rail is collapsed. */}
      {open && (
        <div className="lg:max-xl:hidden">
          <OnboardedPlatformLinks />
        </div>
      )}
    </div>
  )
}

/** Logo + navigation; shared by the desktop sidebar and the mobile menu. */
function SidebarBody({ onNavigate }: { onNavigate?: () => void }) {
  const canSeeSettings = useCan('integrations:manage')
  const { data: dueToday } = useFollowUps('today', 1, 25, useDefaultMine())
  const poolCount = usePoolCount()
  const canMerge = useCan('influencer:merge')
  const duplicates = useDuplicatePairs()
  const canView = useCan('influencer:view')
  // Brand Specialists get the Dashboard, Influencers (onboarded creators only) and the Onboarded tabs.
  const crm = useCan('crm:access')

  const dashboard: NavItem = { to: '/', label: 'Dashboard', icon: LayoutGrid, end: true }
  const influencers: NavItem = { to: '/influencers', label: 'Influencers', icon: Users }
  const items: NavItem[] = !crm ? [dashboard, influencers] : [
    dashboard,
    influencers,
    { to: '/pool', label: 'Unassigned Pool', icon: Inbox, badge: poolCount, badgeLabel: 'unassigned' },
    ...(canMerge
      ? [{ to: '/duplicates', label: 'Possible duplicates', icon: Copy, badge: duplicates.data?.total, badgeLabel: 'to review' }]
      : []),
    { to: '/pipeline', label: 'Pipeline', icon: Filter },
    { to: '/calls', label: 'Calls & Follow-ups', icon: PhoneCall, badge: dueToday?.total, badgeLabel: 'due today' },
    { to: '/packages', label: 'Welcome Kits', icon: Package },
    { to: '/documents', label: 'Documents', icon: Folder },
    { to: '/rejected', label: 'Rejected', icon: UserX },
  ]

  // Closes the mobile menu once a link is picked.
  const closeOnLink = (e: MouseEvent<HTMLElement>) => {
    if (onNavigate && (e.target as HTMLElement).closest('a')) onNavigate()
  }

  return (
    <>
      <div className="flex h-16 shrink-0 items-center gap-space-sm px-space-md lg:max-xl:justify-center lg:max-xl:px-0">
        <div className="flex size-9 items-center justify-center rounded-xl bg-primary text-headline-sm tracking-tight text-on-primary shadow-sm">
          IH
        </div>
        <div className="flex flex-col lg:max-xl:hidden">
          <span className="text-[18px] leading-6 font-semibold tracking-tight text-primary">InfluenceHub</span>
          <span className="text-label-sm tracking-widest text-muted-foreground uppercase">Platform</span>
        </div>
      </div>
      <nav aria-label="Main" className="flex min-h-0 flex-1 flex-col" onClick={closeOnLink}>
        <div className="flex-1 space-y-0.5 overflow-y-auto px-space-sm py-space-xs">
          {items.map((item) => (
            <SidebarLink key={item.to} item={item} />
          ))}
          {canView && <OnboardedGroup />}
        </div>
        {canSeeSettings && (
          <div className="bg-surface-container-lowest/40 px-space-sm py-space-sm">
            <div className="mb-space-xs h-px w-full bg-surface-container" />
            <SidebarLink item={{ to: '/settings', label: 'Settings', icon: Settings }} />
          </div>
        )}
      </nav>
    </>
  )
}

/** The fixed sidebar, from 1024px up. */
export function Sidebar() {
  return (
    <aside className="relative z-20 hidden w-64 shrink-0 flex-col transition-[width] duration-200 lg:max-xl:w-[76px] bg-surface-container-lowest/75 shadow-glass backdrop-blur-2xl lg:flex">
      <SidebarBody />
    </aside>
  )
}

/** Below 1024px the sidebar opens from a menu button in the top bar. */
export function MobileNav() {
  const [open, setOpen] = useState(false)
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="size-9 rounded-xl lg:hidden" aria-label="Open menu">
          <Menu />
        </Button>
      </SheetTrigger>
      <SheetContent
        side="left"
        className="w-64 gap-0 bg-surface-container-lowest/90 p-0 backdrop-blur-2xl sm:max-w-64"
      >
        <SheetTitle className="sr-only">Menu</SheetTitle>
        <SheetDescription className="sr-only">Main navigation</SheetDescription>
        <SidebarBody onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  )
}
