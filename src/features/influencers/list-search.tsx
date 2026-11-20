import { Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

interface ListSearchProps {
  value: string | undefined
  onChange: (value: string | undefined) => void
  placeholder?: string
  label?: string
  className?: string
}

/** Debounced search bound to the URL `q`. Marked as the page search so "/" focuses it here. */
export function ListSearch({
  value,
  onChange,
  placeholder = 'Search name, handle, email, phone…',
  label = 'Search influencers in this list',
  className = 'max-w-md',
}: ListSearchProps) {
  const [text, setText] = useState(value ?? '')
  const [synced, setSynced] = useState(value)

  // Follow external URL changes (global search, chips, saved views) without clobbering in-progress typing.
  if (value !== synced) {
    setSynced(value)
    if ((value ?? '') !== text.trim()) setText(value ?? '')
  }

  useEffect(() => {
    const next = text.trim() || undefined
    if (next === value) return
    const timer = setTimeout(() => onChange(next), 300)
    return () => clearTimeout(timer)
  }, [text, value, onChange])

  return (
    <div className={cn('group relative w-full', className)}>
      <Search
        className="pointer-events-none absolute top-1/2 left-3.5 size-[18px] -translate-y-1/2 text-outline transition-colors group-focus-within:text-on-tertiary-container"
        strokeWidth={1.75}
      />
      <Input
        data-page-search
        type="search"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && e.currentTarget.blur()}
        placeholder={placeholder}
        aria-label={label}
        className="h-9 rounded-full bg-surface-container-lowest/70 py-2 pr-4 pl-10 text-body-sm text-on-surface shadow-sm shadow-black/5 backdrop-blur-md transition-all duration-150 placeholder:text-muted-foreground/60 hover:bg-surface-container-lowest focus-visible:bg-surface-container-lowest md:text-body-sm dark:bg-surface-container-high/70"
      />
    </div>
  )
}
