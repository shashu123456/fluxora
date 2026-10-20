import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { FluxoraMark } from '@/components/brand/FluxoraMark'

export function AboutDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [info, setInfo] = useState<any>(null)

  useEffect(() => {
    if (open) {
      window.api.system
        ?.getInfo?.()
        .then(setInfo)
        .catch(() => setInfo(null))
    }
  }, [open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md overflow-hidden">
        <DialogHeader className="sr-only">
          About Fluxora
        </DialogHeader>
        <div className="pointer-events-none absolute inset-0 -z-10 opacity-40">
          <div className="absolute -top-16 right-0 h-40 w-40 rounded-full bg-fx-gold/18 blur-3xl" />
          <div className="absolute -bottom-16 left-0 h-40 w-40 rounded-full bg-fx-champagne/16 blur-3xl" />
        </div>
        <div className="flex flex-col items-center gap-4 py-4 text-center">
          <div className="rounded-2xl bg-gradient-to-br from-[#161311] to-[#080705] p-5 shadow-[0_16px_44px_-16px_rgba(216,189,132,0.4)] ring-1 ring-white/5">
            <FluxoraMark className="h-16 w-16" />
          </div>
          <div>
            <div className="fx-wordmark text-2xl">
              FLUXORA
            </div>
            <div className="mt-1 text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
              AI Operating Workspace
            </div>
          </div>
          <div className="w-full divide-y divide-border/60 rounded-xl border border-border/60 bg-card/40 text-sm">
            <div className="flex items-center justify-between px-4 py-2.5">
              <span className="text-muted-foreground">Version</span>
              <span className="font-medium">{info?.versions?.app || info?.appVersion || '1.0.0'}</span>
            </div>
            <div className="flex items-center justify-between px-4 py-2.5">
              <span className="text-muted-foreground">Electron</span>
              <span className="font-medium">{info?.versions?.electron || info?.electronVersion || '—'}</span>
            </div>
            <div className="flex items-center justify-between px-4 py-2.5">
              <span className="text-muted-foreground">Data</span>
              <span className="max-w-[60%] truncate font-medium" title={info?.dataDir || ''}>
                {info?.dataDir || '—'}
              </span>
            </div>
          </div>
          <p className="max-w-xs text-xs leading-relaxed text-muted-foreground">
            Your local-first AI workspace for projects, memory, prompts and agents.
            Chats, keys and data stay on this machine.
          </p>
          <Button variant="outline" className="mt-1" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}