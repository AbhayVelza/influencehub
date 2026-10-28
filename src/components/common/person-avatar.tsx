import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { initials } from '@/lib/format'
import { cn } from '@/lib/utils'

interface PersonAvatarProps {
  name: string
  src?: string | null
  className?: string
  'aria-hidden'?: boolean
}

export function PersonAvatar({ name, src, className, 'aria-hidden': ariaHidden }: PersonAvatarProps) {
  return (
    <Avatar className={cn('size-8', className)} aria-hidden={ariaHidden}>
      {src && <AvatarImage src={src} alt="" referrerPolicy="no-referrer" />}
      <AvatarFallback className="text-xs font-medium text-secondary-foreground">{initials(name)}</AvatarFallback>
    </Avatar>
  )
}
