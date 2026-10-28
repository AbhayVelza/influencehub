import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { initials } from '@/lib/format'
import { cn } from '@/lib/utils'

interface PersonAvatarProps {
  name: string
  src?: string | null
  className?: string
}

export function PersonAvatar({ name, src, className }: PersonAvatarProps) {
  return (
    <Avatar className={cn('size-8', className)}>
      {src && <AvatarImage src={src} alt="" referrerPolicy="no-referrer" />}
      <AvatarFallback className="text-xs font-medium">{initials(name)}</AvatarFallback>
    </Avatar>
  )
}
