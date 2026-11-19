import type { Job } from '@/types'
import { db, nextId, noteChangedOnRead, nowIso } from './db'

export class JobFailure extends Error {
  readonly code: string
  constructor(code: string, message: string) {
    super(message)
    this.code = code
  }
}

interface LocalJob {
  id: string
  startedAt: number
  durationMs: number
  /** Runs once when the job finishes (it may wait, e.g. on a platform API). Throw JobFailure to fail the job. */
  run: () => unknown
  done: boolean
  staged: boolean
  result: unknown
  error: { code: string; message: string } | null
}

const jobs = new Map<string, LocalJob>()

const HOUR_MS = 60 * 60 * 1000

/**
 * Runs on its first poll (GET /jobs/{id}), inside that request (the API server runs it in the request that starts
 * it), so whatever it changes is saved with it, outcome included (`db.jobs`).
 */
export function createJob(run: () => unknown, durationMs = 0): string {
  // Forget jobs nobody polled for an hour, here and in the saved outcomes.
  const cutoff = Date.now() - HOUR_MS
  for (const [key, job] of jobs) if (job.startedAt < cutoff) jobs.delete(key)
  const cutoffIso = new Date(cutoff).toISOString()
  if (db.jobs.some((j) => j.created_at < cutoffIso)) db.jobs = db.jobs.filter((j) => j.created_at >= cutoffIso)
  const id = nextId('job')
  jobs.set(id, { id, startedAt: Date.now(), durationMs, run, done: false, staged: false, result: null, error: null })
  return id
}

export async function executeJob(id: string): Promise<void> {
  const job = jobs.get(id)
  if (!job || job.done || job.staged) return
  // A job may change data even when a read (GET /jobs/{id}) runs it.
  noteChangedOnRead()
  try {
    job.result = await job.run()
  } catch (err) {
    job.error =
      err instanceof JobFailure
        ? { code: err.code, message: err.message }
        : { code: 'internal_error', message: err instanceof Error ? err.message : 'Job failed' }
  }
  job.staged = true
  // Saved with the request; if the request fails, the store's revert drops it with everything else.
  db.jobs.push({
    id: job.id,
    status: job.error ? 'failed' : 'succeeded',
    result: job.error ? null : (job.result ?? null),
    error: job.error,
    created_at: nowIso(),
  })
}

export function commitJobs(): void {
  for (const job of jobs.values()) {
    if (job.staged) {
      job.done = true
      job.staged = false
      job.run = () => undefined
    }
  }
}

export function revertJobs(): void {
  for (const job of jobs.values()) {
    if (job.staged) {
      job.staged = false
      job.result = null
      job.error = null
    }
  }
}

export async function readJob(id: string): Promise<Job | null> {
  const job = jobs.get(id)
  if (!job) {
    // Started before a restart: only its saved outcome is left.
    const saved = db.jobs.find((j) => j.id === id)
    return saved ? { id: saved.id, status: saved.status, progress: 100, result: saved.result, error: saved.error } : null
  }
  const elapsed = Date.now() - job.startedAt

  if (!job.done && !job.staged && elapsed >= job.durationMs) {
    await executeJob(id)
  }

  if (job.done || job.staged) {
    return {
      id: job.id,
      status: job.error ? 'failed' : 'succeeded',
      progress: 100,
      result: job.error ? null : (job.result ?? null),
      error: job.error,
    }
  }
  return {
    id: job.id,
    status: elapsed < 400 ? 'queued' : 'running',
    progress: Math.min(95, Math.round((elapsed / job.durationMs) * 100)),
    result: null,
    error: null,
  }
}
