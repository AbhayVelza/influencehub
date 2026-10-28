import { CALL_OUTCOME_META, PACKAGE_STATUS_META, STAGE_META } from '@/lib/constants'
import { formatCompact } from '@/lib/format'
import type { Activity, CallOutcome, PackageStatus, Stage, User } from '@/types'

const FIELD_LABELS: Record<string, string> = {
  instagram_handle: 'Instagram handle',
  onboarding_checklist: 'onboarding checklist',
  profile_url: 'profile link',
}

const stageLabel = (s: unknown) => STAGE_META[s as Stage]?.label ?? String(s)

/** One-line description of an activity entry. */
export function describeActivity(activity: Activity, team: Map<string, User>): { text: string; detail?: string } {
  const p = activity.payload
  const name = (id: unknown) => (typeof id === 'string' ? (team.get(id)?.name ?? 'someone') : 'nobody')
  switch (activity.type) {
    case 'created':
      return { text: `Added ${p.source === 'csv' ? 'from a CSV import' : p.source === 'instagram' ? 'from Instagram' : 'manually'}` }
    case 'updated': {
      const fields = Array.isArray(p.fields) ? (p.fields as string[]).map((f) => FIELD_LABELS[f] ?? f.replace(/_/g, ' ')) : []
      return { text: fields.length ? `Updated ${fields.join(', ')}` : 'Updated details' }
    }
    case 'stage_changed':
      return {
        text: `${p.override ? 'Override: moved' : 'Moved'} from ${stageLabel(p.from)} to ${stageLabel(p.to)}`,
        detail: typeof p.reason === 'string' ? p.reason : undefined,
      }
    case 'assigned':
      return { text: p.to ? `Assigned to ${name(p.to)}` : 'Unassigned' }
    case 'call_logged':
      return { text: `Logged a call · ${CALL_OUTCOME_META[p.outcome as CallOutcome]?.label ?? String(p.outcome)}` }
    case 'package_created':
      return { text: `Created a package${p.courier ? ` (${String(p.courier)})` : ''}` }
    case 'package_updated':
      return {
        text: p.status
          ? `Package marked ${PACKAGE_STATUS_META[p.status as PackageStatus]?.label.toLowerCase() ?? String(p.status)}`
          : 'Package details updated',
      }
    case 'ig_synced':
      return { text: `Synced from Instagram${typeof p.followers === 'number' ? ` · ${formatCompact(p.followers)} followers` : ''}` }
  }
}
