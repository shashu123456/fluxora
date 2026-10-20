import { ipcMain, dialog, BrowserWindow } from 'electron'
import { randomUUID } from 'crypto'
import { all, get, run, transaction } from '../database'
import { Chat, Message } from '../../src/types'
import { getDataDir } from '../config'
import path from 'path'
import fs from 'fs'
import { sendNotification } from './system'

function mapChat(row: any): Chat {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    title: row.title,
    pinned: row.pinned,
    archived: row.archived,
    favorite: row.favorite,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    providerId: row.provider_id,
    modelId: row.model_id,
  }
}

function mapMessage(row: any): Message {
  return {
    id: row.id,
    chatId: row.chat_id,
    role: row.role,
    content: row.content,
    reasoning: row.reasoning,
    createdAt: row.created_at,
    model: row.model,
    providerId: row.provider_id,
    files: row.files ? JSON.parse(row.files) : undefined,
    usage: row.usage ? JSON.parse(row.usage) : undefined,
    status: row.status,
    parentId: row.parent_id,
    branchId: row.branch_id,
    tokenCount: row.token_count,
  }
}

export function registerChatIpc() {
  ipcMain.handle('chat:list', async (_e, workspaceId: string) => {
    const rows = await all<any>(
      'SELECT * FROM chats WHERE workspace_id = ? ORDER BY pinned DESC, updated_at DESC',
      [workspaceId]
    )
    return rows.map(mapChat)
  })

  ipcMain.handle('chat:get', async (_e, id: string) => {
    const row = await get<any>('SELECT * FROM chats WHERE id = ?', [id])
    return row ? mapChat(row) : null
  })

  ipcMain.handle('chat:create', async (_e, data: Partial<Chat>) => {
    const now = Date.now()
    const chat: Chat = {
      id: randomUUID(),
      workspaceId: data.workspaceId || 'global',
      title: data.title || 'New Chat',
      pinned: 0,
      archived: 0,
      favorite: 0,
      createdAt: now,
      updatedAt: now,
      providerId: data.providerId,
      modelId: data.modelId,
    }
    await run(
      'INSERT INTO chats (id, workspace_id, title, pinned, archived, favorite, provider_id, model_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [chat.id, chat.workspaceId, chat.title, chat.pinned, chat.archived, chat.favorite, chat.providerId, chat.modelId, now, now]
    )
    return chat
  })

  ipcMain.handle('chat:update', async (_e, id: string, data: Partial<Chat>) => {
    const now = Date.now()
    const current = await get<any>('SELECT * FROM chats WHERE id = ?', [id])
    if (!current) return null
    const fields: string[] = []
    const values: any[] = []
    const allowed = ['title', 'pinned', 'archived', 'favorite', 'provider_id', 'model_id']
    for (const key of allowed) {
      const tsKey = key as keyof typeof data
      if (data[tsKey] !== undefined) {
        fields.push(key)
        values.push(data[tsKey])
      }
    }
    fields.push('updated_at')
    values.push(now)
    values.push(id)
    await run(`UPDATE chats SET ${fields.map((f) => `${f} = ?`).join(', ')} WHERE id = ?`, values)
    return get<any>('SELECT * FROM chats WHERE id = ?', [id]).then(mapChat)
  })

  ipcMain.handle('chat:delete', async (_e, id: string) => {
    await transaction(async () => {
      await run('DELETE FROM messages WHERE chat_id = ?', [id])
      await run('DELETE FROM chats WHERE id = ?', [id])
    })
    return true
  })

  ipcMain.handle('chat:messages', async (_e, chatId: string) => {
    const rows = await all<any>('SELECT * FROM messages WHERE chat_id = ? ORDER BY created_at ASC, rowid ASC', [chatId])
    return rows.map(mapMessage)
  })

  ipcMain.handle('chat:add-message', async (_e, msg: Partial<Message>) => {
    const now = Date.now()
    const message: Message = {
      id: msg.id || randomUUID(),
      chatId: msg.chatId || '',
      role: msg.role || 'user',
      content: msg.content || '',
      reasoning: msg.reasoning,
      createdAt: msg.createdAt || now,
      model: msg.model,
      providerId: msg.providerId,
      files: msg.files,
      usage: msg.usage,
      status: msg.status,
      parentId: msg.parentId,
      branchId: msg.branchId,
      tokenCount: msg.tokenCount,
    }
    await run(
      'INSERT INTO messages (id, chat_id, role, content, reasoning, model, provider_id, files, usage, status, parent_id, branch_id, token_count, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        message.id, message.chatId, message.role, message.content, message.reasoning,
        message.model, message.providerId,
        message.files ? JSON.stringify(message.files) : null,
        message.usage ? JSON.stringify(message.usage) : null,
        message.status || 'complete', message.parentId || null, message.branchId || null,
        message.tokenCount || null, message.createdAt,
      ]
    )
    await run('UPDATE chats SET updated_at = ? WHERE id = ?', [now, message.chatId])
    return message
  })

  ipcMain.handle('chat:update-message', async (_e, id: string, data: Partial<Message>) => {
    const fields: string[] = []
    const values: any[] = []
    const allowed = ['content', 'reasoning', 'status', 'usage', 'model', 'provider_id', 'files', 'parent_id', 'branch_id', 'token_count']
    for (const key of allowed) {
      const tsKey = key as keyof typeof data
      if (data[tsKey] !== undefined) {
        fields.push(key)
        values.push(data[tsKey])
      }
    }
    values.push(id)
    if (fields.length === 0) return null
    await run(`UPDATE messages SET ${fields.map((f) => `${f} = ?`).join(', ')} WHERE id = ?`, values)
    return get<any>('SELECT * FROM messages WHERE id = ?', [id]).then(mapMessage)
  })

  ipcMain.handle('chat:clear-messages', async (_e, chatId: string) => {
    await run('DELETE FROM messages WHERE chat_id = ?', [chatId])
    return true
  })

  ipcMain.handle('chat:delete-message', async (_e, id: string) => {
    await run('DELETE FROM messages WHERE id = ? OR parent_id = ?', [id, id])
    return true
  })

  ipcMain.handle('chat:search', async (_e, workspaceId: string, query: string) => {
    const like = `%${query}%`
    const rows = await all<any>(
      `SELECT DISTINCT c.* FROM chats c
       LEFT JOIN messages m ON m.chat_id = c.id
       WHERE c.workspace_id = ? AND (c.title LIKE ? OR m.content LIKE ?)
       ORDER BY c.updated_at DESC`,
      [workspaceId, like, like]
    )
    return rows.map(mapChat)
  })

  ipcMain.handle('chat:export', async (_e, chatId: string) => {
    const chatRow = await get<any>('SELECT * FROM chats WHERE id = ?', [chatId])
    if (!chatRow) throw new Error('Chat not found')
    const msgRows = await all<any>('SELECT * FROM messages WHERE chat_id = ? ORDER BY created_at ASC', [chatId])
    const data = {
      app: 'ai-workspace',
      type: 'chat',
      exportedAt: new Date().toISOString(),
      chat: mapChat(chatRow),
      messages: msgRows.map(mapMessage),
    }
    const win = BrowserWindow.getFocusedWindow()
    const result = await dialog.showSaveDialog(win!, {
      title: 'Export Chat',
      defaultPath: path.join(getDataDir(), `${data.chat.title.replace(/[^\w\s]/g, '').replace(/\s+/g, '-') || 'chat'}.json`),
      filters: [{ name: 'JSON', extensions: ['json'] }],
    })
    if (result.canceled || !result.filePath) return null
    fs.writeFileSync(result.filePath, JSON.stringify(data, null, 2))
    return result.filePath
  })

  ipcMain.handle('chat:import', async (_e) => {
    const win = BrowserWindow.getFocusedWindow()
    const result = await dialog.showOpenDialog(win!, {
      title: 'Import Chat',
      filters: [{ name: 'JSON', extensions: ['json'] }],
      properties: ['openFile'],
    })
    if (result.canceled || !result.filePaths[0]) return null
    const data = JSON.parse(fs.readFileSync(result.filePaths[0], 'utf-8'))
    if (data.type !== 'chat' || !data.chat || !data.messages) {
      throw new Error('Invalid chat export file')
    }
    const now = Date.now()
    const chatId = randomUUID()
    await run(
      'INSERT INTO chats (id, workspace_id, title, pinned, archived, favorite, created_at, updated_at) VALUES (?, ?, ?, 0, 0, 0, ?, ?)',
      [chatId, 'global', data.chat.title || 'Imported Chat', now, now]
    )
    for (const m of data.messages) {
      await run(
        'INSERT INTO messages (id, chat_id, role, content, reasoning, model, provider_id, files, usage, status, parent_id, branch_id, token_count, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          randomUUID(), chatId, m.role, m.content || '', m.reasoning, m.model, m.providerId,
          m.files ? JSON.stringify(m.files) : null,
          m.usage ? JSON.stringify(m.usage) : null,
          'complete', null, null, null, m.createdAt || now,
        ]
      )
    }
    sendNotification('Chat Imported', `Imported "${data.chat.title || 'Chat'}"`, 'success')
    return chatId
  })
}