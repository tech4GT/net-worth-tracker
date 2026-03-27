import { spawn } from 'child_process'
import { readdirSync, mkdirSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const TESTS_DIR = __dirname
const SCREENSHOT_DIR = join(TESTS_DIR, 'screenshots')

if (!existsSync(SCREENSHOT_DIR)) mkdirSync(SCREENSHOT_DIR, { recursive: true })

const args = process.argv.slice(2)
let testFiles
if (args.length > 0) {
  testFiles = args.map(a => a.endsWith('.test.js') ? a : `${a}.test.js`)
} else {
  testFiles = readdirSync(TESTS_DIR)
    .filter(f => f.endsWith('.test.js'))
    .sort()
}

console.log('Starting Vite dev server...')
const vite = spawn('npx', ['vite', '--port', '5173'], {
  cwd: ROOT,
  stdio: 'pipe',
  env: { ...process.env, BROWSER: 'none' },
})

let viteOutput = ''
vite.stdout.on('data', (d) => { viteOutput += d.toString() })
vite.stderr.on('data', (d) => { viteOutput += d.toString() })

async function waitForServer(url, timeout = 30000) {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    try {
      const res = await fetch(url)
      if (res.ok) return
    } catch {}
    await new Promise(r => setTimeout(r, 500))
  }
  console.error('Vite output:', viteOutput)
  throw new Error('Dev server did not start in time')
}

async function runTest(file) {
  return new Promise((resolve) => {
    const proc = spawn('node', [join(TESTS_DIR, file)], {
      cwd: ROOT,
      stdio: 'inherit',
      env: { ...process.env },
    })
    proc.on('close', (code) => resolve({ file, code }))
    proc.on('error', (err) => resolve({ file, code: 1, error: err.message }))
  })
}

async function main() {
  try {
    await waitForServer('http://localhost:5173')
    console.log('Dev server ready.\n')

    const results = []
    for (const file of testFiles) {
      console.log(`\n--- Running ${file} ---`)
      const result = await runTest(file)
      results.push(result)
    }

    console.log('\n\n=== TEST SUMMARY ===')
    let allPassed = true
    for (const r of results) {
      const status = r.code === 0 ? 'PASS' : 'FAIL'
      if (r.code !== 0) allPassed = false
      console.log(`  ${status}: ${r.file}`)
    }

    const passCount = results.filter(r => r.code === 0).length
    const failCount = results.filter(r => r.code !== 0).length
    console.log(`\nTotal: ${passCount} passed, ${failCount} failed out of ${results.length}`)

    process.exit(allPassed ? 0 : 1)
  } finally {
    vite.kill('SIGTERM')
    // Give it a moment to clean up
    setTimeout(() => {
      try { vite.kill('SIGKILL') } catch {}
    }, 2000)
  }
}

main().catch((err) => {
  console.error('Runner failed:', err.message)
  try { vite.kill('SIGKILL') } catch {}
  process.exit(1)
})
