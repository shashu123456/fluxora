import { app, BrowserWindow, ipcMain, dialog, shell, Menu } from 'electron'
import path from 'path'
import fs from 'fs'
import { initDatabase, closeDatabase, getDb } from './database'
import { registerChatIpc } from './ipc/chat'
import { registerProviderIpc } from './ipc/providers'
import { migrateLegacyProviderSecrets } from './services/secrets/migration'
import { registerMemoryIpc } from './ipc/memory'
import { registerBrainIpc } from './ipc/brain'
import { registerWorkspaceIpc } from './ipc/workspace'
import { registerToolsIpc } from './ipc/tools'
import { registerPromptIpc } from './ipc/prompts'
import { registerSettingsIpc } from './ipc/settings'
import { registerUsageIpc } from './ipc/usage'
import { registerSearchIpc } from './ipc/search'
import { registerWorkspaceIndexIpc } from './ipc/workspaceIndex'
import { startSessionTracking, stopSessionTracking } from './services/developer/sessions'
import { registerIntelligenceIpc } from './ipc/intelligence'
import { registerDeveloperIpc } from './ipc/developer'
import { registerSystemIpc, setMainWindow } from './ipc/system'
import { ensureDataDir, getDataDir, isPortableMode, PORTABLE_DIR } from './config'
import { startAutoBackup, stopAutoBackup } from './database/backup'
import { loadWindowState, saveWindowState } from './window-state'
import { syncBuiltinProvidersToPresets } from './services/ai'
import { PRODUCTION_CSP, isAllowedExternalProtocol } from './security-policy'

function applySecurityHeaders() {
  const session = require('electron').session.defaultSession
  session.webRequest.onHeadersReceived((details: any, callback: (response: any) => void) => {
    const isDev = !!process.env.VITE_DEV_SERVER_URL
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': isDev
          ? ["default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data: blob:; connect-src 'self' ws: http: https:; object-src 'none'"]
          : [PRODUCTION_CSP],
        'X-Content-Type-Options': ['nosniff'],
      },
    })
  })
}

function hardenWebContents(contents: Electron.WebContents) {
  contents.on('will-navigate', (event, url) => {
    const devUrl = process.env.VITE_DEV_SERVER_URL
    if (devUrl && url.startsWith(devUrl)) return
    event.preventDefault()
    try {
      const parsed = new URL(url)
      if (isAllowedExternalProtocol(parsed.protocol)) shell.openExternal(url)
    } catch {
      // ignore malformed navigation targets
    }
  })
  contents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url)
      if (isAllowedExternalProtocol(parsed.protocol)) shell.openExternal(url)
    } catch {
      // ignore malformed popup targets
    }
    return { action: 'deny' }
  })
  contents.on('will-attach-webview', (event) => {
    event.preventDefault()
  })
}

let mainWindow: BrowserWindow | null = null
let splashWindow: BrowserWindow | null = null

const APP_VERSION = app.getVersion()

function showSplash() {
  try {
    splashWindow = new BrowserWindow({
      width: 440,
      height: 300,
      frame: false,
      resizable: false,
      movable: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      show: false,
      backgroundColor: '#0B0B0A',
      transparent: false,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    })
    hardenWebContents(splashWindow.webContents)
    splashWindow.once('ready-to-show', () => splashWindow?.show())
    if (process.env.VITE_DEV_SERVER_URL) {
      splashWindow.loadURL(`${process.env.VITE_DEV_SERVER_URL}/splash.html`)
    } else {
      splashWindow.loadFile(path.join(__dirname, '../../dist/splash.html'))
    }
    splashWindow.on('closed', () => {
      splashWindow = null
    })
  } catch {
    splashWindow = null
  }
}

function showAbout() {
  mainWindow?.webContents.send('menu:about')
}

function showFatalDialog(title: string, message: string) {
  try {
    dialog.showMessageBoxSync({
      type: 'error',
      title,
      message,
      detail: 'The application could not start. Please close the error, check the troubleshooting section of QUICK_START.md, and try again.',
    })
  } catch {
    // dialog itself failed; nothing else to do
  }
}

