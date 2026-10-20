import { ipcMain } from 'electron'
import fs from 'fs'
import path from 'path'

export function registerToolsIpc() {
  ipcMain.handle('tools:read-pdf', async (_e, filePath: string) => {
    const text = await extractPdfText(filePath)
    return { text: text.slice(0, 500000), path: filePath }
  })

  ipcMain.handle('tools:read-image', async (_e, filePath: string) => {
    const ext = path.extname(filePath).toLowerCase()
    const supported = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp']
    if (!supported.includes(ext)) {
      throw new Error(`Unsupported image type: ${ext}`)
    }
    const data = fs.readFileSync(filePath)
    const mime = mimeFor(ext)
    return `data:${mime};base64,${data.toString('base64')}`
  })

  ipcMain.handle('tools:ocr-image', async (_e, filePath: string) => {
    const { createWorker } = await import('tesseract.js')
    const worker = await createWorker('eng')
    try {
      const { data } = await worker.recognize(filePath)
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
    const stat = fs.statSync(filePath)
    const ext = path.extname(filePath).toLowerCase()
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
      name: path.basename(filePath),
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