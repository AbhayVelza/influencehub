import type { Job } from '@/types'
import { nextId } from './db'

export class JobFailure extends Error {
  readonly code: string
  constructor(code: string, message: string) {
    super(message)
    this.code = code
  }
}

interface MockJob {
  id: string
  startedAt: number
  durationMs: number
  /** Runs once when the job finishes. Throw JobFailure to fail the job. */
  run: () => unknown
  done: boolean
  result: unknown
  error: { code: string; message: string } | null
}

const jobs = new Map<string, MockJob>()

export function createJob(run: () => unknown, durationMs = 3000 + Math.random() * 2000): string {
  const id = nextId('job')
  jobs.set(id, { id, startedAt: Date.now(), durationMs, run, done: false, result: null, error: null })
  return id
}

export function readJob(id: string): Job | null {
  const job = jobs.get(id)
  if (!job) return null
  const elapsed = Date.now() - job.startedAt

  if (!job.done && elapsed >= job.durationMs) {
    job.done = true
    try {
      job.result = job.run()
    } catch (err) {
      job.error =
        err instanceof JobFailure
          ? { code: err.code, message: err.message }
          : { code: 'internal_error', message: err instanceof Error ? err.message : 'Job failed' }
    }
  }

  if (job.done) {
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
