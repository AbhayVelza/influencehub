import type { LucideIcon } from 'lucide-react'
import {
  BadgeCheck,
  ChevronRight,
  CopyCheck,
  FileText,
  Inbox,
  LayoutDashboard,
  Menu,
  Package,
  PhoneCall,
  Settings,
  SquareKanban,
  Users,
} from 'lucide-react'
import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { PlatformIcon } from '@/components/common/platform-icon'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { useDuplicatePairs } from '@/features/duplicates/queries'
import { usePoolCount } from '@/features/pool/queries'
import { useDefaultMine, useFollowUps } from '@/hooks/use-follow-ups'
import { useCan } from '@/hooks/use-me'
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

const linkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'group flex h-9 items-center gap-2.5 rounded-md px-2.5 text-sm font-medium text-sidebar-foreground/75 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
    isActive && 'bg-sidebar-accent text-sidebar-accent-foreground',
  )

function SidebarLink({ item }: { item: NavItem }) {
  const Icon = item.icon
  return (
    <NavLink
      to={item.to}
      end={item.end}
      className={linkClass}
    >
      <Icon className="size-4 shrink-0" />
      <span className="truncate">{item.label}</span>
      {item.badge ? (
        <span
          className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground tabular-nums"
          aria-label={`${item.badge} ${item.badgeLabel ?? ''}`.trim()}
        >
          {item.badge > 99 ? '99+' : item.badge}
        </span>
      ) : null}
    </NavLink>
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
        <NavLink to="/onboarded" end className={(state) => cn(linkClass(state), 'pr-9')}>
          <BadgeCheck className="size-4 shrink-0" />
          <span className="truncate">Onboarded</span>
        </NavLink>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls="onboarded-platforms"
          aria-label={open ? 'Hide onboarded platforms' : 'Show onboarded platforms'}
          className="absolute top-1/2 right-1 flex size-7 -translate-y-1/2 items-center justify-center rounded text-sidebar-foreground/60 hover:bg-sidebar-border hover:text-sidebar-accent-foreground"
        >
          <ChevronRight className={cn('size-4 transition-transform', open && 'rotate-90')} />
        </button>
      </div>
      {open && (
        <ul id="onboarded-platforms" aria-label="Onboarded by platform" className="mt-1 grid grid-cols-4 gap-1.5 px-2.5 pb-1">
          {PLATFORMS.map((platform) => (
            <li key={platform} className="flex justify-center">
              <NavLink
                to={`/onboarded/${platform}`}
                title={PLATFORM_META[platform].label}
                aria-label={PLATFORM_META[platform].label}
                className={({ isActive }) =>
                  cn(
                    'flex rounded-lg opacity-85 outline-offset-2 transition hover:scale-105 hover:opacity-100',
                    isActive && 'opacity-100 ring-2 ring-primary ring-offset-2 ring-offset-sidebar',
                  )
                }
              >
                <PlatformIcon platform={platform} />
              </NavLink>
            </li>
          ))}
        </ul>
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

  const dashboard: NavItem = { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true }
  const influencers: NavItem = { to: '/influencers', label: 'Influencers', icon: Users }
  const items: NavItem[] = !crm ? [dashboard, influencers] : [
    dashboard,
    influencers,
    { to: '/pool', label: 'Unassigned Pool', icon: Inbox, badge: poolCount, badgeLabel: 'unassigned' },
    ...(canMerge
      ? [{ to: '/duplicates', label: 'Possible duplicates', icon: CopyCheck, badge: duplicates.data?.total, badgeLabel: 'to review' }]
      : []),
    { to: '/pipeline', label: 'Pipeline', icon: SquareKanban },
    { to: '/calls', label: 'Calls & Follow-ups', icon: PhoneCall, badge: dueToday?.total, badgeLabel: 'due today' },
    { to: '/packages', label: 'Welcome Kits', icon: Package },
    { to: '/documents', label: 'Documents', icon: FileText },
  ]

  return (
    <>
      <div className="flex h-14 items-center gap-2 border-b border-sidebar-border px-4">
        <div className="flex size-7 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground">
          IH
        </div>
        <span className="font-heading font-semibold tracking-tight">InfluenceHub</span>
      </div>
      <nav
        aria-label="Main"
        className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2"
        // Closes the mobile menu once a link is picked.
        onClick={(e) => {
          if (onNavigate && (e.target as HTMLElement).closest('a')) onNavigate()
        }}
      >
        {items.map((item) => (
          <SidebarLink key={item.to} item={item} />
        ))}
        {canView && <OnboardedGroup />}
        {canSeeSettings && (
          <div className="mt-auto border-t border-sidebar-border pt-2">
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
    <aside className="hidden w-56 shrink-0 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
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
        <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open menu">
          <Menu />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-64 gap-0 bg-sidebar p-0 sm:max-w-64">
        <SheetTitle className="sr-only">Menu</SheetTitle>
        <SheetDescription className="sr-only">Main navigation</SheetDescription>
        <SidebarBody onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  )
}
