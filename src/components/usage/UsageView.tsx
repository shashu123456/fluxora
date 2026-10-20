import { useEffect, useState } from 'react'
import { useProviderStore } from '@/stores/providerStore'
import type { UsageRecord } from '@/types'
import { Card, CardHeader, CardContent, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { cn, formatTokens, formatCost, formatDateTime } from '@/lib/utils'
import { BarChart3, Loader2, AlertTriangle } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'

interface UsageSummary {
  requests: number
  promptTokens: number
  completionTokens: number
  totalTokens: number
  cost: number
  avgResponseTimeMs: number
  streamingCount: number
  errors: number
}

interface ProviderUsageRow {
  providerId: string
  model: string
  requests: number
  promptTokens: number
  completionTokens: number
  totalTokens: number
  cost: number
  avgResponseTimeMs: number
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-semibold">{value}</p>
        {sub && <p className="mt-0.5 text-[11px] text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  )
}

export function UsageView() {
  const providers = useProviderStore((s) => s.providers)
  const [loading, setLoading] = useState(true)
  const [summary, setSummary] = useState<UsageSummary | null>(null)
  const [byProvider, setByProvider] = useState<ProviderUsageRow[]>([])
  const [detailed, setDetailed] = useState<UsageRecord[]>([])
  const [showClearDialog, setShowClearDialog] = useState(false)
  const [clearing, setClearing] = useState(false)

  useEffect(() => {
    const load = async () => {
      try {
        const [sum, byProv, det] = await Promise.all([
          window.api.usage.summary(),
          window.api.usage.byProvider(),
          window.api.usage.detailed(),
        ])
        setSummary(sum)
        setByProvider(byProv || [])
        setDetailed(det || [])
      } catch {}
      setLoading(false)
    }
    load()
  }, [])

  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const todayTs = todayStart.getTime()

  const todayStats = detailed.reduce(
    (acc, r) => {
      if (r.createdAt >= todayTs) {
        acc.tokens += r.totalTokens
        acc.cost += r.cost
        acc.requests += 1
      }
      return acc
    },
    { tokens: 0, cost: 0, requests: 0 }
  )

  const providerNameMap = Object.fromEntries(providers.map((p) => [p.id, p.name]))

  const recentRecords = detailed.slice(0, 100)

  const handleClearUsage = async () => {
    setClearing(true)
    try {
      await window.api.usage.clear()
      setSummary(null)
      setByProvider([])
      setDetailed([])
    } catch {}
    setClearing(false)
    setShowClearDialog(false)
  }

  if (loading) {
    return (
      <div className="h-full p-6 space-y-6">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <Skeleton className="h-3 w-24 mb-2" />
                <Skeleton className="h-8 w-20" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Card>
          <CardContent className="p-4">
            <Skeleton className="h-4 w-32 mb-4" />
            <Skeleton className="h-10 w-full" />
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <ScrollArea className="h-full">
      <div className="mx-auto max-w-5xl space-y-6 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <BarChart3 className="h-5 w-5" /> Usage
            </h2>
            <p className="text-sm text-muted-foreground">Track API usage, costs, and performance.</p>
          </div>
          <Button variant="destructive" size="sm" onClick={() => setShowClearDialog(true)}>
            Clear Usage Data
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard
            label="Total Requests"
            value={summary ? summary.requests.toLocaleString() : '0'}
          />
          <StatCard
            label="Total Tokens"
            value={summary ? formatTokens(summary.totalTokens) : '0'}
            sub={summary ? `${formatTokens(summary.promptTokens)} in / ${formatTokens(summary.completionTokens)} out` : undefined}
          />
          <StatCard
            label="Total Cost"
            value={summary ? formatCost(summary.cost) : '$0.00'}
          />
          <StatCard
            label="Avg Response Time"
            value={summary ? `${summary.avgResponseTimeMs}ms` : '0ms'}
            sub={summary && summary.errors > 0 ? `${summary.errors} errors` : undefined}
          />
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Today</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-8">
              <div>
                <p className="text-xs text-muted-foreground">Requests</p>
                <p className="text-lg font-semibold">{todayStats.requests.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Tokens</p>
                <p className="text-lg font-semibold">{formatTokens(todayStats.tokens)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Cost</p>
                <p className="text-lg font-semibold">{formatCost(todayStats.cost)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Usage by Provider</CardTitle>
            <CardDescription>Breakdown of usage per provider and model.</CardDescription>
          </CardHeader>
          <CardContent>
            {byProvider.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">No usage data yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs text-muted-foreground">
                      <th className="pb-2 pr-4 font-medium">Provider</th>
                      <th className="pb-2 pr-4 font-medium">Model</th>
                      <th className="pb-2 pr-4 text-right font-medium">Requests</th>
                      <th className="pb-2 pr-4 text-right font-medium">Tokens</th>
                      <th className="pb-2 text-right font-medium">Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byProvider.map((row, i) => (
                      <tr key={`${row.providerId}-${row.model}-${i}`} className="border-b last:border-0">
                        <td className="py-2 pr-4">{providerNameMap[row.providerId] || row.providerId}</td>
                        <td className="py-2 pr-4 font-mono text-xs">{row.model}</td>
                        <td className="py-2 pr-4 text-right">{row.requests.toLocaleString()}</td>
                        <td className="py-2 pr-4 text-right">{formatTokens(row.totalTokens)}</td>
                        <td className="py-2 text-right">{formatCost(row.cost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Detailed Log</CardTitle>
            <CardDescription>Recent API calls, newest first. Showing {Math.min(recentRecords.length, 100)} of {detailed.length}.</CardDescription>
          </CardHeader>
          <CardContent>
            {recentRecords.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">No usage records yet.</p>
            ) : (
              <ScrollArea className="h-[400px]">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-background">
                      <tr className="border-b text-left text-xs text-muted-foreground">
                        <th className="pb-2 pr-3 font-medium">Time</th>
                        <th className="pb-2 pr-3 font-medium">Provider</th>
                        <th className="pb-2 pr-3 font-medium">Model</th>
                        <th className="pb-2 pr-3 text-right font-medium">In</th>
                        <th className="pb-2 pr-3 text-right font-medium">Out</th>
                        <th className="pb-2 pr-3 text-right font-medium">Total</th>
                        <th className="pb-2 pr-3 text-right font-medium">Cost</th>
                        <th className="pb-2 pr-3 text-right font-medium">Ms</th>
                        <th className="pb-2 font-medium">Stream</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentRecords.map((record) => (
                        <tr key={record.id} className="border-b last:border-0">
                          <td className="py-1.5 pr-3 whitespace-nowrap text-xs text-muted-foreground">
                            {formatDateTime(record.createdAt)}
                          </td>
                          <td className="py-1.5 pr-3 whitespace-nowrap">
                            {providerNameMap[record.providerId] || record.providerId}
                          </td>
                          <td className="py-1.5 pr-3 whitespace-nowrap font-mono text-xs">{record.model}</td>
                          <td className="py-1.5 pr-3 text-right text-xs">{record.promptTokens.toLocaleString()}</td>
                          <td className="py-1.5 pr-3 text-right text-xs">{record.completionTokens.toLocaleString()}</td>
                          <td className="py-1.5 pr-3 text-right text-xs">{record.totalTokens.toLocaleString()}</td>
                          <td className="py-1.5 pr-3 text-right text-xs">{formatCost(record.cost)}</td>
                          <td className="py-1.5 pr-3 text-right text-xs">{record.responseTimeMs}ms</td>
                          <td className="py-1.5">
                            {record.streaming ? (
                              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Stream</Badge>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={showClearDialog} onOpenChange={setShowClearDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" /> Clear Usage Data
            </DialogTitle>
            <DialogDescription>
              This will permanently delete all usage records. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowClearDialog(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleClearUsage} disabled={clearing}>
              {clearing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Clear All
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ScrollArea>
  )
}
