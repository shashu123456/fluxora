// Cold-start benchmark for the packaged app.
//
// Starts the built Windows binary against a brand-new user-data directory,
// then measures two user-visible milestones:
//   t1  the local database has been created (main process finished init)
//   t2  the renderer is reachable over CDP      (window is up and loaded)
//
//   node scripts/perf/startup-bench.js [runs]
//
// Every run uses a throwaway temp profile; no user data is read or written.

const fs = require('fs')
const os = require('os')
const path = require('path')
const http = require('http')
const { spawn } = require('child_process')

const ROOT = path.join(__dirname, '../..')
const EXE = path.join(ROOT, 'release/win-unpacked/Fluxora.exe')
const PORT = 9334
const RUNS = Number(process.argv[2] || 3)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function cdpReady() {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port: PORT, path: '/json/list', timeout: 500 }, (res) => {
      let body = ''
      res.on('data', (d) => (body += d))
      res.on('end', () => {
        try {
          const tabs = JSON.parse(body)
          resolve(tabs.some((t) => t.type === 'page'))
        } catch {
          resolve(false)
        }
      })
    })
    req.on('error', () => resolve(false))
    req.on('timeout', () => {
      req.destroy()
      resolve(false)
    })
  })
}

async function once(run) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'fluxora-bench-'))
  const dbPath = path.join(profile, 'data', 'aiworkspace.db')
  const started = process.hrtime.bigint()
  const child = spawn(EXE, [`--user-data-dir=${profile}`, `--remote-debugging-port=${PORT}`], {
    stdio: 'ignore',
  })

  let dbAt = null
  let cdpAt = null
  const deadline = Date.now() + 30000
  while (Date.now() < deadline && (!dbAt || !cdpAt)) {
    if (!dbAt && fs.existsSync(dbPath)) dbAt = Number(process.hrtime.bigint() - started) / 1e6
    if (!cdpAt && (await cdpReady())) cdpAt = Number(process.hrtime.bigint() - started) / 1e6
    if (!dbAt || !cdpAt) await sleep(25)
  }

  child.kill()
  await sleep(600)
  try {
    fs.rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
  } catch {
    /* temp dir only */
  }

  console.log(
    `run ${run}: db ${dbAt ? dbAt.toFixed(0) : 'timeout'} ms, renderer ${cdpAt ? cdpAt.toFixed(0) : 'timeout'} ms`
  )
  return { db: dbAt, cdp: cdpAt }
}

const median = (xs) => {
  const s = xs.filter((x) => typeof x === 'number').sort((a, b) => a - b)
  if (!s.length) return null
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

;(async () => {
  if (!fs.existsSync(EXE)) {
    console.error(`Missing packaged app: ${EXE}`)
    process.exit(1)
  }
  const results = []
  for (let i = 1; i <= RUNS; i++) {
    results.push(await once(i))
    await sleep(1200)
  }
  console.log('---')
  console.log(`median db-ready:       ${median(results.map((r) => r.db))?.toFixed(0)} ms`)
  console.log(`median renderer-ready: ${median(results.map((r) => r.cdp))?.toFixed(0)} ms`)
  console.log(`host: ${os.platform()} ${os.release()} ${os.arch()}, ${os.cpus().length} logical cores, ${Math.round(os.totalmem() / 2 ** 30)} GiB RAM`)
})()
