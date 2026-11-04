// Real-app screenshot harness.
//
// Launches the built Electron app against a throwaway user-data directory and
// drives it over the Chrome DevTools Protocol, so UI evidence comes from the
// actual application (not a browser mock of it).
//
//   npm run build && node scripts/review/capture.js
//
// Navigation uses the app's own keyboard shortcuts (Ctrl+1…0), which also
// exercises them. Writes docs/evidence/ui/<prefix>-<screen>.png
// (prefix defaults to "after"; CAPTURE_PREFIX=before captures a baseline).
// Never touches real user data.

const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawn } = require('child_process')

const ROOT = path.join(__dirname, '../..')
const OUT = path.join(ROOT, 'docs/evidence/ui')
const PORT = 9333
const PREFIX = process.env.CAPTURE_PREFIX || 'after'
const WIDTH = 1440
const HEIGHT = 900

// Ctrl+<key> maps to NAV_ITEMS order in src/components/layout/AppLayout.tsx.
const SCREENS = [
  { name: 'mission-control', key: '1' },
  { name: 'chat', key: '2' },
  { name: 'search', key: '3' },
  { name: 'workspace', key: '4' },
  { name: 'memory', key: '5' },
  { name: 'prompts', key: '6' },
  { name: 'visualizations', key: '7' },
  { name: 'usage', key: '8' },
  { name: 'settings', key: '9' },
  { name: 'profile', key: '0' },
]

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function waitForTarget(timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`)
      const targets = await res.json()
      const page = targets.find((t) => t.type === 'page' && /index\.html/.test(t.url))
      if (page && page.webSocketDebuggerUrl) return page
    } catch {
      // DevTools endpoint not up yet.
    }
    await sleep(500)
  }
  throw new Error('DevTools target never appeared; the app did not start')
}

function cdp(ws) {
  let id = 0
  const pending = new Map()
  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data)
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id)
      pending.delete(msg.id)
      if (msg.error) reject(new Error(msg.error.message))
      else resolve(msg.result)
    }
  })
  return (method, params = {}) =>
    new Promise((resolve, reject) => {
      const msgId = ++id
      pending.set(msgId, { resolve, reject })
      ws.send(JSON.stringify({ id: msgId, method, params }))
    })
}

function pressShortcut(send, key) {
  return send('Runtime.evaluate', {
    expression: `window.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(key)}, ctrlKey: true, bubbles: true, cancelable: true })), document.querySelector('[role="dialog"]')?.innerText?.slice(0,40) ?? 'ok'`,
    returnByValue: true,
  })
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true })
  const userData = path.join(os.tmpdir(), `fluxora-capture-${Date.now()}`)
  fs.mkdirSync(userData, { recursive: true })

  const electron = require('electron')
  const child = spawn(electron, ['.', `--remote-debugging-port=${PORT}`, `--user-data-dir=${userData}`], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const logs = []
  child.stdout.on('data', (d) => logs.push(d.toString()))
  child.stderr.on('data', (d) => logs.push(d.toString()))

  try {
    const target = await waitForTarget()
    const ws = new WebSocket(target.webSocketDebuggerUrl)
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve, { once: true })
      ws.addEventListener('error', reject, { once: true })
    })
    const send = cdp(ws)

    await send('Page.enable')
    await send('Runtime.enable')
    await send('Emulation.setDeviceMetricsOverride', {
      width: WIDTH,
      height: HEIGHT,
      deviceScaleFactor: 1,
      mobile: false,
    })
    await sleep(3000)

    // First run opens onboarding over everything; dismiss it the way a real
    // user would so the screens behind it can be reviewed.
    await send('Runtime.evaluate', {
      expression: `(() => { const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='Use later'); if(!b) return 'no-onboarding'; b.click(); return 'dismissed'; })()`,
      returnByValue: true,
    })
    await sleep(800)

    for (const screen of SCREENS) {
      await pressShortcut(send, screen.key)
      await sleep(1100)
      const shot = await send('Page.captureScreenshot', { format: 'png' })
      fs.writeFileSync(path.join(OUT, `${PREFIX}-${screen.name}.png`), Buffer.from(shot.data, 'base64'))
      console.log(`  captured ${screen.name}`)
    }

    // Command palette, the densest surface in the app.
    await pressShortcut(send, 'k')
    await sleep(1000)
    const palette = await send('Page.captureScreenshot', { format: 'png' })
    fs.writeFileSync(path.join(OUT, `${PREFIX}-command-palette.png`), Buffer.from(palette.data, 'base64'))
    console.log('  captured command-palette')

    ws.close()
  } finally {
    child.kill()
    await sleep(1500)
    try {
      fs.rmSync(userData, { recursive: true, force: true })
    } catch {
      // Electron can still hold the profile briefly; the OS temp dir is fine to leave.
      console.warn('  note: temp profile left behind (locked):', userData)
    }
    fs.writeFileSync(path.join(OUT, 'capture.log'), logs.join(''))
  }
  console.log('screenshots written to docs/evidence/ui')
}

main().catch((error) => {
  console.error('capture failed:', error)
  process.exit(1)
})
