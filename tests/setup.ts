import '@testing-library/jest-dom'

// Mock window.api for all renderer tests
const noop = () => Promise.resolve(null)
const listFn = () => Promise.resolve([])

const mockApi = {
  memory: { search: listFn, list: listFn, create: noop, update: noop, delete: noop },
  prompts: { list: listFn, create: noop, update: noop, delete: noop },
  brain: { list: listFn, create: noop, update: noop, delete: noop },
  chat: { list: listFn, create: noop, update: noop, delete: noop, messages: listFn },
  workspace: {
    list: listFn, getIndex: noop, index: noop, create: noop, update: noop, delete: noop,
  },
  settings: { get: noop, update: noop },
  providers: { list: listFn, create: noop, update: noop, delete: noop },
  usage: { summary: noop, detailed: listFn, byProvider: listFn },
  search: { global: listFn },
  window: { platform: 'win32', minimize: noop, maximize: noop, close: noop },
}

if (typeof window !== 'undefined') {
  ;(window as any).api = mockApi
}

// Silence known console warnings in tests
const originalError = console.error
console.error = (...args: unknown[]) => {
  const msg = String(args[0] ?? '')
  if (msg.includes('Warning:')) return
  originalError.apply(console, args)
}
