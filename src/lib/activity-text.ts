import { CALL_OUTCOME_META, PACKAGE_STATUS_META, STAGE_META } from '@/lib/constants'
import { DOCUMENT_TYPE_META } from '@/lib/documents'
import { formatCompact } from '@/lib/format'
import { PLATFORM_META } from '@/lib/platforms'
import type { Activity, CallOutcome, DocumentType, PackageStatus, Platform, Stage, User } from '@/types'

const FIELD_LABELS: Record<string, string> = {
  instagram_handle: 'Instagram handle',
  onboarding_checklist: 'onboarding checklist',
  profile_url: 'profile link',
}

const stageLabel = (s: unknown) => STAGE_META[s as Stage]?.label ?? String(s)
const account = (p: Record<string, unknown>) => `${PLATFORM_META[p.platform as Platform]?.label ?? String(p.platform)} @${String(p.handle)}`

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
    case 'account_synced': {
      const audience = PLATFORM_META[p.platform as Platform]?.audienceLabel.toLowerCase() ?? 'followers'
      return { text: `Synced ${account(p)}${typeof p.audience === 'number' ? ` · ${formatCompact(p.audience)} ${audience}` : ''}` }
    }
    case 'account_added':
      return { text: `Added ${account(p)}` }
    case 'connect_link_sent':
      return { text: `Sent a connect link for ${account(p)}${typeof p.emailed_to === 'string' ? ` to ${p.emailed_to}` : ''}` }
    case 'merged':
      return {
        text: `Merged ${typeof p.merged_name === 'string' ? p.merged_name : 'a duplicate'} into this profile`,
        detail: typeof p.stage_to === 'string' ? `Stage moved from ${stageLabel(p.stage_from)} to ${stageLabel(p.stage_to)}` : undefined,
      }
    case 'claimed':
      return { text: 'Claimed from the Unassigned Pool' }
    case 'document_uploaded':
    case 'document_deleted': {
      const kind = DOCUMENT_TYPE_META[p.type as DocumentType]?.label.toLowerCase() ?? 'document'
      return {
        text: `${activity.type === 'document_uploaded' ? 'Uploaded' : 'Deleted'} ${/^[aeiou]/.test(kind) ? 'an' : 'a'} ${kind}`,
        detail: typeof p.title === 'string' ? p.title : undefined,
      }
    }
    case 'released':
      return {
        text: p.auto
          ? `Returned to the pool automatically${p.from ? ` from ${name(p.from)}` : ''}`
          : `Released to the pool${p.from && p.from !== activity.actor ? ` from ${name(p.from)}` : ''}`,
        detail: typeof p.reason === 'string' ? p.reason : undefined,
      }
  }
}
