import { create } from 'zustand'
import type { Chat, Message } from '../types'
import type { FullWindowApi } from '../types/api'
import { useSettingsStore, patchSettings } from './settingsStore'
import { useProviderStore } from './providerStore'
import { useWorkspaceStore } from './workspaceStore'
import { buildSmartContext } from '@/lib/contextBuilder'

declare global {
  interface Window {
    api: FullWindowApi
  }
}

const api = () => window.api

// Cleanup for the listeners of the stream currently in flight.
// Owned by the most recent streamMessage call so stop/unmount can release them.
let streamCleanup: (() => void) | null = null

function modelDisplayName(raw?: string | null): string | undefined {
  if (!raw) return undefined
  const provider = useProviderStore.getState().providers.find((x) => x.models?.some((m) => m.id === raw))
  return provider?.models.find((m) => m.id === raw)?.name || raw
}

function persistLastChat(chatId: string | null) {
  if (!chatId) return
  patchSettings({ lastChatId: chatId })
}

export interface ChatStore {
  chats: Chat[]
  currentChatId: string | null
  messages: Message[]
  isLoading: boolean
  isStreaming: boolean
  streamingContent: string
  error: string | null
  searchQuery: string
  filteredChats: Chat[]
  activeRequestId: string | null

  // Chat CRUD
  loadChats: (workspaceId: string) => Promise<void>
  createChat: (data: { workspaceId: string; title?: string }) => Promise<Chat>
  updateChat: (id: string, data: Partial<Chat>) => Promise<Chat | null>
  deleteChat: (id: string) => Promise<void>
  setCurrentChat: (id: string | null) => void
  searchChats: (workspaceId: string, query: string) => Promise<void>

  // Message operations
  loadMessages: (chatId: string) => Promise<void>
  addUserMessage: (content: string, files?: any[]) => Promise<Message>
  addAssistantMessage: (content: string, model?: string, usage?: any) => Promise<Message>
  updateMessage: (id: string, data: Partial<Message>) => Promise<void>

  // AI operations
  streamMessage: (content: string, files?: any[]) => Promise<void>
  cleanup: () => void
  stopStreaming: () => void
  regenerateLastMessage: () => Promise<void>

  // Export/Import
  exportChat: (chatId: string) => Promise<string | null>
  importChat: () => Promise<string | null>

  setSearchQuery: (query: string) => void
  clearError: () => void
}

