import { TooltipProvider } from '@/components/ui/tooltip'
import { AppLayout } from '@/components/layout/AppLayout'
import { ErrorBoundary } from '@/components/ErrorBoundary'

export default function App() {
  return (
    <ErrorBoundary>
      <TooltipProvider delayDuration={200}>
        <AppLayout />
      </TooltipProvider>
    </ErrorBoundary>
  )
}