import { Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Input } from '@/components/ui/input'

interface ListSearchProps {
  value: string | undefined
  onChange: (value: string | undefined) => void
}

/** Debounced search bound to the URL `q`. Marked as the page search so "/" focuses it here. */
export function ListSearch({ value, onChange }: ListSearchProps) {
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
    <div className="relative w-full max-w-md">
      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        data-page-search
        type="search"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && e.currentTarget.blur()}
        placeholder="Search name, handle, email, phone…"
        aria-label="Search influencers in this list"
        className="pl-8"
      />
    </div>
  )
}
