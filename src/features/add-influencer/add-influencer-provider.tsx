import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useCan } from '@/hooks/use-me'
import { AddInfluencerContext, type AddTab, type ManualPrefill } from './context'
import { CsvTab } from './csv-tab'
import { InstagramTab } from './instagram-tab'
import { ManualTab } from './manual-tab'

interface DialogState {
  open: boolean
  tab: AddTab
  prefill?: ManualPrefill
  /** Bumped on every open so each tab starts fresh. */
  session: number
}

export function AddInfluencerProvider({ children }: { children: ReactNode }) {
  const canImport = useCan('data:import')
  const [state, setState] = useState<DialogState>({ open: false, tab: 'instagram', session: 0 })
  const [busy, setBusy] = useState(false)

  const open = useCallback(
    (options?: { tab?: AddTab; prefill?: ManualPrefill }) =>
      setState((s) => ({ open: true, tab: options?.tab ?? 'instagram', prefill: options?.prefill, session: s.session + 1 })),
    [],
  )
  const close = useCallback(() => setState((s) => ({ ...s, open: false })), [])
  const value = useMemo(() => ({ open }), [open])
  const tab = state.tab === 'csv' && !canImport ? 'instagram' : state.tab

  return (
    <AddInfluencerContext value={value}>
      {children}
      <Dialog open={state.open} onOpenChange={(next) => !next && !busy && close()}>
        <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-3xl" onEscapeKeyDown={(e) => busy && e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Add influencers</DialogTitle>
            <DialogDescription>Fetch from Instagram, enter details by hand, or import a CSV.</DialogDescription>
          </DialogHeader>
          <Tabs
            value={tab}
            onValueChange={(next) => !busy && setState((s) => ({ ...s, tab: next as AddTab }))}
            // min-w-0: the dialog is a grid; without it a wide CSV preview stretches the dialog past its edges.
            className="min-w-0 gap-4"
          >
            <TabsList>
              <TabsTrigger value="instagram">Fetch from Instagram</TabsTrigger>
              <TabsTrigger value="manual">Manual</TabsTrigger>
              {canImport && <TabsTrigger value="csv">CSV import</TabsTrigger>}
            </TabsList>
            <TabsContent value="instagram">
              <InstagramTab
                key={state.session}
                onDone={close}
                onManual={(prefill) => setState((s) => ({ ...s, tab: 'manual', prefill, session: s.session + 1 }))}
              />
            </TabsContent>
            <TabsContent value="manual">
              <ManualTab key={state.session} prefill={state.prefill} onDone={close} />
            </TabsContent>
            {canImport && (
              <TabsContent value="csv">
                <CsvTab key={state.session} onDone={close} onBusyChange={setBusy} />
              </TabsContent>
            )}
          </Tabs>
        </DialogContent>
      </Dialog>
    </AddInfluencerContext>
  )
}
