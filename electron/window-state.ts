import { app, screen } from 'electron'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

export interface WindowState {
  width: number
  height: number
  x?: number
  y?: number
  isMaximized: boolean
}

const stateFile = () => join(app.getPath('userData'), 'window-state.json')

const defaults: WindowState = { width: 1280, height: 820, isMaximized: false }

export function loadWindowState(): WindowState {
  try {
    const raw = readFileSync(stateFile(), 'utf-8')
    const parsed = JSON.parse(raw) as WindowState
    if (!parsed || typeof parsed.width !== 'number' || typeof parsed.height !== 'number') return defaults
    if (parsed.x !== undefined && parsed.y !== undefined) {
      const display = screen.getDisplayNearestPoint({ x: parsed.x, y: parsed.y })
      const b = display.workArea
      if (!(parsed.x >= b.x - 1 && parsed.x + parsed.width <= b.x + b.width + 1 && parsed.y >= b.y - 1 && parsed.y + parsed.height <= b.y + b.height + 1)) {
        return defaults
      }
    }
    return parsed
  } catch {
    return defaults
  }
}

let saveTimer: NodeJS.Timeout | null = null

export function saveWindowState(state: WindowState) {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    try {
      writeFileSync(stateFile(), JSON.stringify(state, null, 2), 'utf-8')
    } catch {
      // non-fatal: window state persistence is best-effort
    }
  }, 300)
}