function buildAppMenu() {
  const isMac = process.platform === 'darwin'
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac ? [{ role: 'appMenu' as const }] : []),
    {
      label: 'File',
      submenu: [
        { label: 'New Chat', accelerator: 'CmdOrCtrl+N', click: () => mainWindow?.webContents.send('menu:new-chat') },
        { type: 'separator' },
        isMac ? { role: 'close' as const } : { role: 'quit' as const },
      ],
    },
    {
      label: 'Help',
      submenu: [
        { label: 'About Fluxora', click: () => showAbout() },
        { label: 'Open Data Folder', click: () => { mainWindow?.webContents.send('menu:open-data-dir') } },
      ],
    },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        { role: 'reload', visible: !!process.env.VITE_DEV_SERVER_URL },
        { role: 'forceReload', visible: !!process.env.VITE_DEV_SERVER_URL },
        { role: 'toggleDevTools', visible: !!process.env.VITE_DEV_SERVER_URL },
        { type: 'separator', visible: !!process.env.VITE_DEV_SERVER_URL },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: [...(isMac ? [{ role: 'minimize' as const }, { role: 'zoom' as const }] : [{ role: 'minimize' as const }]), { role: 'close' as const }],
    },
    ...(isMac ? [{ role: 'windowMenu' as const }] : []),
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function createWindow() {
  const state = loadWindowState()
  const iconPath = path.join(__dirname, '../../build/icon.ico')
  const hasIcon = fs.existsSync(iconPath)

  mainWindow = new BrowserWindow({
    x: state.x,
    y: state.y,
    width: state.width,
    height: state.height,
    minWidth: 900,
    minHeight: 600,
    title: 'Fluxora',
    show: false,
    frame: process.platform === 'darwin' ? undefined : false,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : undefined,
    icon: hasIcon && process.platform === 'win32' ? iconPath : undefined,
    backgroundColor: '#0B0B0A',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  setMainWindow(mainWindow)
  hardenWebContents(mainWindow.webContents)

  mainWindow.once('ready-to-show', () => {
    if (splashWindow && !splashWindow.isDestroyed()) splashWindow.close()
    if (state.isMaximized) mainWindow?.maximize()
    mainWindow?.show()
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'))
  }

  mainWindow.webContents.on('did-fail-load', (_e, errorCode, errorDescription) => {
    if (errorCode === -3) return // aborted: user navigated away
    showFatalDialog('Failed to load the app', `The renderer failed to start (code ${errorCode}: ${errorDescription}).`)
  })

  mainWindow.webContents.on('render-process-gone', (_e, details) => {
    if (details.reason !== 'clean-exit') {
      showFatalDialog('The app crashed', `The renderer process exited unexpectedly (reason: ${details.reason}).`)
    }
  })

  mainWindow.on('unresponsive', () => {
    showFatalDialog('The app is not responding', 'The application has stopped responding. It will be restarted on the next launch.')
  })

  const persistState = (isMaximized?: boolean) => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) return
    const bounds = mainWindow.getNormalBounds()
    saveWindowState({
      ...bounds,
      isMaximized: isMaximized ?? mainWindow.isMaximized(),
    })
  }

  mainWindow.on('resize', () => persistState())
  mainWindow.on('move', () => persistState())
  mainWindow.on('maximize', () => {
    persistState(true)
    mainWindow?.webContents.send('window:maximized', true)
  })
  mainWindow.on('unmaximize', () => {
    mainWindow?.webContents.send('window:maximized', false)
    persistState(false)
  })
  mainWindow.on('close', () => persistState())
  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

const hasSingleInstanceLock = app.requestSingleInstanceLock()
if (!hasSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.show()
      mainWindow.focus()
    } else {
      createWindow()
    }
  })
}

app.whenReady().then(async () => {
  if (!hasSingleInstanceLock) return
  applySecurityHeaders()
  showSplash()

  try {
    await initDatabase()
    await migrateLegacyProviderSecrets()
    await syncBuiltinProvidersToPresets()
    startAutoBackup()
  } catch (e) {
    showFatalDialog('Database error', `Could not initialize the local database.\n\n${e instanceof Error ? e.message : String(e)}`)
    return
  }

  try {
    registerChatIpc()
    registerProviderIpc()
    registerMemoryIpc()
    registerBrainIpc()
    registerWorkspaceIpc()
    registerToolsIpc()
    registerPromptIpc()
    registerSettingsIpc()
    registerUsageIpc()
    registerSearchIpc()
    registerWorkspaceIndexIpc()
    registerIntelligenceIpc()
    registerDeveloperIpc()
    registerSystemIpc()
    void startSessionTracking()
  } catch (e) {
    showFatalDialog('Startup error', `Could not register application services.\n\n${e instanceof Error ? e.message : String(e)}`)
    return
  }

createWindow()
  buildAppMenu()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
}).catch((e) => {
  showFatalDialog('Startup error', `The application failed to start.\n\n${e instanceof Error ? e.message : String(e)}`)
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

let quitting = false

app.on('before-quit', (event) => {
  if (quitting) return
  quitting = true
  event.preventDefault()
  stopAutoBackup()
  void stopSessionTracking()
    .catch(() => {})
    .finally(async () => {
      try {
        await closeDatabase()
      } catch (e) {
        console.error('Error closing database', e)
      }
      app.quit()
    })
})