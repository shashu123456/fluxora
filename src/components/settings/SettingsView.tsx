import { useEffect, useState } from 'react'
import { useProviderStore } from '@/stores/providerStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { useUIStore } from '@/stores/uiStore'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import type { ProviderConfig } from '@/types'
import { Card, CardHeader, CardContent, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { cn, formatBytes, formatDateTime } from '@/lib/utils'
import {
  Plus, Pencil, Trash2, ChevronDown, ChevronUp,
  Loader2, Eye, EyeOff, RefreshCw, AlertTriangle, Search,
  Cpu, Database, HardDrive, Activity, FolderOpen, Settings,
} from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'

const CATEGORIES: { id: string; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'general', label: 'General' },
  { id: 'providers', label: 'Providers' },
  { id: 'data', label: 'Data & Backup' },
  { id: 'diagnostics', label: 'Diagnostics' },
  { id: 'danger', label: 'Danger Zone' },
]

const CARD_META: Record<string, { cat: string; label: string; keywords: string[] }> = {
  providers: { cat: 'providers', label: 'Providers', keywords: ['ai', 'model', 'api', 'provider', 'connection'] },
  diagnostics: { cat: 'providers', label: 'Provider Diagnostics', keywords: ['diagnostic', 'status', 'latency', 'health'] },
  general: { cat: 'general', label: 'General', keywords: ['preference', 'theme', 'token', 'streaming', 'memory', 'notification', 'display', 'language'] },
  workspace: { cat: 'data', label: 'Workspace Information', keywords: ['workspace', 'project', 'folder', 'index'] },
  backup: { cat: 'data', label: 'Backup & Restore', keywords: ['backup', 'restore', 'export', 'import', 'data directory', 'data'] },
  system: { cat: 'diagnostics', label: 'System Information', keywords: ['os', 'electron', 'node', 'chrome', 'version', 'cpu', 'memory', 'system'] },
  database: { cat: 'diagnostics', label: 'Database Information', keywords: ['database', 'table', 'sqlite', 'journal', 'file'] },
  performance: { cat: 'diagnostics', label: 'Performance Statistics', keywords: ['performance', 'usage', 'tokens', 'cost', 'uptime', 'requests'] },
  danger: { cat: 'danger', label: 'Danger Zone', keywords: ['reset', 'danger', 'delete all', 'irreversible'] },
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="truncate text-right font-mono text-xs text-foreground">{value}</span>
    </div>
  )
}

interface BackupInfo {
  name: string
  path: string
  size: number
  createdAt: number
}

