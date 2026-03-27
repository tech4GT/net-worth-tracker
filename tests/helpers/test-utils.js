import puppeteer from 'puppeteer'
import { mkdirSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { DEFAULT_CATEGORIES } from './seed-data.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SCREENSHOT_DIR = join(__dirname, '..', 'screenshots')

if (!existsSync(SCREENSHOT_DIR)) mkdirSync(SCREENSHOT_DIR, { recursive: true })

export const BASE_URL = 'http://localhost:5173'

export async function launchBrowser() {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: process.env.CI ? ['--no-sandbox', '--disable-setuid-sandbox'] : [],
  })
  const page = await browser.newPage()
  await page.setViewport({ width: 1280, height: 800 })
  return { browser, page }
}

export async function clearIndexedDB(page) {
  await page.evaluate(() => {
    return new Promise((resolve, reject) => {
      const req = indexedDB.deleteDatabase('nwt-db')
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
      req.onblocked = () => resolve()
    })
  })
}

export async function seedState(page, stateOverrides = {}) {
  await page.evaluate((overrides) => {
    const DEFAULT_CATEGORIES = [
      { id: 'cat-cash', name: 'Cash & Checking', type: 'asset', icon: 'banknotes', color: '#22c55e', isDefault: true },
      { id: 'cat-savings', name: 'Savings', type: 'asset', icon: 'piggy-bank', color: '#10b981', isDefault: true },
      { id: 'cat-investments', name: 'Investments', type: 'asset', icon: 'chart', color: '#6366f1', isDefault: true },
      { id: 'cat-retirement', name: 'Retirement', type: 'asset', icon: 'shield', color: '#8b5cf6', isDefault: true },
      { id: 'cat-real-estate', name: 'Real Estate', type: 'asset', icon: 'home', color: '#f59e0b', isDefault: true },
      { id: 'cat-crypto', name: 'Crypto', type: 'asset', icon: 'bolt', color: '#f97316', isDefault: true },
      { id: 'cat-stocks', name: 'Stocks', type: 'asset', icon: 'chart-bar', color: '#3b82f6', isDefault: true },
      { id: 'cat-vehicles', name: 'Vehicles', type: 'asset', icon: 'car', color: '#06b6d4', isDefault: true },
      { id: 'cat-other-assets', name: 'Other Assets', type: 'asset', icon: 'box', color: '#64748b', isDefault: true },
      { id: 'cat-credit-cards', name: 'Credit Cards', type: 'liability', icon: 'card', color: '#ef4444', isDefault: true },
      { id: 'cat-student-loans', name: 'Student Loans', type: 'liability', icon: 'academic', color: '#f87171', isDefault: true },
      { id: 'cat-mortgage', name: 'Mortgage', type: 'liability', icon: 'home', color: '#dc2626', isDefault: true },
      { id: 'cat-auto-loan', name: 'Auto Loan', type: 'liability', icon: 'car', color: '#fb923c', isDefault: true },
      { id: 'cat-personal-loan', name: 'Personal Loan', type: 'liability', icon: 'user', color: '#e11d48', isDefault: true },
      { id: 'cat-other-liabilities', name: 'Other Liabilities', type: 'liability', icon: 'box', color: '#9f1239', isDefault: true },
    ]

    const defaultState = {
      items: [],
      categories: DEFAULT_CATEGORIES,
      snapshots: [],
      baseCurrency: 'USD',
      exchangeRates: {},
      theme: 'system',
      lastSnapshotDate: null,
      snapshotReminder: true,
    }

    const mergedState = { ...defaultState, ...overrides }

    return new Promise((resolve, reject) => {
      const req = indexedDB.open('nwt-db', 1)
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains('kv')) {
          db.createObjectStore('kv')
        }
      }
      req.onsuccess = () => {
        const db = req.result
        const tx = db.transaction('kv', 'readwrite')
        const store = tx.objectStore('kv')
        store.put({ state: mergedState, version: 3 }, 'nwt-store')
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      }
      req.onerror = () => reject(req.error)
    })
  }, stateOverrides)
}

export async function setupRequestInterception(page, mocks = {}) {
  await page.setRequestInterception(true)
  page.on('request', (request) => {
    const url = request.url()

    if (url.includes('/api/yahoo/v1/finance/search') && mocks.yahooSearch) {
      request.respond({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mocks.yahooSearch),
      })
      return
    }

    if (url.includes('/api/yahoo/v8/finance/chart/') && mocks.yahooChart) {
      const ticker = url.match(/chart\/([^?]+)/)?.[1]
      const response = typeof mocks.yahooChart === 'function'
        ? mocks.yahooChart(ticker)
        : mocks.yahooChart
      request.respond({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(response),
      })
      return
    }

    if (url.includes('api.frankfurter.app') && mocks.frankfurter) {
      request.respond({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mocks.frankfurter),
      })
      return
    }

    // Block external APIs if not mocked
    if (url.includes('api.frankfurter.app') || url.includes('/api/yahoo/')) {
      request.respond({ status: 500, body: 'Blocked by test' })
      return
    }

    request.continue()
  })
}

export async function waitForApp(page) {
  await page.waitForFunction(
    () => document.querySelector('aside h1')?.textContent?.includes('Net Worth Tracker'),
    { timeout: 15000 }
  )
  // Small delay for Zustand rehydration
  await new Promise(r => setTimeout(r, 500))
}

export async function navigateTo(page, path) {
  await page.goto(`${BASE_URL}/#${path}`, { waitUntil: 'networkidle0', timeout: 15000 })
  await waitForApp(page)
}

export function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`)
  }
}

export async function screenshot(page, name) {
  const safeName = name.replace(/[^a-zA-Z0-9_-]/g, '-')
  const path = join(SCREENSHOT_DIR, `${safeName}-${Date.now()}.png`)
  await page.screenshot({ path, fullPage: true })
  return path
}

// Utility to get text content matching a selector
export async function getTextContent(page, selector) {
  return page.$eval(selector, el => el.textContent.trim()).catch(() => null)
}

// Utility to get all text contents matching a selector
export async function getAllTextContents(page, selector) {
  return page.$$eval(selector, els => els.map(el => el.textContent.trim()))
}

// Utility to check if text exists anywhere on the page
export async function pageContainsText(page, text) {
  return page.evaluate((t) => document.body.innerText.includes(t), text)
}

// Utility to wait for text to appear on page
export async function waitForText(page, text, timeout = 5000) {
  await page.waitForFunction(
    (t) => document.body.innerText.includes(t),
    { timeout },
    text
  )
}

// Utility to click a button by its text content
export async function clickButtonByText(page, text) {
  await page.evaluate((t) => {
    const buttons = [...document.querySelectorAll('button')]
    const btn = buttons.find(b => b.textContent.trim().includes(t))
    if (btn) btn.click()
    else throw new Error(`Button with text "${t}" not found`)
  }, text)
}

// Test runner helper for individual test files
export function createTestRunner(page) {
  let passed = 0
  let failed = 0
  const results = []

  async function test(name, fn) {
    try {
      await fn()
      passed++
      results.push({ name, status: 'PASS' })
      console.log(`  ✓ PASS: ${name}`)
    } catch (err) {
      failed++
      results.push({ name, status: 'FAIL', error: err.message })
      console.error(`  ✗ FAIL: ${name} — ${err.message}`)
      try {
        await screenshot(page, name)
      } catch {}
    }
  }

  function summary() {
    console.log(`\nResults: ${passed} passed, ${failed} failed out of ${passed + failed}`)
    return { passed, failed, results }
  }

  return { test, summary }
}
