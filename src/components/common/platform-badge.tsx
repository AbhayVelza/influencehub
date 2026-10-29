import { PLATFORM_META } from '@/lib/platforms'
import { cn } from '@/lib/utils'
import type { AccountRef, Platform } from '@/types'

/** Small coloured mark for a platform ("IG", "YT", …), named for screen readers. */
export function PlatformMark({ platform, className }: { platform: Platform; className?: string }) {
  const meta = PLATFORM_META[platform]
  return (
    <span
      title={meta.label}
      className={cn(
        // relative: keeps the sr-only label inside the mark, so it can't escape a scroll container and widen the page.
        'relative inline-flex h-5 min-w-6 shrink-0 items-center justify-center rounded px-1 text-[10px] font-semibold ring-1 ring-inset',
        meta.badge,
        className,
      )}
    >
      <span aria-hidden>{meta.short}</span>
      <span className="sr-only">{meta.label}</span>
    </span>
  )
}

/** Every platform an influencer is on, de-duplicated, in a fixed order. */
export function PlatformMarks({ platforms }: { platforms: Platform[] }) {
  const unique = (Object.keys(PLATFORM_META) as Platform[]).filter((p) => platforms.includes(p))
  return (
    <span className="inline-flex flex-wrap gap-1">
      {unique.map((p) => (
        <PlatformMark key={p} platform={p} />
      ))}
    </span>
  )
}

/**
 * "IG @riyastyle", optionally linking to the profile. `block` lays it out as a full-width row that truncates, for
 * narrow containers (cards, table cells) whose width mustn't grow with a long handle.
 */
export function AccountLabel({
  account,
  link = false,
  block = false,
  className,
}: {
  account: AccountRef | null
  link?: boolean
  block?: boolean
  className?: string
}) {
  if (!account) return <span className="text-muted-foreground">—</span>
  const body = (
    <>
      <PlatformMark platform={account.platform} />
      <span className={cn('min-w-0 truncate', block && 'w-0 flex-1')}>@{account.handle}</span>
    </>
  )
  const layout = block ? 'flex w-full' : 'inline-flex'
  return link ? (
    <a
      href={account.profile_url}
      target="_blank"
      rel="noreferrer"
      className={cn(layout, 'min-w-0 items-center gap-1.5 hover:text-foreground hover:underline', className)}
    >
      {body}
    </a>
  ) : (
    <span className={cn(layout, 'min-w-0 items-center gap-1.5', className)}>{body}</span>
  )
}
