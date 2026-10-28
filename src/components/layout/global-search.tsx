import { Search } from 'lucide-react'
import { useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Input } from '@/components/ui/input'
import { useHotkey } from '@/hooks/use-hotkey'

/** Searches influencers; submitting opens the list filtered by the query. "/" focuses it. */
export function GlobalSearch() {
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)
  const [value, setValue] = useState('')

  // A page with its own search box (marked data-page-search) takes "/" instead.
  useHotkey('/', () => (document.querySelector<HTMLInputElement>('[data-page-search]') ?? inputRef.current)?.focus())

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    const q = value.trim()
    navigate(q ? `/influencers?q=${encodeURIComponent(q)}` : '/influencers')
    inputRef.current?.blur()
  }

  return (
    <form role="search" onSubmit={onSubmit} className="relative w-full max-w-sm">
      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        ref={inputRef}
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && e.currentTarget.blur()}
        placeholder="Search influencers…"
        aria-label="Search influencers"
        className="pr-8 pl-8"
      />
      <kbd className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 rounded border bg-muted px-1.5 font-mono text-[11px] text-muted-foreground">
        /
      </kbd>
    </form>
  )
}
