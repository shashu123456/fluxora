import { ipcMain } from 'electron'
import fs from 'fs'
import path from 'path'
import { all } from '../database'
import { assertPathAllowed } from '../security-policy'

async function assertReadable(filePath: string): Promise<string> {
  const roots = (await all<{ path: string | null }>('SELECT path FROM workspaces WHERE path IS NOT NULL')).map((w) => w.path)
  return assertPathAllowed(filePath, roots)
}

export function registerToolsIpc() {
  ipcMain.handle('tools:read-pdf', async (_e, filePath: string) => {
    const safePath = await assertReadable(filePath)
    const text = await extractPdfText(safePath)
    return { text: text.slice(0, 500000), path: safePath }
  })

  ipcMain.handle('tools:read-image', async (_e, filePath: string) => {
    const safePath = await assertReadable(filePath)
    const ext = path.extname(safePath).toLowerCase()
    const supported = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp']
    if (!supported.includes(ext)) {
      throw new Error(`Unsupported image type: ${ext}`)
    }
    const data = fs.readFileSync(safePath)
    const mime = mimeFor(ext)
    return `data:${mime};base64,${data.toString('base64')}`
  })

  ipcMain.handle('tools:ocr-image', async (_e, filePath: string) => {
    const safePath = await assertReadable(filePath)
    const { createWorker } = await import('tesseract.js')
    const worker = await createWorker('eng')
    try {
      const { data } = await worker.recognize(safePath)
      return { text: data.text, confidence: data.confidence }
    } finally {
      await worker.terminate()
    }
  })

  ipcMain.handle('tools:parse-json', async (_e, content: string) => {
    const parsed = JSON.parse(content)
    return {
      pretty: JSON.stringify(parsed, null, 2),
      size: content.length,
      type: Array.isArray(parsed) ? 'array' : typeof parsed,
    }
  })

  ipcMain.handle('tools:detect-file', async (_e, filePath: string) => {
    const safePath = await assertReadable(filePath)
    const stat = fs.statSync(safePath)
    const ext = path.extname(safePath).toLowerCase()
    const types: Record<string, string> = {
      '.md': 'markdown', '.txt': 'text', '.json': 'json', '.js': 'javascript',
      '.ts': 'typescript', '.tsx': 'typescript', '.jsx': 'javascript', '.py': 'python',
      '.html': 'html', '.css': 'css', '.sql': 'sql', '.pdf': 'pdf',
      '.png': 'image', '.jpg': 'image', '.jpeg': 'image', '.gif': 'image', '.webp': 'image', '.bmp': 'image',
      '.svg': 'svg', '.yaml': 'yaml', '.yml': 'yaml', '.toml': 'toml', '.xml': 'xml',
      '.sh': 'shell', '.bat': 'shell', '.rs': 'rust', '.go': 'go', '.java': 'java',
      '.c': 'c', '.cpp': 'cpp', '.h': 'c', '.rb': 'ruby', '.php': 'php', '.scss': 'scss',
      '.vue': 'vue', '.csv': 'csv', '.log': 'text',
      '.wav': 'audio', '.mp3': 'audio', '.mp4': 'video', '.zip': 'archive', '.xlsx': 'spreadsheet',
    }
    return {
      type: stat.isDirectory() ? 'directory' : types[ext] || 'binary',
      size: stat.size,
      name: path.basename(safePath),
      ext,
      modifiedAt: stat.mtimeMs,
    }
  })
}

function mimeFor(ext: string): string {
  const map: Record<string, string> = {
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp',
  }
  return map[ext] || 'application/octet-stream'
}

function extractPdfText(filePath: string): Promise<string> {
  return new Promise(async (resolve, reject) => {
    try {
      const pdfParse = (await import('pdf-parse')).default
      const data = fs.readFileSync(filePath)
      const result = await pdfParse(data)
      resolve(result.text || '')
    } catch (e: any) {
      reject(new Error(`Failed to read PDF: ${e.message}`))
    }
  })
}