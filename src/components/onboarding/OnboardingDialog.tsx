import { useEffect, useMemo, useState } from 'react'
import { useProviderStore } from '@/stores/providerStore'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Loader2, CheckCircle2, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

const DISMISS_KEY = 'ai-workspace:onboarding-dismissed'

export function OnboardingDialog() {
  const providers = useProviderStore((s) => s.providers)
  const loadProviders = useProviderStore((s) => s.loadProviders)
  const updateProvider = useProviderStore((s) => s.updateProvider)
  const testConnection = useProviderStore((s) => s.testConnection)

  const [open, setOpen] = useState(false)
  const [keys, setKeys] = useState<Record<string, string>>({})
  const [results, setResults] = useState<Record<string, { ok: boolean; message: string }>>({})
  const [busy, setBusy] = useState<Record<string, boolean>>({})
  const [configured, setConfigured] = useState(false)

  const needsSetup = providers.length > 0 && !providers.some((p) => p.hasKey || p.apiKey)

  useEffect(() => {
    if (!configured && needsSetup && !localStorage.getItem(DISMISS_KEY)) {
      setOpen(true)
    }
  }, [configured, needsSetup])

  const switchableProviders = useMemo(() => {
    return providers.filter((p) => {
      const url = (p.baseUrl || '').toLowerCase()
      return !url.includes('localhost') && !url.includes('127.0.0.1')
    })
  }, [providers])

  const handleSave = async (id: string, key: string) => {
    const trimmed = key.trim()
    if (!trimmed) return
    setBusy((b) => ({ ...b, [id]: true }))
    try {
      await updateProvider(id, { apiKey: trimmed, enabled: true })
      const res: unknown = await testConnection(id)
      const ok = res === true || (res as any)?.ok === true
      if (ok) {
        setResults((r) => ({ ...r, [id]: { ok: true, message: 'Connected and ready to use' } }))
      } else {
        setResults((r) => ({ ...r, [id]: { ok: false, message: (res as any)?.error || 'Connection test failed' } }))
      }
      await loadProviders()
    } catch (e: any) {
      setResults((r) => ({ ...r, [id]: { ok: false, message: 'Saved, but connection test failed' } }))
      await loadProviders()
    } finally {
      setBusy((b) => ({ ...b, [id]: false }))
    }
  }

  const handleFinish = () => {
    const allConfigured = providers.every((p) => p.hasKey || p.apiKey)
    if (allConfigured) {
      setConfigured(true)
      setOpen(false)
    } else {
      localStorage.setItem(DISMISS_KEY, '1')
      setOpen(false)
    }
  }

  const allHaveKeys = providers.every((p) => p.hasKey || p.apiKey)

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleFinish() }}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Welcome to AI Workspace</DialogTitle>
          <DialogDescription>
            Connect a provider to start chatting. Your API key stays on this computer, encrypted at rest.
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[50vh] pr-3">
          <div className="space-y-3">
            {switchableProviders.length === 0 && (
              <p className="text-sm text-muted-foreground">No cloud providers found. You can still use the workspace tools.</p>
            )}
            {switchableProviders.map((p) => {
              const result = results[p.id]
              return (
                <div key={p.id} className="rounded-lg border p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{p.name}</span>
                      <Badge variant="secondary" className="text-[10px]">{p.type}</Badge>
                    </div>
                    <div
                      className={cn(
                        'h-2.5 w-2.5 rounded-full',
                        p.hasKey ? 'bg-green-500' : 'bg-muted-foreground/30'
                      )}
                      title={p.hasKey ? 'Configured' : 'Not configured'}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{p.baseUrl}</p>
                  <div className="flex items-center gap-2">
                    <Input
                      type="password"
                      placeholder="Paste your API key"
                      value={keys[p.id] ?? ''}
                      onChange={(e) => setKeys((k) => ({ ...k, [p.id]: e.target.value }))}
                      className="h-8 text-xs"
                    />
                    <Button
                      size="sm"
                      className="h-8 text-xs shrink-0"
                      disabled={busy[p.id] || !(keys[p.id] ?? '').trim()}
                      onClick={() => handleSave(p.id, keys[p.id] ?? '')}
                    >
                      {busy[p.id] ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
                      {p.hasKey ? 'Update' : 'Connect'}
                    </Button>
                  </div>
                  {result && (
                    <div className={cn('flex items-center gap-1.5 text-xs', result.ok ? 'text-green-600 dark:text-green-400' : 'text-destructive')}>
                      {result.ok ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                      {result.message}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </ScrollArea>
        <DialogFooter className="items-center justify-between sm:justify-between">
          <Button variant="ghost" size="sm" onClick={handleFinish}>
            Use later
          </Button>
          <Button
            disabled={!allHaveKeys}
            onClick={() => {
              setConfigured(true)
              setOpen(false)
            }}
          >
            Start chatting
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}