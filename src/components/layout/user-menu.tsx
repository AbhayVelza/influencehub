import { useQueryClient } from '@tanstack/react-query'
import { Monitor, Moon, Sun } from 'lucide-react'
import { toast } from 'sonner'
import { PersonAvatar } from '@/components/common/person-avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useMe } from '@/hooks/use-me'
import { useTheme } from '@/hooks/use-theme'
import { ROLE_LABEL } from '@/lib/constants'
import { USE_MOCKS } from '@/lib/env'
import { setMockRole } from '@/lib/mock-role'
import type { Theme } from '@/providers/theme-context'
import type { Role } from '@/types'

const ROLES = Object.keys(ROLE_LABEL) as Role[]

const THEMES: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
]

export function UserMenu() {
  const { data: me } = useMe()
  const { theme, setTheme } = useTheme()
  const queryClient = useQueryClient()
  if (!me) return null

  const viewAs = async (role: Role) => {
    setMockRole(role)
    // Refetch everything so /me, permission-gated UI and server-checked data all reflect the new role.
    await queryClient.invalidateQueries()
    toast.info(`Viewing as ${ROLE_LABEL[role]}`)
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {/* Named by hidden text rather than aria-label, so the visible initials don't conflict with the name. */}
        <Button variant="ghost" size="icon" className="rounded-full">
          <PersonAvatar name={me.name} aria-hidden />
          <span className="sr-only">Account menu</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="font-normal">
          <p className="truncate text-sm font-medium text-foreground">{me.name}</p>
          <p className="truncate text-xs text-muted-foreground">{me.email}</p>
          <p className="mt-1 text-xs text-muted-foreground">{ROLE_LABEL[me.role]}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs text-muted-foreground">Theme</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={theme} onValueChange={(v) => setTheme(v as Theme)}>
          {THEMES.map(({ value, label, icon: Icon }) => (
            <DropdownMenuRadioItem key={value} value={value}>
              <Icon />
              {label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        {USE_MOCKS && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs text-muted-foreground">View as (mock data only)</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={me.role} onValueChange={(v) => viewAs(v as Role)}>
              {ROLES.map((role) => (
                <DropdownMenuRadioItem key={role} value={role}>
                  {ROLE_LABEL[role]}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
