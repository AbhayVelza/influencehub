import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { PersonAvatar } from '@/components/common/person-avatar'
import { formatHandle, primaryAccount } from '@/lib/platforms'
import { StageBadge } from '@/components/common/stage-badge'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { influencersApi } from '@/services'
import type { Influencer } from '@/types'

/** Search-as-you-type picker for "Create package" outside an influencer's page. */
export function InfluencerPicker({
  open,
  onOpenChange,
  onPick,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onPick: (influencer: Influencer) => void
}) {
  const [search, setSearch] = useState('')
  const q = useDebouncedValue(search.trim(), 250)
  const results = useQuery({
    queryKey: ['influencers', 'picker', q],
    queryFn: ({ signal }) => influencersApi.list({ q: q || undefined, page_size: 8, sort: q ? 'name' : '-updated_at' }, signal),
    enabled: open,
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0 sm:max-w-md" showCloseButton={false}>
        <DialogHeader className="px-4 pt-4">
          <DialogTitle>Create package for…</DialogTitle>
          <DialogDescription>Search by name or handle.</DialogDescription>
        </DialogHeader>
        <Command shouldFilter={false}>
          <CommandInput value={search} onValueChange={setSearch} placeholder="Search influencers…" autoFocus />
          <CommandList>
            {results.isPending ? (
              <div className="space-y-2 p-3">
                {Array.from({ length: 4 }, (_, i) => (
                  <Skeleton key={i} className="h-8 w-full" />
                ))}
              </div>
            ) : results.isError ? (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">Couldn’t search. Try again.</p>
            ) : (
              <>
                <CommandEmpty>No influencers match.</CommandEmpty>
                <CommandGroup>
                  {results.data.items.map((inf) => (
                    <CommandItem key={inf.id} value={inf.id} onSelect={() => onPick(inf)} className="[&>svg:last-child]:hidden">
                      <PersonAvatar name={inf.name} src={inf.profile_pic_url} className="size-7" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{inf.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">{formatHandle(primaryAccount(inf))}</span>
                      </span>
                      <StageBadge stage={inf.stage} />
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  )
}
