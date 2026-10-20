import markUrl from '@/assets/fluxora-mark.svg'

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