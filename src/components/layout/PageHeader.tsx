import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  icon: Icon,
  className,
}: {
  eyebrow?: string
  title: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  icon?: LucideIcon
  className?: string
}) {
  return (
    <header className={cn('fx-page-header', className)}>
      <div className="fx-page-header-copy">
        {eyebrow ? <span className="fx-eyebrow">{eyebrow}</span> : null}
        <h1 className="fx-title flex items-center gap-2.5">
          {Icon ? (
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-fx-gold/15 bg-fx-gold/10 text-fx-gold">
              <Icon className="h-4 w-4" />
            </span>
          ) : null}
          <span className="min-w-0 truncate">{title}</span>
        </h1>
        {description ? <p className="fx-prose-lead max-w-2xl">{description}</p> : null}
      </div>
      {actions ? <div className="fx-page-actions">{actions}</div> : null}
    </header>
  )
}

export function PageShell({
  children,
  className,
  width = 'default',
}: {
  children: React.ReactNode
  className?: string
  width?: 'default' | 'wide' | 'narrow'
}) {
  return (
    <div className={cn('fx-page', className)}>
      <div
        className="fx-page-inner"
        style={
          width === 'wide'
            ? { maxWidth: '88rem' }
            : width === 'narrow'
              ? { maxWidth: '52rem' }
              : undefined
        }
      >
        {children}
      </div>
    </div>
  )
}
