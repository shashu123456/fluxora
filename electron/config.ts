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
  // Check PORTABLE_EXECUTABLE_DIR env var first
  const portableEnv = process.env.PORTABLE_EXECUTABLE_DIR
  if (portableEnv) {
    const portableDataDir = path.join(portableEnv, 'data')
    if (!fs.existsSync(portableDataDir)) {
      fs.mkdirSync(portableDataDir, { recursive: true })
    }
    return portableDataDir
  }
  if (app.isPackaged) {
    const exeDir = path.dirname(app.getPath('exe'))
    // Fallback: check for any Portable*.exe in the exe directory
    const portableExe = path.join(exeDir, 'Fluxora-Portable.exe')
    if (fs.existsSync(portableExe)) {
      const portableRoot = path.join(exeDir, 'data')
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