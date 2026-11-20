import { purgeDeletedDocuments } from '@/backend/documents'
import { runAutoRelease } from '@/backend/domain'
import { expireConnectLinks } from '@/backend/social'
import { deleteOrphanFiles } from './pg-store'

// The API server's scheduled rules, every 5 minutes, so they happen even when nobody is using the app: pool
// auto-release, connect-link expiry (both also run before every request, as in prototype mode), and the purge of
// documents deleted more than 30 days ago, with their files.

const EVERY_MS = 5 * 60_000

type InTurn = <T>(task: () => Promise<T>) => Promise<T>
type Save = () => Promise<void>

let timer: NodeJS.Timeout | null = null

export async function runScheduledRules(inTurn: InTurn, save: Save) {
  const changed = await inTurn(async () => {
    const n = runAutoRelease() + expireConnectLinks() + purgeDeletedDocuments()
    if (n > 0) await save()
    return n
  })
  const files = await deleteOrphanFiles()
  if (changed + files > 0) console.log(`Scheduler: ${changed} record change(s), ${files} file(s) removed`)
}

export function startScheduler(inTurn: InTurn, save: Save) {
  const tick = () => void runScheduledRules(inTurn, save).catch((err: unknown) => console.error('Scheduler failed', err))
  setTimeout(tick, 30_000).unref()
  timer = setInterval(tick, EVERY_MS)
  timer.unref()
}

export function stopScheduler() {
  if (timer) clearInterval(timer)
}
