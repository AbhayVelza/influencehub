import { Bookmark, Check, ChevronDown, Plus, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Skeleton } from '@/components/ui/skeleton'
import { useMe } from '@/hooks/use-me'
import { getErrorMessage } from '@/services'
import type { InfluencerFilters, InfluencerSort, SavedView } from '@/types'
import { hasActiveFilters, viewKey } from './list-params'
import { useCreateSavedView, useDeleteSavedView, useSavedViews } from './queries'

interface SavedViewsMenuProps {
  filters: InfluencerFilters
  sort: InfluencerSort | undefined
  onApply: (view: SavedView) => void
}

export function SavedViewsMenu({ filters, sort, onApply }: SavedViewsMenuProps) {
  const { data: me } = useMe()
  const views = useSavedViews()
  const createView = useCreateSavedView()
  const deleteView = useDeleteSavedView()
  const [open, setOpen] = useState(false)
  const [saveOpen, setSaveOpen] = useState(false)
  const [name, setName] = useState('')

  const currentKey = viewKey(filters, sort)
  const activeView = views.data?.items.find((v) => viewKey(v.filters, v.sort) === currentKey)
  const canDelete = (view: SavedView) => view.created_by === me?.id || me?.role !== 'executive'

  const openSave = () => {
    setName('')
    setOpen(false)
    setSaveOpen(true)
  }

  const onSave = async (event: FormEvent) => {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    try {
      await createView.mutateAsync({ name: trimmed, filters, sort: sort ?? null })
      toast.success(`Saved view “${trimmed}”`)
      setSaveOpen(false)
    } catch (err) {
      toast.error('Couldn’t save view', { description: getErrorMessage(err) })
    }
  }

  const onDelete = async (view: SavedView) => {
    try {
      await deleteView.mutateAsync(view.id)
      toast.success(`Deleted view “${view.name}”`)
    } catch (err) {
      toast.error('Couldn’t delete view', { description: getErrorMessage(err) })
    }
  }

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" className="max-w-60">
            <Bookmark />
            <span className="truncate">{activeView ? activeView.name : 'Saved views'}</span>
            <ChevronDown className="opacity-60" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72 p-1">
          {views.isLoading ? (
            <div className="space-y-1 p-2">
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-full" />
            </div>
          ) : views.isError ? (
            <p className="px-2 py-4 text-center text-sm text-muted-foreground">Couldn’t load saved views.</p>
          ) : views.data?.items.length === 0 ? (
            <p className="px-2 py-4 text-center text-sm text-muted-foreground">No saved views yet.</p>
          ) : (
            <ul className="max-h-72 overflow-y-auto">
              {views.data?.items.map((view) => (
                <li key={view.id} className="group flex items-center gap-1 rounded-md hover:bg-muted">
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left text-sm"
                    onClick={() => {
                      onApply(view)
                      setOpen(false)
                    }}
                  >
                    <Check className={view.id === activeView?.id ? 'size-4 shrink-0' : 'size-4 shrink-0 opacity-0'} />
                    <span className="truncate">{view.name}</span>
                  </button>
                  {canDelete(view) && (
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      className="mr-1 text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                      aria-label={`Delete view ${view.name}`}
                      disabled={deleteView.isPending}
                      onClick={() => onDelete(view)}
                    >
                      <Trash2 />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
          <div className="mt-1 border-t pt-1">
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start"
              disabled={!hasActiveFilters(filters) && !sort}
              onClick={openSave}
            >
              <Plus />
              Save current view…
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent className="sm:max-w-sm">
          <form onSubmit={onSave} className="space-y-4">
            <DialogHeader>
              <DialogTitle>Save view</DialogTitle>
              <DialogDescription>Saves the current filters and sort for the whole team.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-1.5">
              <Label htmlFor="view-name">Name</Label>
              <Input
                id="view-name"
                value={name}
                maxLength={60}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Pune fashion 100K+"
                autoFocus
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setSaveOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!name.trim() || createView.isPending}>
                Save view
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
