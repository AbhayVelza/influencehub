import { Hammer } from 'lucide-react'
import type { ReactNode } from 'react'
import { PageHeader } from '@/components/common/page-header'
import { EmptyState } from '@/components/common/states'
import { Card } from '@/components/ui/card'

interface PlaceholderPageProps {
  title: string
  phase: number
  children?: ReactNode
}

/** Stand-in for screens that are built in later phases. */
export function PlaceholderPage({ title, phase, children }: PlaceholderPageProps) {
  return (
    <div className="space-y-6 p-6">
      <PageHeader title={title} />
      <Card>
        <EmptyState icon={Hammer} title={`${title} is built in Phase ${phase}`} description={children} />
      </Card>
    </div>
  )
}
