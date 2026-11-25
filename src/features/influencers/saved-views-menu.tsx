import { Bookmark, Check, ChevronDown, Pencil, Plus, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
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
import { countActiveFilters, hasActiveFilters, viewKey } from './list-params'
import { useCreateSavedView, useDeleteSavedView, useSavedViews, useUpdateSavedView } from './queries'

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
  const updateView = useUpdateSavedView()
  const [open, setOpen] = useState(false)
  const [saveOpen, setSaveOpen] = useState(false)
  const [name, setName] = useState('')
  const [editing, setEditing] = useState<SavedView | null>(null)
  const [editName, setEditName] = useState('')
  const [useCurrent, setUseCurrent] = useState(false)

  const currentKey = viewKey(filters, sort)
  const activeView = views.data?.items.find((v) => viewKey(v.filters, v.sort) === currentKey)
  /** Executives edit and delete only their own views; managers and admins any (the server checks the same). */
  const canManage = (view: SavedView) => view.created_by === me?.id || me?.role !== 'executive'
  const hasCurrent = hasActiveFilters(filters) || !!sort

  /** Edit: rename, and/or put the filters and sort on screen now into the view (ticked when they differ). */
  const openEdit = (view: SavedView) => {
    setEditing(view)
    setEditName(view.name)
    setUseCurrent(hasCurrent && viewKey(view.filters, view.sort) !== currentKey)
    setOpen(false)
  }

  const onEdit = async (event: FormEvent) => {
    event.preventDefault()
    const trimmed = editName.trim()
    if (!editing || !trimmed) return
    try {
      await updateView.mutateAsync({
        id: editing.id,
        body: { name: trimmed, ...(useCurrent ? { filters, sort: sort ?? null } : {}) },
      })
      toast.success(`Updated view “${trimmed}”`)
      setEditing(null)
    } catch (err) {
      toast.error('Couldn’t update view', { description: getErrorMessage(err) })
    }
  }

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
          <Button variant="outline" className="max-w-72 gap-1 px-3.5">
            <Bookmark className="size-[17px] text-muted-foreground" strokeWidth={1.75} />
            <span className="shrink-0">Saved views</span>
            {activeView && (
              <span className="ml-0.5 min-w-0 truncate rounded bg-secondary-fixed/50 px-1.5 py-px tabular-nums text-small font-medium text-muted-foreground">
                {activeView.name}
              </span>
            )}
            <ChevronDown className="size-4 text-outline" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72 p-1">
          {views.isLoading ? (
            <div className="space-y-1 p-2">
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-full" />
            </div>
          ) : views.isError ? (
            <p className="px-2 py-4 text-center text-small text-muted-foreground">Couldn’t load saved views.</p>
          ) : views.data?.items.length === 0 ? (
            <p className="px-2 py-4 text-center text-small text-muted-foreground">No saved views yet.</p>
          ) : (
            <ul className="max-h-72 overflow-y-auto">
              {views.data?.items.map((view) => (
                <li key={view.id} className="group flex items-center gap-1 rounded-xl hover:bg-surface-container-low">
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-2 px-2.5 py-2 text-left text-body"
                    onClick={() => {
                      onApply(view)
                      setOpen(false)
                    }}
                  >
                    <Check className={view.id === activeView?.id ? 'size-4 shrink-0' : 'size-4 shrink-0 opacity-0'} />
                    <span className="truncate">{view.name}</span>
                  </button>
                  {canManage(view) && (
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      className="text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                      aria-label={`Edit view ${view.name}`}
                      onClick={() => openEdit(view)}
                    >
                      <Pencil />
                    </Button>
                  )}
                  {canManage(view) && (
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
          <div className="mt-1 border-t border-surface-container pt-1">
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start"
              disabled={!hasCurrent}
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

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-sm">
          <form onSubmit={onEdit} className="space-y-4">
            <DialogHeader>
              <DialogTitle>Edit view</DialogTitle>
              <DialogDescription>Rename it, or save the filters and sort you have on screen now into it.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-1.5">
              <Label htmlFor="edit-view-name">Name</Label>
              <Input id="edit-view-name" value={editName} maxLength={60} onChange={(e) => setEditName(e.target.value)} autoFocus />
            </div>
            <div className="flex items-start gap-2">
              <Checkbox
                id="edit-view-filters"
                checked={useCurrent}
                disabled={!hasCurrent}
                onCheckedChange={(v) => setUseCurrent(v === true)}
                className="mt-0.5"
              />
              <Label htmlFor="edit-view-filters" className="grid gap-0.5 font-normal">
                <span>Use the current filters and sort</span>
                <span className="text-small text-muted-foreground">
                  {hasCurrent
                    ? `${countActiveFilters(filters)} filter${countActiveFilters(filters) === 1 ? '' : 's'}${sort ? ' + sort' : ''} on screen now`
                    : 'Set filters on the list first'}
                </span>
              </Label>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!editName.trim() || updateView.isPending}>
                Save changes
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
