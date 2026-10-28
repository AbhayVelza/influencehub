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
    <div className={cn('relative w-full', className)}>
      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        data-page-search
        type="search"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && e.currentTarget.blur()}
        placeholder={placeholder}
        aria-label={label}
        className="pl-8"
      />
    </div>
  )
}
