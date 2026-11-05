import { KeyRound, LogOut, Monitor, Moon, RotateCcw, Sun } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { PersonAvatar } from '@/components/common/person-avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ChangePasswordDialog } from '@/features/account/change-password-dialog'
import { useMe } from '@/hooks/use-me'
import { useTheme } from '@/hooks/use-theme'
import { useTeam } from '@/hooks/use-team'
import { signOut, switchUser } from '@/lib/auth'
import { PROTOTYPE } from '@/lib/mode'
import { ROLE_LABEL } from '@/lib/constants'
import type { Theme } from '@/providers/theme-context'
import { getErrorMessage } from '@/services'

const THEMES: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
]

/** Signing out resets the session (src/lib/auth); the route guard then sends the user to /login?next=<this page>. */
async function handleSignOut() {
  try {
    await signOut()
  } catch (err) {
    toast.error('Couldn’t sign out', { description: getErrorMessage(err) })
  }
}

/** Prototype mode: wipes this browser's workspace and starts again with just the owner admin. */
async function resetPrototype() {
  if (!window.confirm('Delete all prototype data in this browser (influencers, calls, documents, team) and start again?')) return
  const { resetPrototypeData } = await import('@/backend')
  await resetPrototypeData()
  window.location.assign('/')
}

/** Prototype mode has no sign-in: pick which team member you act as, to try each role. */
function ActingAs({ meId }: { meId: string }) {
  const team = useTeam()
  const active = (team.data?.items ?? []).filter((u) => u.is_active)
  return (
    <>
      <DropdownMenuLabel className="text-xs text-muted-foreground">Acting as (prototype)</DropdownMenuLabel>
      <DropdownMenuRadioGroup
        value={meId}
        onValueChange={(id) => {
          switchUser(id)
          const next = active.find((u) => u.id === id)
          if (next) toast.info(`Acting as ${next.name} (${ROLE_LABEL[next.role]})`)
        }}
      >
        {active.map((u) => (
          <DropdownMenuRadioItem key={u.id} value={u.id}>
            <span className="truncate">
              {u.name} · {ROLE_LABEL[u.role]}
            </span>
          </DropdownMenuRadioItem>
        ))}
      </DropdownMenuRadioGroup>
      <DropdownMenuSeparator />
      <DropdownMenuItem onSelect={() => void resetPrototype()}>
        <RotateCcw />
        Reset prototype data
      </DropdownMenuItem>
    </>
  )
}

export function UserMenu() {
  const { data: me } = useMe()
  const { theme, setTheme } = useTheme()
  const [changingPassword, setChangingPassword] = useState(false)
  if (!me) return null

  return (
    <>
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
          <DropdownMenuSeparator />
          {PROTOTYPE ? (
            <ActingAs meId={me.id} />
          ) : (
            <>
              <DropdownMenuItem onSelect={() => setChangingPassword(true)}>
                <KeyRound />
                Change password
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void handleSignOut()}>
                <LogOut />
                Sign out
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <ChangePasswordDialog open={changingPassword} onOpenChange={setChangingPassword} />
    </>
  )
}
