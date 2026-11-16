import { isEmailAddress } from '@/lib/schemas'
import { cn } from '@/lib/utils'

/** The Email field: a mailto link for a real address, plain text for a note like "managed by @iplixmedia". */
export function EmailValue({ value, className }: { value: string; className?: string }) {
  if (isEmailAddress(value)) {
    return (
      <a href={`mailto:${value}`} className={cn('hover:underline', className)} title={value}>
        {value}
      </a>
    )
  }
  return (
    <span className={className} title={value}>
      {value}
    </span>
  )
}
