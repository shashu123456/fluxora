import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import React from 'react'

const { storeRef } = vi.hoisted(() => ({ storeRef: { current: null as any } }))

vi.mock('@/stores/apiDiscoveryStore', () => ({
  useApiDiscoveryStore: () => storeRef.current,
}))

import { ApiDiscoverySettings } from '../../src/components/settings/ApiDiscoverySettings'

function makeEntry(overrides: any = {}) {
  return {
    id: 'test-api',
    name: 'Test API',
    category: 'Testing',
    description: 'A test API for component coverage',
    freeTier: 'Free tier available',
    risk: 'low',
    tags: ['test'],
    verifiedAt: '2026-11-06',
    verification: {
      status: 'ok',
      httpStatus: 200,
      checkedAt: '2026-11-06',
      note: undefined,
    },
    authType: 'none',
    connected: false,
    enabled: false,
    fingerprint: null,
    docsUrl: 'https://example.test/docs',
    baseUrl: 'https://api.example.test',
    ...overrides,
  }
}

function makeDetailView(overrides: any = {}) {
  return {
    id: 'test-api',
    name: 'Test API',
    category: 'Testing',
    description: 'A test API for component coverage',
    freeTier: 'Free tier available',
    risk: 'low',
    tags: ['test'],
    verifiedAt: '2026-11-06',
    verification: { status: 'ok', httpStatus: 200, checkedAt: '2026-11-06', note: undefined },
    authType: 'none',
    authLabel: 'No key required',
    connected: false,
    fingerprint: null,
    docsUrl: 'https://example.test/docs',
    baseUrl: 'https://api.example.test',
    responseNotes: 'JSON',
    sample: { host: 'api.example.test', path: '/v1/test', query: {} },
    ...overrides,
  }
}

function makeCatalog(entries: any[] = [], overrides: any = {}) {
  return {
    load: vi.fn().mockResolvedValue(undefined),
    loadDetail: vi.fn().mockResolvedValue(makeDetailView()),
    connect: vi.fn().mockResolvedValue(null),
    disconnect: vi.fn().mockResolvedValue(null),
    test: vi.fn().mockResolvedValue({ ok: true, requestId: 'r1', status: 200, durationMs: 10, bytes: 100, contentType: 'application/json', preview: 'hello', truncated: false, error: undefined }),
    loadAudit: vi.fn().mockResolvedValue(undefined),
    items: entries,
    meta: { version: '1.0.0', verifiedAt: '2026-11-06', total: entries.length, categories: 1 },
    audit: [],
    loading: false,
    auditLoading: false,
    error: null,
    ...overrides,
  }
}

