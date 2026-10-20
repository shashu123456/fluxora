import { app } from 'electron'
import path from 'path'
import fs from 'fs'

export const PORTABLE_DIR = path.join(app.getPath('userData'), 'portable')

let dataDirOverride: string | null = null

export function ensureDataDir() {
  const dir = getDataDir()
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  return dir
}

export function getDataDir(): string {
  if (dataDirOverride) return dataDirOverride
  if (app.isPackaged) {
    const portableRoot = path.join(path.dirname(app.getPath('exe')), 'data')
    if (fs.existsSync(portableRoot) || fs.existsSync(path.join(path.dirname(app.getPath('exe')), 'AI Workspace.exe'))) {
      fs.mkdirSync(portableRoot, { recursive: true })
      return portableRoot
    }
  }
  return path.join(app.getPath('userData'), 'data')
}

export function setDataDir(dir: string) {
  dataDirOverride = dir
  fs.mkdirSync(dir, { recursive: true })
}

export function isPortableMode(): boolean {
  return dataDirOverride !== null || getDataDir().includes('portable')
}

export function getPortableDir() {
  return PORTABLE_DIR
}