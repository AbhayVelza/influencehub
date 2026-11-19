import { SearchX } from 'lucide-react'
import { Link } from 'react-router-dom'
import { EmptyState } from '@/components/common/states'
import { Button } from '@/components/ui/button'

export default function NotFoundPage() {
  return (
    <div className="px-4 py-6 sm:px-6 lg:px-space-xl lg:py-space-lg">
      <div className="mx-auto max-w-2xl rounded-2xl bg-surface-container-lowest/70 shadow-glass backdrop-blur-2xl dark:ring-1 dark:ring-white/5">
        <EmptyState
          icon={SearchX}
          title="Page not found"
          description="The page you’re looking for doesn’t exist or was moved."
          action={
            <Button asChild>
              <Link to="/">Back to dashboard</Link>
            </Button>
          }
          className="py-24"
        />
      </div>
    </div>
  )
}