describe('API Discovery Settings card', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the beta badge', () => {
    storeRef.current = makeCatalog([makeEntry()])
    render(<ApiDiscoverySettings />)
    expect(screen.getByText(/beta/i)).toBeInTheDocument()
  })

  it('shows honest verification status for a working entry', async () => {
    const entry = makeEntry({ verification: { status: 'ok', httpStatus: 200, checkedAt: '2026-11-06', note: undefined } })
    const store = makeCatalog([entry])
    store.loadDetail = vi.fn().mockResolvedValue(makeDetailView({ verification: { status: 'ok', httpStatus: 200, checkedAt: '2026-11-06', note: undefined } }))
    storeRef.current = store
    render(<ApiDiscoverySettings />)
    // Click the catalog item button to open detail
    const itemBtn = await screen.findByRole('button', { name: /test api/i }, { timeout: 5000 })
    await itemBtn.click()
    await waitFor(() => expect(screen.getByText(/Verified working: HTTP 200/i)).toBeInTheDocument(), { timeout: 5000 })
  })

  it('shows honest status for a rate-limited entry', async () => {
    const entry = makeEntry({ verification: { status: 'rate-limited', httpStatus: 429, checkedAt: '2026-11-06', note: 'Rate limited; quota note.' } })
    const store = makeCatalog([entry])
    store.loadDetail = vi.fn().mockResolvedValue(makeDetailView({ verification: { status: 'rate-limited', httpStatus: 429, checkedAt: '2026-11-06', note: 'Rate limited; quota note.' } }))
    storeRef.current = store
    render(<ApiDiscoverySettings />)
    const itemBtn = await screen.findByRole('button', { name: /test api/i }, { timeout: 5000 })
    await itemBtn.click()
    await waitFor(() => expect(screen.getByText(/Quota-limited at check/i)).toBeInTheDocument(), { timeout: 5000 })
  })

  it('shows honest status for an unreachable entry', async () => {
    const entry = makeEntry({ verification: { status: 'unreachable', httpStatus: null, checkedAt: '2026-11-06', note: 'Unreachable at verification.' } })
    const store = makeCatalog([entry])
    store.loadDetail = vi.fn().mockResolvedValue(makeDetailView({ verification: { status: 'unreachable', httpStatus: null, checkedAt: '2026-11-06', note: 'Unreachable at verification.' } }))
    storeRef.current = store
    render(<ApiDiscoverySettings />)
    const itemBtn = await screen.findByRole('button', { name: /test api/i }, { timeout: 5000 })
    await itemBtn.click()
    await waitFor(() => expect(screen.getByText(/Unreachable at check/i)).toBeInTheDocument(), { timeout: 5000 })
  })

  it('renders search filter', () => {
    storeRef.current = makeCatalog([makeEntry({ name: 'Alpha API' }), makeEntry({ name: 'Beta API' })])
    render(<ApiDiscoverySettings />)
    const input = screen.getByRole('textbox', { name: /search/i })
    expect(input).toBeInTheDocument()
  })

  it('renders category filter', () => {
    storeRef.current = makeCatalog([makeEntry()])
    render(<ApiDiscoverySettings />)
    expect(screen.getByRole('combobox', { name: /category/i })).toBeInTheDocument()
  })

  it('renders authentication filter', () => {
    storeRef.current = makeCatalog([makeEntry()])
    render(<ApiDiscoverySettings />)
    expect(screen.getByRole('combobox', { name: /authentication/i })).toBeInTheDocument()
  })

  it('renders risk filter', () => {
    storeRef.current = makeCatalog([makeEntry()])
    render(<ApiDiscoverySettings />)
    expect(screen.getByRole('combobox', { name: /risk/i })).toBeInTheDocument()
  })

  it('shows empty state when no entries match the filter', async () => {
    storeRef.current = makeCatalog([makeEntry({ name: 'Hidden API' })])
    render(<ApiDiscoverySettings />)
    const input = screen.getByRole('textbox', { name: /search/i })
    fireEvent.change(input, { target: { value: 'nope' } })
    await waitFor(() => expect(screen.getByText(/No APIs match these filters/i)).toBeInTheDocument(), { timeout: 5000 })
  })

  it('shows error state when catalog fails to load', async () => {
    const store = makeCatalog([])
    store.error = 'The API catalog could not be loaded.'
    storeRef.current = store
    render(<ApiDiscoverySettings />)
    await waitFor(() => expect(screen.getByText(/could not be loaded/i)).toBeInTheDocument(), { timeout: 5000 })
  })

  it('saves a key and never shows it in the rendered tree', async () => {
    const entry = makeEntry({ authType: 'apiKey', connected: false, fingerprint: null })
    const store = makeCatalog([entry])
    store.loadDetail = vi.fn().mockResolvedValue(makeDetailView({ authType: 'apiKey', connected: false, fingerprint: null, authLabel: 'API key' }))
    storeRef.current = store
    render(<ApiDiscoverySettings />)
    const itemBtn = await screen.findByRole('button', { name: /test api/i }, { timeout: 5000 })
    await itemBtn.click()
    const keyInput = await screen.findByLabelText(/api key/i, {}, { timeout: 5000 })
    fireEvent.change(keyInput, { target: { value: 'super-secret-key-12345' } })
    const saveBtn = screen.getByRole('button', { name: /save key/i })
    await saveBtn.click()
    expect(screen.queryByText('super-secret-key-12345')).toBeNull()
  })

  it('shows connected fingerprint after connect', async () => {
    const entry = makeEntry({ authType: 'apiKey', connected: true, fingerprint: 'a1b2c3d4e5f6' })
    const store = makeCatalog([entry])
    store.loadDetail = vi.fn().mockResolvedValue(makeDetailView({ authType: 'apiKey', connected: true, fingerprint: 'a1b2c3d4e5f6', authLabel: 'API key' }))
    storeRef.current = store
    render(<ApiDiscoverySettings />)
    const itemBtn = await screen.findByRole('button', { name: /test api/i }, { timeout: 5000 })
    await itemBtn.click()
    await waitFor(() => expect(screen.getByText(/a1b2c3d4e5f6/)).toBeInTheDocument(), { timeout: 5000 })
  })

  it('shows send-test confirmation and untrusted response label', async () => {
    const entry = makeEntry({ authType: 'none', connected: false })
    const store = makeCatalog([entry])
    store.loadDetail = vi.fn().mockResolvedValue(makeDetailView({ authType: 'none', connected: false, authLabel: 'No key required' }))
    store.test = vi.fn().mockResolvedValue({ ok: true, requestId: 'r1', status: 200, durationMs: 50, bytes: 200, contentType: 'application/json', preview: 'hello', truncated: false, error: undefined })
    storeRef.current = store
    render(<ApiDiscoverySettings />)
    const itemBtn = await screen.findByRole('button', { name: /test api/i }, { timeout: 5000 })
    await itemBtn.click()
    // Click "Test request" button to show confirmation
    const testBtn = await screen.findByRole('button', { name: /test request/i }, { timeout: 5000 })
    await testBtn.click()
    // Click "Send test request" to execute
    const sendBtn = await screen.findByRole('button', { name: /send test request/i }, { timeout: 5000 })
    await sendBtn.click()
    await waitFor(() => expect(screen.getByText(/Untrusted API response/i)).toBeInTheDocument(), { timeout: 5000 })
  })

  it('clears connected state after removing credential', async () => {
    const entry = makeEntry({ authType: 'apiKey', connected: true, fingerprint: 'a1b2c3d4e5f6' })
    const store = makeCatalog([entry])
    store.loadDetail = vi.fn().mockResolvedValue(makeDetailView({ authType: 'apiKey', connected: true, fingerprint: 'a1b2c3d4e5f6', authLabel: 'API key' }))
    store.disconnect = vi.fn().mockResolvedValue(null)
    storeRef.current = store
    render(<ApiDiscoverySettings />)
    const itemBtn = await screen.findByRole('button', { name: /test api/i }, { timeout: 5000 })
    await itemBtn.click()
    const removeBtn = await screen.findByRole('button', { name: /remove credential/i }, { timeout: 5000 })
    await removeBtn.click()
    await waitFor(() => expect(store.disconnect).toHaveBeenCalled())
  })

  it('renders empty audit log initially', async () => {
    storeRef.current = makeCatalog([makeEntry()])
    render(<ApiDiscoverySettings />)
    const itemBtn = await screen.findByRole('button', { name: /test api/i }, { timeout: 5000 })
    await itemBtn.click()
    await waitFor(() => expect(screen.getByText(/No test requests recorded yet/i)).toBeInTheDocument(), { timeout: 5000 })
  })

  it('renders keyboard-accessible labelled controls', () => {
    storeRef.current = makeCatalog([makeEntry()])
    render(<ApiDiscoverySettings />)
    expect(screen.getByRole('textbox', { name: /search/i })).toHaveAccessibleName(/search/i)
  })
})