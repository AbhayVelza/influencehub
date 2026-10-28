import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { ErrorState } from '@/components/common/states'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useCategories } from '@/hooks/use-categories'
import { formatNumber } from '@/lib/format'
import { fieldSchemas, validateField } from '@/lib/schemas'
import { cn } from '@/lib/utils'
import { getErrorMessage } from '@/services'
import type { Category } from '@/types'
import { useCreateCategory, useDeleteCategory, useUpdateCategory } from './queries'

function RenameDialog({ category, onClose }: { category: Category | null; onClose: () => void }) {
  const update = useUpdateCategory()
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [shownFor, setShownFor] = useState<Category | null>(null)
  if (category !== shownFor) {
    setShownFor(category)
    setName(category?.name ?? '')
    setError(null)
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!category) return
    const result = validateField(fieldSchemas.category, name)
    if (!result.ok) return setError(result.error)
    update.mutate(
      { id: category.id, body: { name: result.value } },
      {
        onSuccess: () => {
          toast.success(`Renamed to ${result.value}`)
          onClose()
        },
        onError: (err) => setError(getErrorMessage(err)),
      },
    )
  }

  return (
    <Dialog open={category !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <form onSubmit={submit} className="space-y-4" noValidate>
          <DialogHeader>
            <DialogTitle>Rename category</DialogTitle>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="category-name">Name</Label>
            <Input id="category-name" value={name} autoFocus aria-invalid={!!error} onChange={(e) => setName(e.target.value)} />
            {error && <p className="text-xs text-destructive">{error}</p>}
            <p className="text-xs text-muted-foreground">Influencers in this category move with it.</p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={update.isPending}>
              Rename
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function CategorySettings() {
  const categories = useCategories()
  const create = useCreateCategory()
  const update = useUpdateCategory()
  const remove = useDeleteCategory()
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<Category | null>(null)
  const [deleting, setDeleting] = useState<Category | null>(null)

  const add = (event: FormEvent) => {
    event.preventDefault()
    const result = validateField(fieldSchemas.category, name)
    if (!result.ok) return setError(result.error)
    create.mutate(result.value, {
      onSuccess: () => {
        toast.success(`Added ${result.value}`)
        setName('')
        setError(null)
      },
      onError: (err) => setError(getErrorMessage(err)),
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Categories</CardTitle>
        <CardDescription>Inactive categories stay on existing influencers but can’t be picked for new ones.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={add} className="flex items-start gap-2" noValidate aria-label="Add category">
          <div className="grid gap-1">
            <Input
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                setError(null)
              }}
              placeholder="New category"
              aria-label="New category name"
              aria-invalid={!!error}
              className="w-64"
            />
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>
          <Button type="submit" variant="outline" disabled={create.isPending}>
            <Plus />
            Add
          </Button>
        </form>

        {categories.isPending ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        ) : categories.isError ? (
          <ErrorState title="Couldn’t load categories" error={categories.error} onRetry={() => categories.refetch()} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="text-right">Influencers</TableHead>
                <TableHead>Active</TableHead>
                <TableHead className="text-right">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {categories.data.items.map((c) => (
                <TableRow key={c.id} className={cn(!c.is_active && 'text-muted-foreground')}>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatNumber(c.influencer_count)}</TableCell>
                  <TableCell>
                    <Switch
                      checked={c.is_active}
                      aria-label={`${c.name} active`}
                      disabled={update.isPending}
                      onCheckedChange={(is_active) =>
                        update.mutate(
                          { id: c.id, body: { is_active } },
                          {
                            onSuccess: () => toast.success(`${c.name} ${is_active ? 'activated' : 'deactivated'}`),
                            onError: (err) => toast.error('Couldn’t update the category', { description: getErrorMessage(err) }),
                          },
                        )
                      }
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon-sm" aria-label={`Rename ${c.name}`} onClick={() => setRenaming(c)}>
                      <Pencil />
                    </Button>
                    {c.influencer_count > 0 ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span tabIndex={0} aria-label={`Can’t delete ${c.name}: in use`}>
                            <Button variant="ghost" size="icon-sm" disabled aria-hidden>
                              <Trash2 />
                            </Button>
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>In use by {formatNumber(c.influencer_count)} influencers — deactivate it instead</TooltipContent>
                      </Tooltip>
                    ) : (
                      <Button variant="ghost" size="icon-sm" aria-label={`Delete ${c.name}`} onClick={() => setDeleting(c)}>
                        <Trash2 />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <RenameDialog category={renaming} onClose={() => setRenaming(null)} />
      <AlertDialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleting?.name}?</AlertDialogTitle>
            <AlertDialogDescription>No influencers use it. This can’t be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() =>
                deleting &&
                remove.mutate(deleting.id, {
                  onSuccess: () => toast.success(`Deleted ${deleting.name}`),
                  onError: (err) => toast.error('Couldn’t delete', { description: getErrorMessage(err) }),
                })
              }
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}
