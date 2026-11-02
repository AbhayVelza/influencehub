import type { LucideIcon } from 'lucide-react'
import { CopyCheck, FileText, Inbox, LayoutDashboard, Package, PhoneCall, Settings, SquareKanban, Users } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { useDuplicatePairs } from '@/features/duplicates/queries'
import { usePoolCount } from '@/features/pool/queries'
import { useDefaultMine, useFollowUps } from '@/hooks/use-follow-ups'
import { useCan } from '@/hooks/use-me'
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

function SidebarLink({ item }: { item: NavItem }) {
  const Icon = item.icon
  return (
    <NavLink
      to={item.to}
      end={item.end}
      className={({ isActive }) =>
        cn(
          'group flex h-9 items-center gap-2.5 rounded-md px-2.5 text-sm font-medium text-sidebar-foreground/75 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
          isActive && 'bg-sidebar-accent text-sidebar-accent-foreground',
        )
      }
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

export function Sidebar() {
  const canSeeSettings = useCan('integrations:manage')
  const { data: dueToday } = useFollowUps('today', 1, 25, useDefaultMine())
  const poolCount = usePoolCount()
  const canMerge = useCan('influencer:merge')
  const duplicates = useDuplicatePairs()

  const items: NavItem[] = [
    { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: '/influencers', label: 'Influencers', icon: Users },
    { to: '/pool', label: 'Unassigned Pool', icon: Inbox, badge: poolCount, badgeLabel: 'unassigned' },
    ...(canMerge
      ? [{ to: '/duplicates', label: 'Possible duplicates', icon: CopyCheck, badge: duplicates.data?.total, badgeLabel: 'to review' }]
      : []),
    { to: '/pipeline', label: 'Pipeline', icon: SquareKanban },
    { to: '/calls', label: 'Calls & Follow-ups', icon: PhoneCall, badge: dueToday?.total, badgeLabel: 'due today' },
    { to: '/packages', label: 'Packages', icon: Package },
    { to: '/documents', label: 'Documents', icon: FileText },
  ]

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
      <div className="flex h-14 items-center gap-2 border-b border-sidebar-border px-4">
        <div className="flex size-7 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground">
          IH
        </div>
        <span className="font-heading font-semibold tracking-tight">InfluenceHub</span>
      </div>
      <nav aria-label="Main" className="flex flex-1 flex-col gap-0.5 p-2">
        {items.map((item) => (
          <SidebarLink key={item.to} item={item} />
        ))}
        {canSeeSettings && (
          <div className="mt-auto border-t border-sidebar-border pt-2">
            <SidebarLink item={{ to: '/settings', label: 'Settings', icon: Settings }} />
          </div>
        )}
      </nav>
    </aside>
  )
}
