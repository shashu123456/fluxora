import { useEffect, useMemo, useState } from 'react'
import { Card, CardHeader, CardContent, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { cn, formatBytes, formatDateTime } from '@/lib/utils'
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  KeyRound,
  Loader2,
  Play,
  Search,
  ShieldCheck,
  XCircle,
} from 'lucide-react'
import { useApiDiscoveryStore } from '@/stores/apiDiscoveryStore'
import type { ApiDetailView, ApiTestResultView } from '@/types/apiDiscovery'

const RISK_STYLES: Record<string, string> = {
  low: 'border-emerald-500/40 text-emerald-400',
  medium: 'border-amber-500/40 text-amber-400',
  high: 'border-red-500/40 text-red-400',
}

function ErrorLine({ message }: { message: string }) {
  return (
    <p role="alert" className="flex items-start gap-2 text-sm text-red-400">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{message}</span>
    </p>
  )
}

function TestResultPanel({ result }: { result: ApiTestResultView }) {
  if (!result.ok) {
    return (
      <div className="space-y-2 rounded-md border border-red-500/30 bg-red-500/5 p-3" aria-live="polite">
        <p className="flex items-center gap-2 text-sm font-medium text-red-400">
          <XCircle className="h-4 w-4" /> {result.error.code.replace(/_/g, ' ')}
        </p>
        <p className="text-sm text-muted-foreground">{result.error.message}</p>
        <p className="text-xs text-muted-foreground">
          {result.status ? `HTTP ${result.status} · ` : ''}
          {result.durationMs} ms · {formatBytes(result.bytes)}
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3 rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3" aria-live="polite">
      <p className="flex items-center gap-2 text-sm font-medium text-emerald-400">
        <CheckCircle2 className="h-4 w-4" /> HTTP {result.status}
      </p>
      <p className="text-xs text-muted-foreground">
        {result.durationMs} ms · {formatBytes(result.bytes)} · {result.contentType.split(';')[0] || 'unknown type'}
      </p>
      <div className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Untrusted API response
        </p>
        <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded bg-background/60 p-2 text-xs text-foreground">
          {result.preview}
        </pre>
        {result.truncated && <p className="text-xs text-muted-foreground">Preview truncated.</p>}
      </div>
    </div>
  )
}

export function ApiDiscoverySettings() {
  const { items, meta, audit, loading, error, load, loadDetail, connect, disconnect, test, loadAudit } =
    useApiDiscoveryStore()

  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')
  const [authFilter, setAuthFilter] = useState('all')
  const [riskFilter, setRiskFilter] = useState('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<ApiDetailView | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [secretInput, setSecretInput] = useState('')
  const [showKeyField, setShowKeyField] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [result, setResult] = useState<ApiTestResultView | null>(null)

  useEffect(() => {
    void load()
    void loadAudit()
  }, [load, loadAudit])

  useEffect(() => {
    if (!selectedId) {
      setDetail(null)
      return
    }
    let cancelled = false
    void loadDetail(selectedId).then((next) => {
      if (!cancelled) setDetail(next)
    })
    return () => {
      cancelled = true
    }
  }, [selectedId, refreshKey, loadDetail])

  const categories = useMemo(
    () => Array.from(new Set(items.map((item) => item.category))).sort(),
    [items]
  )

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    return items.filter((item) => {
      if (category !== 'all' && item.category !== category) return false
      if (authFilter === 'none' && item.authType !== 'none') return false
      if (authFilter === 'key' && item.authType !== 'apiKey') return false
      if (riskFilter !== 'all' && item.risk !== riskFilter) return false
      if (!query) return true
      return [item.name, item.description, item.category, ...item.tags]
        .join(' ')
        .toLowerCase()
        .includes(query)
    })
  }, [items, search, category, authFilter, riskFilter])

  const openDetail = (apiId: string) => {
    setSelectedId(apiId)
    setResult(null)
    setConfirming(false)
    setShowKeyField(false)
    setSecretInput('')
    setActionError(null)
  }

  const handleConnect = async () => {
    if (!detail) return
    setActionError(null)
    if (detail.authType === 'apiKey' && secretInput.trim().length === 0) {
      setActionError('Enter the API key before connecting.')
      return
    }
    setBusy(true)
    const failure = await connect(detail.id, detail.authType === 'apiKey' ? secretInput : undefined)
    setBusy(false)
    if (failure) {
      setActionError(failure)
      return
    }
    setSecretInput('')
    setShowKeyField(false)
    setRefreshKey((key) => key + 1)
  }

  const handleDisconnect = async () => {
    if (!detail) return
    setBusy(true)
    const failure = await disconnect(detail.id)
    setBusy(false)
    if (failure) setActionError(failure)
    else setRefreshKey((key) => key + 1)
  }

  const handleTest = async () => {
    if (!detail) return
    setBusy(true)
    setConfirming(false)
    const next = await test(detail.id)
    setResult(next)
    setBusy(false)
    setRefreshKey((key) => key + 1)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          API Discovery
          <Badge variant="outline" className="text-[10px] uppercase tracking-wide">Beta</Badge>
        </CardTitle>
        <CardDescription>
          Browse a curated catalog, connect a key, and send one explicit test request from this machine.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1 text-xs text-muted-foreground">
          <p>
            Catalog v{meta?.version ?? '—'} · {meta?.total ?? 0} APIs · {meta?.categories ?? 0} categories · last
            verified {meta?.verifiedAt ?? '—'}
          </p>
          <p className="flex items-start gap-1.5">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-fx-gold" />
            Requests go directly from this app on your machine. Fluxora never proxies your data.
          </p>
        </div>

        <Separator />

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <div className="relative sm:col-span-2">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              aria-label="Search APIs"
              className="pl-8"
              placeholder="Search name, description, category, tag"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            aria-label="Filter by category"
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="all">All categories</option>
            {categories.map((value) => (
              <option key={value} value={value}>{value}</option>
            ))}
          </select>
          <div className="grid grid-cols-2 gap-2">
            <select
              aria-label="Filter by authentication"
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              value={authFilter}
              onChange={(e) => setAuthFilter(e.target.value)}
            >
              <option value="all">Any auth</option>
              <option value="none">No key</option>
              <option value="key">API key</option>
            </select>
            <select
              aria-label="Filter by risk"
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              value={riskFilter}
              onChange={(e) => setRiskFilter(e.target.value)}
            >
              <option value="all">Any risk</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>
        </div>

        {loading && (
          <div className="space-y-2" aria-live="polite">
            {[0, 1, 2].map((key) => (
              <div key={key} className="h-14 animate-pulse rounded-md bg-muted" />
            ))}
          </div>
        )}

        {!loading && error && <ErrorLine message={error} />}

        {!loading && !error && (
          <div className="grid max-h-80 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
            {filtered.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => openDetail(item.id)}
                aria-pressed={selectedId === item.id}
                className={cn(
                  'space-y-1.5 rounded-md border p-3 text-left transition-colors hover:border-fx-gold/50',
                  selectedId === item.id ? 'border-fx-gold/70 bg-muted/40' : 'border-border'
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-sm font-medium text-foreground">{item.name}</span>
                  {item.connected ? (
                    <Badge variant="outline" className="border-emerald-500/40 text-[10px] text-emerald-400">Connected</Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px] text-muted-foreground">
                      {item.authType === 'none' ? 'No key' : 'Key'}
                    </Badge>
                  )}
                </div>
                <p className="line-clamp-2 text-xs text-muted-foreground">{item.description}</p>
                <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
                  <span>{item.category}</span>
                  <span aria-hidden>·</span>
                  <span className={cn('rounded border px-1', RISK_STYLES[item.risk])}>{item.risk} risk</span>
                  <span aria-hidden>·</span>
                  <span>verified {item.verifiedAt}</span>
                </div>
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="col-span-full py-6 text-center text-sm text-muted-foreground">
                No APIs match these filters.
              </p>
            )}
          </div>
        )}

        {detail && (
          <>
            <Separator />
            <div className="space-y-4 rounded-md border border-border p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="text-base font-semibold text-foreground">{detail.name}</h3>
                  <p className="text-xs text-muted-foreground">
                    {detail.category} · {detail.authLabel} · {detail.risk} risk · verified {detail.verifiedAt}
                  </p>
                </div>
                <a
                  href={detail.docsUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-fx-gold underline-offset-2 hover:underline"
                >
                  Documentation <ExternalLink className="h-3 w-3" />
                </a>
              </div>

              <p className="text-sm text-muted-foreground">{detail.description}</p>

              <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                <p><span className="text-foreground">Base domain:</span> {detail.baseUrl}</p>
                <p><span className="text-foreground">Free tier:</span> {detail.freeTier}</p>
                <p><span className="text-foreground">Response:</span> {detail.responseNotes}</p>
                <p><span className="text-foreground">Status:</span> {detail.connected ? `Connected (${detail.fingerprint})` : 'Not connected'}</p>
              </div>

              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  What leaves your machine
                </p>
                <pre className="overflow-x-auto rounded bg-muted/40 p-2 text-xs text-foreground">
{`GET ${detail.sample.host}${detail.sample.path}${detail.sample.query ? `?${new URLSearchParams(detail.sample.query).toString()}` : ''}
Headers: Accept, User-Agent${detail.authType === 'apiKey' ? `, and the ${detail.authLabel.replace(/^Sent as the /, '')}` : ''}`}
                </pre>
              </div>

              <div className="space-y-2">
                {detail.authType === 'apiKey' && !detail.connected && (
                  <div className="space-y-1.5">
                    <Label htmlFor="api-secret">API key</Label>
                    <div className="flex gap-2">
                      <Input
                        id="api-secret"
                        type="password"
                        autoComplete="off"
                        placeholder="Paste the key"
                        value={secretInput}
                        onChange={(e) => setSecretInput(e.target.value)}
                      />
                      <Button onClick={handleConnect} disabled={busy}>
                        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                        Save key
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      The key is stored in the OS-encrypted main-process vault and never shown again.
                    </p>
                  </div>
                )}

                {detail.authType === 'none' && !detail.connected && (
                  <Button variant="outline" onClick={() => setShowKeyField(true)} disabled={busy || showKeyField}>
                    Mark as connected
                  </Button>
                )}

                {showKeyField && detail.authType === 'none' && (
                  <Button onClick={handleConnect} disabled={busy}>Confirm connect</Button>
                )}

                {detail.connected && (
                  <Button variant="outline" onClick={handleDisconnect} disabled={busy}>
                    Remove credential
                  </Button>
                )}

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <Button
                    onClick={() => {
                      setConfirming(true)
                      setResult(null)
                    }}
                    disabled={busy || (detail.authType === 'apiKey' && !detail.connected)}
                  >
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                    Test request
                  </Button>
                  {detail.authType === 'apiKey' && !detail.connected && (
                    <span className="text-xs text-muted-foreground">Connect a key first.</span>
                  )}
                </div>

                {confirming && (
                  <div className="space-y-2 rounded-md border border-fx-gold/40 bg-fx-gold/5 p-3">
                    <p className="text-sm text-foreground">Send this exact request?</p>
                    <p className="break-all font-mono text-xs text-muted-foreground">
                      GET https://{detail.sample.host}
                      {detail.sample.path}
                    </p>
                    <div className="flex gap-2">
                      <Button onClick={handleTest} disabled={busy}>Send test request</Button>
                      <Button variant="ghost" onClick={() => setConfirming(false)}>Cancel</Button>
                    </div>
                  </div>
                )}

                {actionError && <ErrorLine message={actionError} />}
                {result && <TestResultPanel result={result} />}
              </div>
            </div>
          </>
        )}

        <Separator />

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-foreground">Audit log</p>
            <Button variant="ghost" size="sm" onClick={() => void loadAudit()} disabled={loading}>
              Refresh
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Append-only, read-only, newest first, capped at 500 rows. No keys or response bodies are stored.
          </p>
          <div className="max-h-64 overflow-auto rounded-md border border-border">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-muted/60 text-muted-foreground">
                <tr>
                  <th className="px-2 py-1.5 font-medium">Time</th>
                  <th className="px-2 py-1.5 font-medium">API</th>
                  <th className="px-2 py-1.5 font-medium">Endpoint</th>
                  <th className="px-2 py-1.5 font-medium">Status</th>
                  <th className="px-2 py-1.5 font-medium">ms</th>
                  <th className="px-2 py-1.5 font-medium">Bytes</th>
                  <th className="px-2 py-1.5 font-medium">Outcome</th>
                </tr>
              </thead>
              <tbody>
                {audit.map((entry) => (
                  <tr key={entry.id} className="border-t border-border/60">
                    <td className="whitespace-nowrap px-2 py-1.5 text-muted-foreground">
                      {formatDateTime(entry.createdAt)}
                    </td>
                    <td className="px-2 py-1.5">{entry.apiId}</td>
                    <td className="max-w-[220px] truncate px-2 py-1.5 font-mono text-muted-foreground">
                      {entry.method} {entry.endpoint}
                    </td>
                    <td className="px-2 py-1.5">{entry.statusCode ?? '—'}</td>
                    <td className="px-2 py-1.5">{entry.durationMs}</td>
                    <td className="px-2 py-1.5">{entry.responseBytes}</td>
                    <td
                      className={cn(
                        'px-2 py-1.5',
                        entry.outcome === 'success'
                          ? 'text-emerald-400'
                          : entry.outcome === 'http_error'
                            ? 'text-amber-400'
                            : 'text-red-400'
                      )}
                    >
                      {entry.outcome}
                      {entry.errorCode ? ` (${entry.errorCode})` : ''}
                    </td>
                  </tr>
                ))}
                {audit.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-2 py-6 text-center text-muted-foreground">
                      No test requests recorded yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
