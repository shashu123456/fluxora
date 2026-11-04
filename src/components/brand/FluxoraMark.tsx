import markUrl from '@/assets/fluxora-mark.svg'
import { cn } from '@/lib/utils'

export function FluxoraMark({
  size = 24,
  tile: _tile,
  className,
}: {
  size?: number
  tile?: boolean
  className?: string
}) {
  return (
    <img
      src={markUrl}
      width={size}
      height={size}
      className={className}
      alt="Fluxora"
      draggable={false}
    />
  )
}

export function FluxoraLockup({
  size = 18,
  className,
  textClassName,
  subtitle,
}: {
  size?: number
  className?: string
  textClassName?: string
  subtitle?: string
}) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <FluxoraMark size={size} className="shrink-0" />
      <div className="min-w-0">
        <div className={cn('fx-wordmark select-none text-[13px] leading-none', textClassName)}>FLUXORA</div>
        {subtitle ? (
          <div className="mt-1 truncate text-[9px] uppercase tracking-[0.18em] text-muted-foreground/70">
            {subtitle}
          </div>
        ) : null}
      </div>
    </div>
  )
}