const PROVIDER_PRESETS: Record<string, {
  label: string
  baseUrl: string
  needsKey: boolean
  models: Array<{ id: string; name: string; contextWindow?: number }>
}> = {
  openai: {
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    needsKey: true,
    models: [
      { id: 'gpt-4o', name: 'GPT-4o', contextWindow: 128000 },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini', contextWindow: 128000 },
      { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', contextWindow: 128000 },
      { id: 'gpt-4', name: 'GPT-4', contextWindow: 8192 },
      { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', contextWindow: 16385 },
    ],
  },
  anthropic: {
    label: 'Anthropic',
    baseUrl: 'https://api.anthropic.com',
    needsKey: true,
    models: [
      { id: 'claude-3-5-sonnet-20240620', name: 'Claude 3.5 Sonnet', contextWindow: 200000 },
      { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus', contextWindow: 200000 },
      { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku', contextWindow: 200000 },
    ],
  },
  gemini: {
    label: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    needsKey: true,
    models: [
      { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', contextWindow: 2000000 },
      { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', contextWindow: 1000000 },
    ],
  },
  groq: {
    label: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    needsKey: true,
    models: [
      { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B', contextWindow: 128000 },
      { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B', contextWindow: 128000 },
      { id: 'mixtral-8x7b-32768', name: 'Mixtral 8x7B', contextWindow: 32768 },
    ],
  },
  openrouter: {
    label: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    needsKey: true,
    models: [],
  },
  ollama: {
    label: 'Ollama',
    baseUrl: 'http://localhost:11434/v1',
    needsKey: false,
    models: [
      { id: 'llama3', name: 'Llama 3', contextWindow: 8192 },
      { id: 'mistral', name: 'Mistral', contextWindow: 8192 },
      { id: 'codellama', name: 'CodeLlama', contextWindow: 16384 },
      { id: 'gemma', name: 'Gemma', contextWindow: 8192 },
    ],
  },
  lmstudio: {
    label: 'LM Studio',
    baseUrl: 'http://localhost:1234/v1',
    needsKey: false,
    models: [],
  },
  custom: {
    label: 'Custom',
    baseUrl: '',
    needsKey: true,
    models: [],
  },
}

const MAX_TOKEN_OPTIONS = [1024, 2048, 4096, 8192, 16384, 32768, 65536, 100000]

function secretSummary(provider: ProviderConfig): { label: string; variant: 'outline' | 'secondary' | 'success' | 'warning' } {
  const secret = provider.secret
  if (!secret?.configured) {
    return { label: provider.hasKey ? 'Key stored' : 'No key', variant: 'outline' }
  }
  const fingerprint = secret.maskedFingerprint ? ` ${secret.maskedFingerprint}` : ''
  const label =
    secret.health === 'configured' ? 'Connected' :
    secret.health === 'needs-attention' ? 'Needs attention' :
    secret.health === 'expired' ? 'Expired' : 'Missing'
  return { label: `${label}${fingerprint}`, variant: secret.health === 'configured' ? 'success' : secret.health === 'needs-attention' ? 'warning' : 'secondary' }
}

function storageLabel(provider: ProviderConfig): string {
  if (!provider.secret?.configured) return ''
  return provider.secret.storageMode === 'os' ? 'OS keychain' : 'Local encrypted fallback'
}

function CapabilityChips({ capabilities }: { capabilities?: any }) {
  if (!capabilities) return null
  const chips: { text: string; variant: 'default' | 'secondary' | 'outline' | 'success' | 'warning' }[] = []
  if (capabilities.detectedType) chips.push({ text: capabilities.detectedType, variant: 'secondary' })
  if (capabilities.apiKind) chips.push({ text: capabilities.apiKind, variant: 'outline' })
  chips.push({
    text: capabilities.supportsStreaming ? 'Streaming' : 'No streaming',
    variant: capabilities.supportsStreaming ? 'success' : 'warning',
  })
  if (typeof capabilities.supportsVision === 'boolean') {
    chips.push({ text: capabilities.supportsVision ? 'Vision' : 'No vision', variant: capabilities.supportsVision ? 'success' : 'outline' })
  }
  if (capabilities.contextWindow) {
    chips.push({ text: `${Math.round(capabilities.contextWindow / 1000)}K ctx`, variant: 'outline' })
  }
  return (
    <div className="flex flex-wrap items-center gap-1">
      {chips.map((c, i) => (
        <Badge key={i} variant={c.variant} className="text-[10px]">{c.text}</Badge>
      ))}
    </div>
  )
}

export function SettingsView() {
  const { providers, loadProviders, createProvider, updateProvider, deleteProvider, refreshModels } = useProviderStore()
  const { settings, loadSettings, updateSettings, resetSettings, exportAll } = useSettingsStore()
  const { theme, setTheme } = useUIStore()
  const { workspaces, indexes } = useWorkspaceStore()

  const [cat, setCat] = useState('all')
  const [q, setQ] = useState('')
  const [sysInfo, setSysInfo] = useState<any>(null)
  const [dbInfo, setDbInfo] = useState<any>(null)
  const [analytics, setAnalytics] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [newType, setNewType] = useState('openai')
  const [newName, setNewName] = useState('')
  const [newBaseUrl, setNewBaseUrl] = useState(PROVIDER_PRESETS.openai.baseUrl)
  const [newApiKey, setNewApiKey] = useState('')
  const [showNewKey, setShowNewKey] = useState(false)
  const [expandedModels, setExpandedModels] = useState<Record<string, boolean>>({})
  const [testingId, setTestingId] = useState<string | null>(null)
  const [refreshingId, setRefreshingId] = useState<string | null>(null)
  const [rotatingId, setRotatingId] = useState<string | null>(null)
  const [restoreTarget, setRestoreTarget] = useState<BackupInfo | null>(null)
  const [restoring, setRestoring] = useState(false)
  const [importPreview, setImportPreview] = useState<any | null>(null)
  const [importing, setImporting] = useState(false)
  const [refreshError, setRefreshError] = useState<Record<string, string>>({})
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; latencyMs: number; error?: string }>>({})
  const [deleteTarget, setDeleteTarget] = useState<ProviderConfig | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const [editData, setEditData] = useState<ProviderConfig | null>(null)
  const [editName, setEditName] = useState('')
  const [editBaseUrl, setEditBaseUrl] = useState('')
  const [editApiKey, setEditApiKey] = useState('')
  const [showEditKey, setShowEditKey] = useState(false)
  const [dataDir, setDataDir] = useState('')
  const [backups, setBackups] = useState<BackupInfo[]>([])
  const [creatingBackup, setCreatingBackup] = useState(false)
  const [showResetDialog, setShowResetDialog] = useState(false)
  const [detectedType, setDetectedType] = useState<string | null>(null)
  const [detecting, setDetecting] = useState(false)
  const [testingConfig, setTestingConfig] = useState(false)
  const [configTest, setConfigTest] = useState<{ ok: boolean; latencyMs: number; error?: string; models?: string[]; capabilities?: any } | null>(null)

  const temperature = (settings as any).temperature ?? 0.7
  const maxTokens = (settings as any).maxTokens ?? 4096
  const streaming = settings.streamingEnabled ?? true
  const memory = (settings as any).memoryEnabled ?? false
  const notifications = settings.notificationsEnabled ?? true

  useEffect(() => {
    const init = async () => {
      await Promise.all([loadProviders(), loadSettings()])
      try {
        const info = await window.api.system.getInfo()
        setSysInfo(info || null)
      } catch {}
      try {
        const dbi = await window.api.system.dbInfo()
        setDbInfo(dbi || null)
      } catch {}
      try {
        const perf = await window.api.system.analytics()
        setAnalytics(perf || null)
      } catch {}
      try {
        const info = await window.api.system.getInfo()
        setDataDir(info.dataDir || '')
      } catch {}
      try {
        const list = await window.api.backup.list()
        setBackups(list || [])
      } catch {}
      setLoading(false)
    }
    init()
  }, [])

  const visible = (meta: { cat: string; label: string; keywords: string[] }): boolean => {
    const inCat = cat === 'all' || meta.cat === cat
    if (!inCat) return false
    if (q.trim()) {
      return `${meta.label} ${meta.keywords.join(' ')}`.toLowerCase().includes(q.trim().toLowerCase())
    }
    return true
  }

  const fmt = (v: unknown): string => (v === undefined || v === null ? '—' : String(v))

  useEffect(() => {
    if (!newBaseUrl.trim()) {
      setDetectedType(null)
      return
    }
    setDetecting(true)
    setDetectedType(null)
    const t = setTimeout(async () => {
      try {
        const res = await window.api.providers.detect({ baseUrl: newBaseUrl })
        setDetectedType(res?.detectedType || null)
      } catch {
        setDetectedType(null)
      } finally {
        setDetecting(false)
      }
    }, 450)
    return () => clearTimeout(t)
  }, [newBaseUrl])

  const handleTypeChange = (type: string) => {
    setNewType(type)
    const preset = PROVIDER_PRESETS[type]
    if (preset) {
      setNewBaseUrl(preset.baseUrl)
      if (!newName) setNewName(preset.label)
    }
  }

  const handleAddProvider = async () => {
    const preset = PROVIDER_PRESETS[newType]
    const models = preset.models.map((m) => ({
      id: m.id,
      name: m.name,
      providerId: '',
      supportsStreaming: true,
      contextWindow: m.contextWindow,
    }))
    await createProvider({
      name: newName || preset.label,
      type: newType as any,
      baseUrl: newBaseUrl,
      apiKey: newApiKey,
      models: models as any,
      enabled: true,
    } as any)
    setNewName('')
    setNewApiKey('')
    setShowNewKey(false)
    await loadProviders()
  }

  const handleTestConnection = async (id: string) => {
    setTestingId(id)
    try {
      const result = await window.api.providers.test(id)
      setTestResults((prev) => ({
        ...prev,
        [id]: { ok: result.ok, latencyMs: result.latencyMs, error: result.error },
      }))
      await loadProviders()
    } catch (e: any) {
      setTestResults((prev) => ({
        ...prev,
        [id]: { ok: false, latencyMs: 0, error: e.message || 'Test failed' },
      }))
    } finally {
      setTestingId(null)
    }
  }

  const handleRotateSecret = async (provider: ProviderConfig) => {
    setRotatingId(provider.id)
    try {
      await window.api.providers.rotate(provider.id)
      await loadProviders()
      await window.api.notifications?.create?.({
        type: 'success',
        title: 'Secret re-encrypted',
        message: `${provider.name} was re-sealed with the current storage key.`,
      })
    } catch (e: any) {
      await window.api.notifications?.create?.({
        type: 'error',
        title: 'Re-encryption failed',
        message: e?.message || 'Could not re-encrypt the stored secret.',
      })
    } finally {
      setRotatingId(null)
    }
  }

  const handleToggleEnabled = async (provider: ProviderConfig) => {
    await updateProvider(provider.id, { enabled: !provider.enabled })
  }

  const handleTestConfig = async () => {
    setTestingConfig(true)
    setConfigTest(null)
    try {
      const result = await window.api.providers.testConfig({
        name: newName || 'Test',
        type: newType as any,
        baseUrl: newBaseUrl,
        apiKey: newApiKey,
      })
      setConfigTest(result)
    } catch (e: any) {
      setConfigTest({ ok: false, latencyMs: 0, error: e?.message || 'Test failed' })
    } finally {
      setTestingConfig(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    await deleteProvider(deleteTarget.id)
    setDeleteTarget(null)
  }

  const openEditDialog = (provider: ProviderConfig) => {
    setEditData(provider)
    setEditName(provider.name)
    setEditBaseUrl(provider.baseUrl)
    setEditApiKey(provider.apiKey)
    setShowEditKey(false)
    setEditOpen(true)
  }

  const handleSaveEdit = async () => {
    if (!editData) return
    await updateProvider(editData.id, {
      name: editName,
      baseUrl: editBaseUrl,
      apiKey: editApiKey,
    })
    setEditOpen(false)
    setEditData(null)
  }

  const handleCreateBackup = async () => {
    setCreatingBackup(true)
    try {
      await window.api.backup.create()
      const list = await window.api.backup.list()
      setBackups(list || [])
    } catch (err: any) {
      await window.api.notifications?.create?.({ type: 'error', title: 'Backup Failed', message: err?.message || 'Could not create backup.' })
    }
    setCreatingBackup(false)
  }

  const handleRestoreBackup = (backupPath: string) => {
    setRestoreTarget(backups.find((backup) => backup.path === backupPath) || null)
  }

  const performRestore = async () => {
    if (!restoreTarget) return
    setRestoring(true)
    try {
      await window.api.backup.restore(restoreTarget.path)
      await window.api.notifications?.create?.({
        type: 'success',
        title: 'Backup verified',
        message: 'Restore verified. Fluxora will restart automatically.',
      })
    } catch (err: any) {
      await window.api.notifications?.create?.({ type: 'error', title: 'Restore Failed', message: err?.message || 'Could not restore backup.' })
    } finally {
      setRestoring(false)
      setRestoreTarget(null)
    }
  }

  const handleValidateImport = async () => {
    try {
      const preview = await window.api.settings.validateImport()
      if (!preview) return
      if (!preview.ok) {
        await window.api.notifications?.create?.({
          type: 'error',
          title: 'Import validation failed',
          message: preview.errors?.join(' ') || 'The selected file is not a valid Fluxora export.',
        })
        return
      }
      setImportPreview(preview)
    } catch (err: any) {
      await window.api.notifications?.create?.({
        type: 'error',
        title: 'Import validation failed',
        message: err?.message || 'Could not read the selected file.',
      })
    }
  }

  const performImport = async () => {
    if (!importPreview?.path) return
    setImporting(true)
    try {
      const result = await window.api.settings.importAll(importPreview.path)
      await Promise.all([loadProviders(), loadSettings()])
      const list = await window.api.backup.list()
      setBackups(list || [])
      setImportPreview(null)
      await window.api.notifications?.create?.({
        type: 'success',
        title: 'Import complete',
        message: `${result?.counts ? Object.values(result.counts).reduce((sum: number, value) => sum + Number(value || 0), 0) : ''} records imported. Re-enter provider credentials if you moved to a new device.`,
      })
    } catch (err: any) {
      await window.api.notifications?.create?.({ type: 'error', title: 'Import failed', message: err?.message || 'Could not import the selected file.' })
    } finally {
      setImporting(false)
    }
  }

  const handleReset = async () => {
    await resetSettings()
    setShowResetDialog(false)
  }

  const toggleModels = (id: string) => {
    setExpandedModels((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <ScrollArea className="h-full">
      <div className="mx-auto max-w-3xl space-y-6 p-6">
        <PageHeader
          eyebrow="Preferences"
          title="Settings"
          description="Providers, behavior and local data — all stored on this machine."
          icon={Settings}
        />
        <div className="flex flex-col gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search settings…"
              className="pl-9"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {CATEGORIES.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCat(c.id)}
                className={cn(
                  'fx-press rounded-full px-3 py-1 text-[11px] font-medium transition-colors duration-1',
                  cat === c.id
                    ? 'bg-fx-gold/15 text-foreground ring-1 ring-inset ring-fx-gold/30'
                    : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                )}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        {visible(CARD_META.providers) && (
        <Card>
          <CardHeader>
            <CardTitle>Providers</CardTitle>
            <CardDescription>Add and manage AI provider connections.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Type</Label>
                <Select value={newType} onValueChange={handleTypeChange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(PROVIDER_PRESETS).map(([key, p]) => (
                      <SelectItem key={key} value={key}>{p.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Name</Label>
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder={PROVIDER_PRESETS[newType]?.label || 'Provider name'}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Base URL</Label>
              <Input
                value={newBaseUrl}
                onChange={(e) => setNewBaseUrl(e.target.value)}
                placeholder="https://api.example.com/v1"
              />
              {detectedType && (
                <p className="flex items-center gap-1 text-xs text-muted-foreground">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-fx-gold" />
                  Detected: <span className="font-medium text-foreground">{detectedType}</span>
                </p>
              )}
              {detecting && <p className="text-xs text-muted-foreground/70">Detecting endpoint…</p>}
            </div>
            {PROVIDER_PRESETS[newType]?.needsKey !== false && (
              <div className="space-y-1.5">
                <Label>API Key</Label>
                <div className="relative">
                  <Input
                    type={showNewKey ? 'text' : 'password'}
                    value={newApiKey}
                    onChange={(e) => setNewApiKey(e.target.value)}
                    placeholder="sk-..."
                    className="pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-full w-10"
                    onClick={() => setShowNewKey(!showNewKey)}
                  >
                    {showNewKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            )}
            <Button onClick={handleAddProvider} className="self-start">
              <Plus className="mr-2 h-4 w-4" /> Add Provider
            </Button>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" onClick={handleTestConfig} disabled={testingConfig}>
                {testingConfig ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                Test connection
              </Button>
            </div>
            {configTest && (
              <div className="space-y-1.5 rounded-md border bg-muted/30 p-2.5">
                {configTest.ok && configTest.capabilities && <CapabilityChips capabilities={configTest.capabilities} />}
                <p className={cn('text-xs', configTest.ok ? 'text-green-600 dark:text-green-400' : 'text-destructive')}>
                  {configTest.ok
                    ? `Connected (${configTest.latencyMs}ms)${configTest.models?.length ? ` · ${configTest.models.length} models found` : ''}`
                    : configTest.error || 'Connection failed'}
                </p>
              </div>
            )}

            {providers.length > 0 && (
              <>
                <Separator />
                <div className="space-y-3">
                  {providers.map((provider) => {
                    const testResult = testResults[provider.id]
                    const isExpanded = expandedModels[provider.id]
                    const secret = secretSummary(provider)
                    const storage = storageLabel(provider)
                    return (
                      <div key={provider.id} className="rounded-lg border p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div
                              className={cn(
                                'h-2.5 w-2.5 rounded-full',
                                testResult
                                  ? testResult.ok ? 'bg-green-500' : 'bg-red-500'
                                  : 'bg-muted-foreground/30'
                              )}
                            />
                            <span className="font-medium text-sm">{provider.name}</span>
                            <Badge variant="secondary" className="text-[10px]">{provider.type}</Badge>
                          </div>
                          <Switch
                            checked={provider.enabled}
                            onCheckedChange={() => handleToggleEnabled(provider)}
                          />
                        </div>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <span className="truncate max-w-[200px]">{provider.baseUrl}</span>
                          <Badge variant={secret.variant} className="text-[10px]">{secret.label}</Badge>
                          {storage && <span>{storage}</span>}
                        </div>
                        {provider.capabilities && (
                          <CapabilityChips capabilities={provider.capabilities} />
                        )}
                        <div className="flex items-center gap-1.5">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => handleTestConnection(provider.id)}
                            disabled={testingId === provider.id}
                          >
                            {testingId === provider.id ? (
                              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                            ) : (
                              <RefreshCw className="mr-1 h-3 w-3" />
                            )}
                            Test
                          </Button>
                          {provider.secret?.configured && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() => handleRotateSecret(provider)}
                              disabled={rotatingId === provider.id}
                            >
                              {rotatingId === provider.id ? (
                                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                              ) : (
                                <RefreshCw className="mr-1 h-3 w-3" />
                              )}
                              Re-encrypt
                            </Button>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => toggleModels(provider.id)}
                          >
                            Models
                            {isExpanded ? <ChevronUp className="ml-1 h-3 w-3" /> : <ChevronDown className="ml-1 h-3 w-3" />}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => openEditDialog(provider)}
                          >
                            <Pencil className="mr-1 h-3 w-3" /> Edit
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs text-destructive hover:text-destructive"
                            onClick={() => setDeleteTarget(provider)}
                          >
                            <Trash2 className="mr-1 h-3 w-3" /> Delete
                          </Button>
                        </div>
                        {testResult && (
                          <div className={cn(
                            'text-xs',
                            testResult.ok ? 'text-green-600 dark:text-green-400' : 'text-destructive'
                          )}>
                            {testResult.ok
                              ? `Connected (${testResult.latencyMs}ms)`
                              : testResult.error || 'Connection failed'}
                          </div>
                        )}
                        {isExpanded && (
                          <div className="mt-2 space-y-1 rounded-md bg-muted/50 p-2">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-medium text-muted-foreground">Configured models</span>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 gap-1 text-xs"
                                disabled={refreshingId === provider.id}
                                onClick={async () => {
                                  setRefreshingId(provider.id)
                                  setRefreshError((r) => ({ ...r, [provider.id]: '' }))
                                  try {
                                    const models = await refreshModels(provider.id)
                                    if (models.length === 0) {
                                      setRefreshError((r) => ({ ...r, [provider.id]: 'No models returned. Check the base URL and key.' }))
                                    }
                                    await loadProviders()
                                  } catch (e) {
                                    setRefreshError((r) => ({ ...r, [provider.id]: e instanceof Error ? e.message : 'Refresh failed' }))
                                  } finally {
                                    setRefreshingId(null)
                                  }
                                }}
                              >
                                {refreshingId === provider.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                                Refresh from API
                              </Button>
                            </div>
                            {refreshError[provider.id] && <p className="text-xs text-destructive">{refreshError[provider.id]}</p>}
                            {provider.models.length === 0 ? (
                              <p className="text-xs text-muted-foreground">No models configured.</p>
                            ) : (
                              provider.models.map((model) => (
                                <div key={model.id} className="flex items-center justify-between gap-2 text-xs">
                                  <div className="flex min-w-0 flex-1 flex-col">
                                    <span className="truncate font-medium">{model.name || model.id}</span>
                                    <span className="truncate text-[10px] text-muted-foreground/70">{model.id}</span>
                                  </div>
                                  <div className="flex shrink-0 items-center gap-1">
                                    {model.supportsVision && (
                                      <Badge variant="secondary" className="text-[10px]">vision</Badge>
                                    )}
                                    {model.contextWindow && (
                                      <Badge variant="outline" className="text-[10px]">
                                        {(model.contextWindow / 1000).toFixed(0)}K ctx
                                      </Badge>
                                    )}
                                    {model.maxOutputTokens && (
                                      <Badge variant="outline" className="text-[10px]">
                                        {Math.round(model.maxOutputTokens / 1000)}K out
                                      </Badge>
                                    )}
                                  </div>
                                </div>
                              ))
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </CardContent>
        </Card>
        )}

        {visible(CARD_META.diagnostics) && (
        <Card>
          <CardHeader>
            <CardTitle>Provider Diagnostics</CardTitle>
            <CardDescription>Connection health summary for configured providers.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {providers.length === 0 ? (
              <p className="text-sm text-muted-foreground">No providers configured.</p>
            ) : (
              providers.map((provider) => {
                const tr = testResults[provider.id]
                return (
                  <div key={provider.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div className={cn(
                        'h-2.5 w-2.5 rounded-full',
                        tr ? (tr.ok ? 'bg-green-500' : 'bg-red-500') : provider.enabled ? 'bg-fx-gold' : 'bg-muted-foreground/30'
                      )} />
                      <span className="text-sm font-medium">{provider.name}</span>
                      <Badge variant="secondary" className="text-[10px]">{provider.type}</Badge>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>{provider.models.length} models</span>
                      {tr
                        ? (tr.ok ? <span className="text-green-600 dark:text-green-400">{tr.latencyMs}ms</span> : <span className="text-destructive">failed</span>)
                        : <span>{provider.enabled ? 'not tested' : 'disabled'}</span>}
                      {provider.apiKey ? <span className="text-muted-foreground/70">key ✓</span> : <span className="text-amber-500">no key</span>}
                    </div>
                  </div>
                )
              })
            )}
          </CardContent>
        </Card>
        )}

        {visible(CARD_META.general) && (
        <Card>
          <CardHeader>
            <CardTitle>General</CardTitle>
            <CardDescription>Application preferences and defaults.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Theme</Label>
                <p className="text-xs text-muted-foreground">Switch between dark, light, and system theme.</p>
              </div>
              <Select value={theme} onValueChange={(v: 'dark' | 'light' | 'system') => setTheme(v)}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="dark">Dark</SelectItem>
                  <SelectItem value="light">Light</SelectItem>
                  <SelectItem value="system">System</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Temperature</Label>
                <p className="text-xs text-muted-foreground">Controls randomness. Lower = more focused.</p>
              </div>
              <Input
                type="number"
                min={0}
                max={2}
                step={0.1}
                value={temperature}
                onChange={(e) => updateSettings({ temperature: parseFloat(e.target.value) || 0 } as any)}
                className="w-[100px] text-right"
              />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Max Tokens</Label>
                <p className="text-xs text-muted-foreground">Maximum tokens in assistant responses.</p>
              </div>
              <Select
                value={String(maxTokens)}
                onValueChange={(v) => updateSettings({ maxTokens: parseInt(v) } as any)}
              >
                <SelectTrigger className="w-[120px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MAX_TOKEN_OPTIONS.map((n) => (
                    <SelectItem key={n} value={String(n)}>{n.toLocaleString()}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Streaming</Label>
                <p className="text-xs text-muted-foreground">Stream responses token by token.</p>
              </div>
              <Switch
                checked={streaming}
                onCheckedChange={(v) => updateSettings({ streamingEnabled: v })}
              />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Memory</Label>
                <p className="text-xs text-muted-foreground">Allow AI to recall previous context.</p>
              </div>
              <Switch
                checked={memory}
                onCheckedChange={(v) => updateSettings({ memoryEnabled: v } as any)}
              />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Notifications</Label>
                <p className="text-xs text-muted-foreground">Show in-app notifications.</p>
              </div>
              <Switch
                checked={notifications}
                onCheckedChange={(v) => updateSettings({ notificationsEnabled: v })}
              />
            </div>
          </CardContent>
        </Card>
        )}

        {visible(CARD_META.workspace) && (
        <Card>
          <CardHeader>
            <CardTitle>Workspace Information</CardTitle>
            <CardDescription>Registered project workspaces and their index state.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {workspaces.length === 0 ? (
              <p className="text-sm text-muted-foreground">No workspaces registered yet.</p>
            ) : (
              workspaces.map((ws) => {
                const idx = indexes[ws.id]
                return (
                  <div key={ws.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <FolderOpen className="h-4 w-4 shrink-0 text-fx-gold" />
                      <span className="truncate text-sm font-medium">{ws.name}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="max-w-[260px] truncate font-mono">{ws.path || 'no path'}</span>
                      {idx ? (
                        <Badge variant="success" className="text-[10px]">{idx.fileCount} files indexed</Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px]">not indexed</Badge>
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </CardContent>
        </Card>
        )}

        {visible(CARD_META.backup) && (
        <Card>
          <CardHeader>
            <CardTitle>Backup & Restore</CardTitle>
            <CardDescription>Manage database backups and data portability.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {dataDir && (
              <div className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-2 text-xs">
                <span className="text-muted-foreground">Data directory</span>
                <span className="font-mono">{dataDir}</span>
              </div>
            )}
            <Button onClick={handleCreateBackup} disabled={creatingBackup} className="w-full" variant="outline">
              {creatingBackup ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Create Backup Now
            </Button>
            {backups.length > 0 && (
              <>
                <Separator />
                <div className="space-y-2">
                  <Label>Backups</Label>
                  {backups.map((backup) => (
                    <div key={backup.name} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-mono text-xs">{backup.name}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {formatBytes(backup.size)} · {formatDateTime(backup.createdAt)}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="ml-2 h-7 text-xs"
                        onClick={() => handleRestoreBackup(backup.path)}
                      >
                        Restore
                      </Button>
                    </div>
                  ))}
                </div>
              </>
            )}
            <Separator />
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => exportAll()}>
                Export All Data
              </Button>
              <Button variant="outline" className="flex-1" onClick={handleValidateImport}>
                Import All Data
              </Button>
            </div>
          </CardContent>
        </Card>
        )}

        <Dialog open={!!restoreTarget} onOpenChange={(open) => { if (!open && !restoring) setRestoreTarget(null) }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Restore this backup?</DialogTitle>
              <DialogDescription>
                {restoreTarget?.name} will replace the current database after an integrity check. A pre-restore copy is kept.
                Fluxora will restart automatically.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRestoreTarget(null)} disabled={restoring}>Cancel</Button>
              <Button variant="destructive" onClick={performRestore} disabled={restoring}>
                {restoring ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Restore backup
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={!!importPreview} onOpenChange={(open) => { if (!open && !importing) setImportPreview(null) }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Import this data?</DialogTitle>
              <DialogDescription>
                The file is validated before import. A safety backup is created first. Provider credentials are never imported:
                re-enter them if this is a different device.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 text-sm">
              {Object.entries(importPreview?.counts || {}).filter(([, value]) => Number(value) > 0).map(([key, value]) => (
                <div key={key} className="flex items-center justify-between rounded-md border px-3 py-1.5">
                  <span className="capitalize text-muted-foreground">{key}</span>
                  <span className="font-mono text-xs">{String(value)}</span>
                </div>
              ))}
              {importPreview?.warnings?.length > 0 && (
                <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                  {importPreview.warnings.join(' ')}
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setImportPreview(null)} disabled={importing}>Cancel</Button>
              <Button onClick={performImport} disabled={importing}>
                {importing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Import data
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {visible(CARD_META.system) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Cpu className="h-4 w-4 text-fx-gold" /> System Information</CardTitle>
            <CardDescription>Runtime environment of this application.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {sysInfo ? (
              <>
                <InfoRow label="App version" value={fmt(sysInfo.appVersion)} />
                <InfoRow label="Electron" value={fmt(sysInfo.electronVersion)} />
                <InfoRow label="Node" value={fmt(sysInfo.nodeVersion)} />
                <InfoRow label="Chrome" value={fmt(sysInfo.chromeVersion)} />
                <InfoRow label="V8" value={fmt(sysInfo.v8Version)} />
                <InfoRow label="Platform" value={`${fmt(sysInfo.platform)} / ${fmt(sysInfo.arch)}`} />
                <InfoRow label="Operating system" value={`${fmt(sysInfo.osType)} ${fmt(sysInfo.osRelease)} ${fmt(sysInfo.osArch)}`} />
                <InfoRow label="Hostname" value={fmt(sysInfo.hostname)} />
                <InfoRow label="Locale" value={fmt(sysInfo.locale)} />
                <InfoRow label="CPU" value={`${fmt(sysInfo.cpuCount)} × ${fmt(sysInfo.cpuModel)}`} />
                <InfoRow label="Memory" value={`${formatBytes(sysInfo.totalMem || 0)} total · ${formatBytes(sysInfo.freeMem || 0)} free`} />
                <InfoRow label="Uptime" value={`${Math.round((sysInfo.uptime || 0) / 60)} min`} />
                <InfoRow label="Data dir" value={fmt(sysInfo.dataDir)} />
              </>
            ) : (
              <p className="text-sm text-muted-foreground">System information unavailable.</p>
            )}
          </CardContent>
        </Card>
        )}

        {visible(CARD_META.database) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Database className="h-4 w-4 text-fx-gold" /> Database Information</CardTitle>
            <CardDescription>Local SQLite storage statistics.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {dbInfo ? (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-md bg-muted/50 p-2.5">
                    <p className="text-[11px] text-muted-foreground">Database file</p>
                    <p className="text-sm font-medium">{formatBytes(dbInfo.sizes?.db || 0)}</p>
                  </div>
                  <div className="rounded-md bg-muted/50 p-2.5">
                    <p className="text-[11px] text-muted-foreground">WAL + SHM</p>
                    <p className="text-sm font-medium">{formatBytes((dbInfo.sizes?.wal || 0) + (dbInfo.sizes?.shm || 0))}</p>
                  </div>
                </div>
                <InfoRow label="Journal mode" value={fmt(dbInfo.journalMode)} />
                <Separator />
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                  {(dbInfo.tables || []).map((t: any) => (
                    <div key={t.name} className="flex items-center justify-between text-sm">
                      <span className="truncate font-mono text-xs text-muted-foreground">{t.name}</span>
                      <span className="font-medium">{t.count < 0 ? '—' : t.count.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Database information unavailable.</p>
            )}
          </CardContent>
        </Card>
        )}

        {visible(CARD_META.performance) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Activity className="h-4 w-4 text-fx-gold" /> Performance Statistics</CardTitle>
            <CardDescription>Runtime memory and model usage aggregates.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {analytics ? (
              <>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Process memory used</span>
                    <span className="font-mono">{formatBytes(analytics.rss || 0)}</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-fx-gold/70" style={{ width: `${Math.min(100, Math.round(((analytics.rss || 0) / 2147483648) * 100))}%` }} />
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Heap used</span>
                    <span className="font-mono">{formatBytes(analytics.heapUsed || 0)}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">System memory load</span>
                    <span className="font-mono">{analytics.memUsagePct ?? '—'}%</span>
                  </div>
                  <InfoRow label="Uptime" value={`${Math.round((analytics.uptime || 0) / 60)} min`} />
                </div>
                <Separator />
                {analytics.usage && analytics.counts ? (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="rounded-md bg-muted/50 p-2.5">
                        <p className="text-[11px] text-muted-foreground">Requests</p>
                        <p className="text-sm font-medium">{(analytics.usage.requests || 0).toLocaleString()}</p>
                      </div>
                      <div className="rounded-md bg-muted/50 p-2.5">
                        <p className="text-[11px] text-muted-foreground">Success rate</p>
                        <p className="text-sm font-medium">{Math.round((analytics.usage.successRate || 0) * 100)}%</p>
                      </div>
                      <div className="rounded-md bg-muted/50 p-2.5">
                        <p className="text-[11px] text-muted-foreground">Tokens</p>
                        <p className="text-sm font-medium">{(analytics.usage.totalTokens || 0).toLocaleString()}</p>
                      </div>
                      <div className="rounded-md bg-muted/50 p-2.5">
                        <p className="text-[11px] text-muted-foreground">Est. cost</p>
                        <p className="text-sm font-medium">${(analytics.usage.cost || 0).toFixed(4)}</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      <InfoRow label="Conversations" value={(analytics.usage.conversations || 0).toLocaleString()} />
                      <InfoRow label="Avg response" value={`${Math.round(analytics.usage.avgResponseMs || 0)}ms`} />
                      <InfoRow label="Chats" value={(analytics.counts.chats || 0).toLocaleString()} />
                      <InfoRow label="Messages" value={(analytics.counts.messages || 0).toLocaleString()} />
                      <InfoRow label="Memories" value={(analytics.counts.memories || 0).toLocaleString()} />
                      <InfoRow label="Prompts" value={(analytics.counts.prompts || 0).toLocaleString()} />
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">No usage recorded yet.</p>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Performance statistics unavailable.</p>
            )}
          </CardContent>
        </Card>
        )}

        {visible(CARD_META.danger) && (
        <Card className="border-destructive/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-4 w-4" /> Danger Zone
            </CardTitle>
            <CardDescription>Irreversible actions that affect all data.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="destructive" onClick={() => setShowResetDialog(true)}>
              Reset All Data
            </Button>
          </CardContent>
        </Card>
        )}
      </div>

      <Dialog open={editOpen} onOpenChange={(open) => { if (!open) { setEditOpen(false); setEditData(null) } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Provider</DialogTitle>
            <DialogDescription>Update provider connection settings.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Base URL</Label>
              <Input value={editBaseUrl} onChange={(e) => setEditBaseUrl(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>API Key</Label>
              <div className="relative">
                <Input
                  type={showEditKey ? 'text' : 'password'}
                  value={editApiKey}
                  onChange={(e) => setEditApiKey(e.target.value)}
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full w-10"
                  onClick={() => setShowEditKey(!showEditKey)}
                >
                  {showEditKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setEditOpen(false); setEditData(null) }}>Cancel</Button>
            <Button onClick={handleSaveEdit}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Provider</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{deleteTarget?.name}&quot;? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showResetDialog} onOpenChange={setShowResetDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive">Reset All Data</DialogTitle>
            <DialogDescription>
              This will permanently delete all providers, chats, messages, memories, prompts, and usage data. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowResetDialog(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleReset}>Reset Everything</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ScrollArea>
  )
}
