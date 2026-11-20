import { Search } from 'lucide-react'
import { useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
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
    <form role="search" onSubmit={onSubmit} className="relative flex w-full max-w-lg items-center">
      <Search className="pointer-events-none absolute left-3.5 size-[18px] text-on-surface-variant" />
      <input
        ref={inputRef}
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && e.currentTarget.blur()}
        placeholder="Search influencers..."
        aria-label="Search influencers"
        className="w-full rounded-xl bg-surface-container-high/80 py-2.5 pr-9 pl-10 text-body-md text-on-surface shadow-inner shadow-black/[0.03] ring-1 ring-black/[0.06] transition-all duration-150 outline-none placeholder:text-on-surface-variant/70 hover:bg-surface-container-highest/80 focus:bg-surface-container-lowest focus:ring-2 focus:ring-on-tertiary-container/60 dark:ring-white/10 [&::-webkit-search-cancel-button]:hidden"
      />
      <kbd className="pointer-events-none absolute right-3 hidden rounded bg-surface-container-lowest px-1.5 py-0.5 font-code text-[11px] text-muted-foreground shadow-sm ring-1 ring-black/5 sm:block">
        /
      </kbd>
    </form>
  )
}
