import { useState } from 'react'
import { toast } from 'sonner'
import { todayKey } from '@/lib/format'
import { downloadFile, waitForJob } from '@/lib/jobs'
import { exportsApi, getErrorMessage } from '@/services'
import type { ExportRequest, ExportResult } from '@/types'

/** Starts an export job, reports progress in a toast and downloads the CSV when ready. */
export function useExportInfluencers() {
  const [isExporting, setIsExporting] = useState(false)

  const exportInfluencers = async (body: ExportRequest) => {
    setIsExporting(true)
    const toastId = toast.loading('Preparing export…')
    try {
      const { job_id } = await exportsApi.influencers(body)
      const job = await waitForJob<ExportResult>(job_id, (j) =>
        toast.loading(`Preparing export… ${j.progress}%`, { id: toastId }),
      )
      if (job.status === 'failed' || !job.result) throw new Error(job.error?.message ?? 'Export failed')
      downloadFile(job.result.download_url, `influencers-${todayKey()}.csv`)
      toast.success(`Exported ${job.result.row_count} influencer${job.result.row_count === 1 ? '' : 's'}`, {
        id: toastId,
      })
    } catch (err) {
      toast.error('Export failed', { id: toastId, description: getErrorMessage(err) })
    } finally {
      setIsExporting(false)
    }
  }

  return { exportInfluencers, isExporting }
}