export const useChatStore = create<ChatStore>((set, get) => ({
  chats: [],
  currentChatId: null,
  cleanup: () => {
    // Called on unmount and before a new stream starts.
    streamCleanup?.()
  },
  messages: [],
  isLoading: false,
  isStreaming: false,
  streamingContent: '',
  error: null,
  searchQuery: '',
  filteredChats: [],
  activeRequestId: null,

  loadChats: async (workspaceId: string) => {
    const chats = await api().chat.list(workspaceId)
    set({ chats, filteredChats: chats })
  },

  createChat: async (data) => {
    const chat = await api().chat.create(data)
    set((state) => ({
      chats: [chat, ...state.chats],
      filteredChats: [chat, ...state.filteredChats],
      currentChatId: chat.id,
      messages: [],
    }))
    persistLastChat(chat.id)
    try {
      void api()?.developer?.track('chat_created', {
        key: chat.id,
        workspaceId: data.workspaceId,
      })
    } catch {
      /* tracking is best-effort */
    }
    return chat
  },

  updateChat: async (id, data) => {
    const updated = await api().chat.update(id, data)
    if (updated) {
      set((state) => ({
        chats: state.chats.map((c) => (c.id === id ? updated : c)),
        filteredChats: state.filteredChats.map((c) => (c.id === id ? updated : c)),
      }))
    }
    return updated
  },

  deleteChat: async (id) => {
    await api().chat.delete(id)
    const state = get()
    const newChats = state.chats.filter((c) => c.id !== id)
    const newFiltered = state.filteredChats.filter((c) => c.id !== id)
    const wasCurrent = state.currentChatId === id
    const nextId = wasCurrent ? newChats[0]?.id || null : state.currentChatId
    set({
      chats: newChats,
      filteredChats: newFiltered,
      currentChatId: nextId,
      messages: wasCurrent ? [] : state.messages,
    })
    if (wasCurrent && nextId) get().loadMessages(nextId)
  },

  setCurrentChat: (id) => {
    set({ currentChatId: id })
    persistLastChat(id)
    if (id) get().loadMessages(id)
    else set({ messages: [] })
  },

  searchChats: async (workspaceId, query) => {
    if (!query.trim()) {
      set((state) => ({ filteredChats: state.chats, searchQuery: query }))
      return
    }
    const results = await api().chat.search(workspaceId, query)
    set({ filteredChats: results, searchQuery: query })
  },

  loadMessages: async (chatId) => {
    const messages = await api().chat.messages(chatId)
    set({ messages })
  },

  addUserMessage: async (content, files) => {
    const { currentChatId } = get()
    if (!currentChatId) throw new Error('No chat selected')
    const msg = await api().chat.addMessage({
      chatId: currentChatId,
      role: 'user',
      content,
      files,
    })
    set((state) => ({ messages: [...state.messages, msg] }))
    return msg
  },

  addAssistantMessage: async (content, model, usage) => {
    const { currentChatId } = get()
    if (!currentChatId) throw new Error('No chat selected')
    const msg = await api().chat.addMessage({
      chatId: currentChatId,
      role: 'assistant',
      content,
      model,
      usage,
    })
    set((state) => ({ messages: [...state.messages, msg] }))
    return msg
  },

  updateMessage: async (id, data) => {
    await api().chat.updateMessage(id, data)
    set((state) => ({
      messages: state.messages.map((m) => (m.id === id ? { ...m, ...data } : m)),
    }))
  },

  streamMessage: async (content, files) => {
    const state = get()
    if (!state.currentChatId) return

    // Never stack two streams: release the previous listeners first.
    streamCleanup?.()

    const settings = useSettingsStore.getState().settings

    const requestId =
      (globalThis.crypto &&
        typeof globalThis.crypto.randomUUID === 'function' &&
        globalThis.crypto.randomUUID()) ||
      `req-${Date.now()}-${Math.random().toString(36).slice(2)}`
    set({ isStreaming: true, streamingContent: '', error: null })

    try {
      const currentChat = get().chats.find((c) => c.id === state.currentChatId)
      const chatWorkspaceId = currentChat?.workspaceId || 'global'
      // Resolve defaults from the chat's own workspace — never from whichever
      // workspace happens to be active in the sidebar.
      const chatWorkspace = useWorkspaceStore
        .getState()
        .workspaces.find((w) => w.id === chatWorkspaceId)
      const workspaceDefaults =
        chatWorkspace?.settings?.defaultProviderId || chatWorkspace?.settings?.defaultModelId
          ? {
              providerId: chatWorkspace.settings?.defaultProviderId || undefined,
              modelId: chatWorkspace.settings?.defaultModelId || undefined,
            }
          : undefined

      let providerId =
        currentChat?.providerId || workspaceDefaults?.providerId || settings.defaultProviderId
      let modelId =
        currentChat?.modelId || workspaceDefaults?.modelId || settings.defaultModelId

      const autoRoute = settings.autoRoute
      if (!providerId || autoRoute) {
        const route = await api().ai.autoRoute({
          message: content,
          workspaceId: chatWorkspaceId,
        })
        if (route) {
          providerId = route.providerId
          modelId = route.modelId
        }
      }

      if (!providerId) {
        throw new Error('No AI provider configured. Please add a provider in Settings.')
      }

      // Remember the routed choice on the chat row so this chat reuses it next time.
      if (currentChat && (currentChat.providerId !== providerId || currentChat.modelId !== modelId)) {
        api()
          .chat.update(state.currentChatId, { providerId, modelId })
          .then((updated: any) => {
            if (updated) {
              set((s) => ({
                chats: s.chats.map((c) => (c.id === updated.id ? updated : c)),
                filteredChats: s.filteredChats.map((c) => (c.id === updated.id ? updated : c)),
              }))
            }
          })
          .catch(() => {})
      }

      const temperature = settings.temperature ?? 0.7
      const maxTokens = settings.maxTokens ?? 4096

      let chunkUnsub: (() => void) | null = null
      let doneUnsub: (() => void) | null = null
      let errorUnsub: (() => void) | null = null

      const cleanup = () => {
        chunkUnsub?.()
        doneUnsub?.()
        errorUnsub?.()
        chunkUnsub = null
        doneUnsub = null
        errorUnsub = null
        if (streamCleanup === cleanup) streamCleanup = null
      }
      streamCleanup = cleanup

      chunkUnsub = api().ai.onChunk((data: any) => {
        if (data.requestId !== requestId) return
        set((s) => ({
          streamingContent: s.streamingContent + data.delta,
          isStreaming: true,
        }))
      })

      doneUnsub = api().ai.onDone(async (data: any) => {
        if (data.requestId !== requestId) return
        cleanup()
        try {
          const { currentChatId } = get()
          if (currentChatId && data.content) {
            const msg = await api().chat.addMessage({
              chatId: currentChatId,
              role: 'assistant',
              content: data.content,
              model: modelDisplayName(data.model) || data.model,
              usage: {
                ...(data.usage || {}),
                cost: data.cost || 0,
                responseTimeMs: data.responseTimeMs || 0,
              },
              status: 'complete',
            })
            set((s) => ({ messages: [...s.messages, msg] }))

            if (data.usage && providerId) {
              await api().usage.record({
                providerId,
                model: modelDisplayName(data.model) || modelDisplayName(modelId) || data.model || modelId,
                chatId: currentChatId,
                promptTokens: data.usage.promptTokens,
                completionTokens: data.usage.completionTokens,
                totalTokens: data.usage.totalTokens,
                cost: data.cost || 0,
                responseTimeMs: data.responseTimeMs || 0,
                streaming: 1,
                status: 'success',
              })
            }
          }
        } catch (err: any) {
          set({ error: err?.message || 'Could not save the assistant response.' })
        } finally {
          // Persistence and usage recording are best-effort; the UI must never
          // stay stuck in a streaming state because one of them failed.
          set({ isStreaming: false, streamingContent: '', activeRequestId: null })
        }
      })

      errorUnsub = api().ai.onError((data: any) => {
        if (data.requestId !== requestId) return
        cleanup()
        set({ isStreaming: false, streamingContent: '', activeRequestId: null, error: data.error })
      })

      const allMessages = get().messages.map((m) => ({
        role: m.role,
        content: m.content,
      }))

      const trimmedMessages = allMessages.length > 60 ? allMessages.slice(-60) : allMessages

      const workspaceSettings = await api().memory.getSettings(chatWorkspaceId)
      const memoryEnabled = workspaceSettings?.memoryEnabled !== false
      let enrichedMessages = trimmedMessages
      try {
        const ctx = await buildSmartContext({
          prompt: content,
          workspaceId: chatWorkspaceId,
          memoryEnabled,
        })
        if (ctx.system) {
          enrichedMessages = [{ role: 'system' as const, content: ctx.system }, ...trimmedMessages]
        }
      } catch {
        enrichedMessages = trimmedMessages
      }

      let llmMessages = enrichedMessages
      if (files && files.length > 0) {
        const excerpts: string[] = []
        for (const f of files) {
          try {
            const res: any = await api().workspace.readFile(f.path)
            if (res?.content) {
              const cap = 4000
              const body = res.content.length > cap ? res.content.slice(0, cap) + '\n…(truncated)' : res.content
              excerpts.push(`[Attached file: ${f.name}]\n\`\`\`\n${body}\n\`\`\``)
            } else {
              excerpts.push(`[Attached file: ${f.name}] (could not be read)`)
            }
          } catch {
            excerpts.push(`[Attached file: ${f.name}] (could not be read)`)
          }
        }
        const last = enrichedMessages.length - 1
        if (last >= 0 && enrichedMessages[last].role === 'user') {
          llmMessages = enrichedMessages.map((m, i) =>
            i === last ? { ...m, content: `${m.content}\n\n${excerpts.join('\n\n')}` } : m
          )
        }
      }

      try {
        void api()?.developer?.track('ai_request', {
          key: providerId || null,
          value: modelId || null,
          workspaceId: chatWorkspaceId,
        })
      } catch {
        /* tracking is best-effort */
      }

      api().ai.streamChat({
        requestId,
        providerId,
        modelId,
        messages: llmMessages,
        temperature,
        maxTokens,
        chatId: state.currentChatId,
        workspaceId: chatWorkspaceId,
      })
      set({ activeRequestId: requestId })
    } catch (err: any) {
      streamCleanup?.()
      set({ isStreaming: false, streamingContent: '', activeRequestId: null, error: err.message })
    }
  },

  stopStreaming: () => {
    const { activeRequestId } = get()
    if (activeRequestId) api().ai.stop(activeRequestId)
    // Release the listeners immediately instead of waiting for an event that
    // will never arrive once the stream has been aborted.
    streamCleanup?.()
    set({ isStreaming: false, streamingContent: '', activeRequestId: null })
  },

  regenerateLastMessage: async () => {
    const { messages, currentChatId } = get()
    if (!currentChatId || messages.length < 2) return
    const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant')
    if (lastAssistant) {
      await api().chat.deleteMessage?.(lastAssistant.id)
      set((s) => ({ messages: s.messages.filter((m) => m.id !== lastAssistant.id) }))
    }
    const userMsg = [...messages].reverse().find((m) => m.role === 'user')
    if (userMsg) {
      // Preserve the original attachments so the retry keeps its file context.
      await get().streamMessage(userMsg.content, userMsg.files)
    }
  },

  exportChat: async (chatId) => {
    return api().chat.exportChat(chatId)
  },

  importChat: async () => {
    const newChatId = await api().chat.importChat()
    if (newChatId) {
      await get().loadChats('global')
      set({ currentChatId: newChatId })
    }
    return newChatId
  },

  setSearchQuery: (query) => {
    set({ searchQuery: query })
    if (!query.trim()) {
      set((state) => ({ filteredChats: state.chats }))
    }
  },

  clearError: () => set({ error: null }),
}))