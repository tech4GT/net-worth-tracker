import { chromium } from 'playwright'

const BASE = 'http://localhost:5173'
const results = []

function pass(name) {
  results.push({ status: 'PASS', name })
  console.log(`  ✓ ${name}`)
}
function fail(name, detail) {
  results.push({ status: 'FAIL', name, detail })
  console.log(`  ✗ ${name}\n    → ${detail}`)
}
function section(name) {
  console.log(`\n── ${name} ──`)
}

const browser = await chromium.launch({
  headless: true,
  executablePath: '/root/.cache/ms-playwright/chromium-1194/chrome-linux/chrome',
})
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
const page = await ctx.newPage()

// Collect console errors
const consoleErrors = []
page.on('console', msg => {
  if (msg.type() === 'error') consoleErrors.push(msg.text())
})
page.on('pageerror', err => consoleErrors.push(`PAGE ERROR: ${err.message}`))

// ─── DASHBOARD ───────────────────────────────────────────────────────────────
section('Dashboard')
await page.goto(BASE)
await page.waitForLoadState('networkidle')

try {
  await page.waitForSelector('text=Net Worth', { timeout: 5000 })
  pass('Dashboard loads without crash')
} catch {
  fail('Dashboard loads without crash', 'Could not find "Net Worth" heading')
}

try {
  await page.waitForSelector('text=Total Assets', { timeout: 3000 })
  await page.waitForSelector('text=Total Liabilities', { timeout: 3000 })
  pass('Summary cards visible')
} catch {
  fail('Summary cards visible', 'Missing Total Assets or Total Liabilities card')
}

try {
  await page.waitForSelector('text=Asset Allocation', { timeout: 3000 })
  pass('Allocation chart section visible')
} catch {
  fail('Allocation chart section visible', 'Could not find Allocation chart')
}

// ─── ADD ASSET ────────────────────────────────────────────────────────────────
section('Assets - Add item')
await page.click('text=Assets')
await page.waitForLoadState('networkidle')

// Open add modal
const addBtn = page.locator('button', { hasText: /add asset/i }).first()
try {
  await addBtn.waitFor({ timeout: 3000 })
  await addBtn.click()
  pass('Add Asset button clickable')
} catch {
  fail('Add Asset button clickable', 'Button not found or not clickable')
}

// Validation: submit empty form
try {
  await page.waitForSelector('form', { timeout: 2000 })
  const submitBtn = page.locator('button[type="submit"]').first()
  await submitBtn.click()
  await page.waitForSelector('text=required', { timeout: 2000 })
  pass('Validation: empty name shows error')
} catch {
  fail('Validation: empty name shows error', 'No validation error shown for empty name')
}

// Fill in valid data
try {
  const nameInput = page.locator('input[placeholder*="Chase"]').or(page.locator('input[placeholder*="Checking"]')).first()
  await nameInput.fill('Chase Checking')

  // Set value
  const valueInput = page.locator('input[type="number"][placeholder="0.00"]').first()
  await valueInput.fill('5000')

  const submitBtn = page.locator('button[type="submit"]').first()
  await submitBtn.click()
  await page.waitForTimeout(500)

  // Check if item appears in list
  await page.waitForSelector('text=Chase Checking', { timeout: 3000 })
  pass('Add asset: valid data saves and appears in list')
} catch (e) {
  fail('Add asset: valid data saves and appears in list', e.message)
}

// Validation: zero value
try {
  await addBtn.click()
  await page.waitForSelector('form', { timeout: 2000 })
  const nameInput2 = page.locator('input[placeholder*="Chase"]').or(page.locator('input[placeholder*="Checking"]')).first()
  await nameInput2.fill('Test Zero')
  const valueInput2 = page.locator('input[type="number"][placeholder="0.00"]').first()
  await valueInput2.fill('0')
  const submitBtn2 = page.locator('button[type="submit"]').first()
  await submitBtn2.click()
  await page.waitForSelector('text=valid', { timeout: 2000 })
  pass('Validation: zero value shows error')
} catch {
  fail('Validation: zero value shows error', 'No error shown for zero value')
}

// Close modal if open
await page.keyboard.press('Escape')
await page.waitForTimeout(300)

// ─── EDIT ASSET ───────────────────────────────────────────────────────────────
section('Assets - Edit & Delete')
try {
  const editBtn = page.locator('button', { hasText: /edit/i }).first()
  await editBtn.waitFor({ timeout: 3000 })
  await editBtn.click()
  await page.waitForSelector('form', { timeout: 2000 })

  const nameInput = page.locator('input').filter({ hasValue: 'Chase Checking' }).first()
  await nameInput.fill('Chase Checking Updated')

  const submitBtn = page.locator('button[type="submit"]').first()
  await submitBtn.click()
  await page.waitForTimeout(500)

  await page.waitForSelector('text=Chase Checking Updated', { timeout: 3000 })
  pass('Edit asset: name update persists')
} catch (e) {
  fail('Edit asset: name update persists', e.message)
}

// Delete asset
try {
  const deleteBtn = page.locator('button', { hasText: /delete/i }).first()
  await deleteBtn.waitFor({ timeout: 3000 })
  await deleteBtn.click()
  // Confirm if dialog appears
  const confirmBtn = page.locator('button', { hasText: /confirm|delete|yes/i }).last()
  try { await confirmBtn.waitFor({ timeout: 1000 }); await confirmBtn.click() } catch {}
  await page.waitForTimeout(500)

  const stillThere = await page.locator('text=Chase Checking Updated').count()
  if (stillThere === 0) {
    pass('Delete asset: item removed from list')
  } else {
    fail('Delete asset: item removed from list', 'Item still visible after delete')
  }
} catch (e) {
  fail('Delete asset: item removed from list', e.message)
}

// ─── LIABILITIES ─────────────────────────────────────────────────────────────
section('Liabilities')
await page.click('text=Liabilities')
await page.waitForLoadState('networkidle')

try {
  const addLiabBtn = page.locator('button', { hasText: /add liability/i }).first()
  await addLiabBtn.waitFor({ timeout: 3000 })
  await addLiabBtn.click()
  await page.waitForSelector('form', { timeout: 2000 })

  const nameInput = page.locator('input[placeholder*="Student"]').or(page.locator('input[placeholder*="Loan"]')).first()
  await nameInput.fill('Student Loan')

  const valueInput = page.locator('input[type="number"][placeholder="0.00"]').first()
  await valueInput.fill('25000')

  const submitBtn = page.locator('button[type="submit"]').first()
  await submitBtn.click()
  await page.waitForTimeout(500)

  await page.waitForSelector('text=Student Loan', { timeout: 3000 })
  pass('Add liability: saves and appears in list')
} catch (e) {
  fail('Add liability: saves and appears in list', e.message)
}

// ─── DASHBOARD TOTALS UPDATE ─────────────────────────────────────────────────
section('Dashboard totals')
await page.click('text=Dashboard')
await page.waitForLoadState('networkidle')

try {
  // Net worth card should show something
  const netWorthEl = page.locator('text=Total Net Worth').first()
  await netWorthEl.waitFor({ timeout: 3000 })
  pass('Net worth card visible after adding items')
} catch (e) {
  fail('Net worth card visible after adding items', e.message)
}

// Take snapshot
try {
  const snapshotBtn = page.locator('button', { hasText: /take snapshot/i }).first()
  await snapshotBtn.waitFor({ timeout: 3000 })
  await snapshotBtn.click()
  await page.waitForTimeout(500)
  pass('Take Snapshot button works')
} catch (e) {
  fail('Take Snapshot button works', e.message)
}

// ─── HISTORY ─────────────────────────────────────────────────────────────────
section('History')
await page.click('text=History')
await page.waitForLoadState('networkidle')

try {
  // Should see at least one snapshot
  await page.waitForSelector('text=Snapshot', { timeout: 3000 })
  pass('History page shows snapshot')
} catch {
  fail('History page shows snapshot', 'No snapshot entries visible')
}

try {
  await page.waitForSelector('canvas, .recharts-wrapper, svg', { timeout: 3000 })
  pass('History chart renders')
} catch {
  fail('History chart renders', 'No chart visible on history page')
}

// ─── SETTINGS - EXCHANGE RATES ────────────────────────────────────────────────
section('Settings - Exchange Rates')
await page.click('text=Settings')
await page.waitForLoadState('networkidle')

try {
  await page.waitForSelector('text=Exchange Rates', { timeout: 3000 })
  pass('Exchange Rates section visible')
} catch {
  fail('Exchange Rates section visible', 'Section not found')
}

// Fetch live rates
try {
  const fetchBtn = page.locator('button', { hasText: /fetch live rates/i }).first()
  await fetchBtn.waitFor({ timeout: 3000 })
  await fetchBtn.click()
  // Wait for either rates to load or error to show
  await page.waitForTimeout(4000)
  // Check fetching state resolved
  const stillFetching = await page.locator('text=Fetching...').count()
  if (stillFetching === 0) {
    pass('Fetch Live Rates: completes (success or error)')
  } else {
    fail('Fetch Live Rates: completes', 'Still showing Fetching... after 4s')
  }
} catch (e) {
  fail('Fetch Live Rates button works', e.message)
}

// Manually add exchange rate
try {
  const codeInput = page.locator('input[placeholder="EUR"]').first()
  await codeInput.fill('ETH')
  const rateInput = page.locator('input[placeholder="0.92"]').first()
  await rateInput.fill('3500')
  const addRateBtn = page.locator('button', { hasText: /^add$/i }).first()
  await addRateBtn.click()
  await page.waitForTimeout(500)
  await page.waitForSelector('text=ETH', { timeout: 2000 })
  pass('Manually add exchange rate (ETH)')
} catch (e) {
  fail('Manually add exchange rate (ETH)', e.message)
}

// Verify maxLength on currency code input
try {
  const codeInput = page.locator('input[placeholder="EUR"]').first()
  const maxLen = await codeInput.getAttribute('maxlength')
  if (maxLen) {
    pass('Currency code input has maxLength attribute')
  } else {
    fail('Currency code input has maxLength attribute', 'maxlength not set')
  }
} catch (e) {
  fail('Currency code input has maxLength attribute', e.message)
}

// Remove ETH rate
try {
  const removeBtn = page.locator('button[aria-label="Remove ETH exchange rate"]').first()
  await removeBtn.waitFor({ timeout: 2000 })
  await removeBtn.click()
  await page.waitForTimeout(300)
  pass('Remove exchange rate button has aria-label and works')
} catch (e) {
  fail('Remove exchange rate button has aria-label and works', e.message)
}

// ─── SETTINGS - CATEGORIES ───────────────────────────────────────────────────
section('Settings - Categories')

try {
  await page.waitForSelector('text=Categories', { timeout: 3000 })
  pass('Categories section visible')
} catch {
  fail('Categories section visible', 'Section not found')
}

// Add category
try {
  const addCatBtn = page.locator('button', { hasText: /add category/i }).first()
  await addCatBtn.click()
  await page.waitForSelector('text=Add Category', { timeout: 2000 })

  const nameInput = page.locator('input[placeholder*="Side Business"]').first()
  await nameInput.fill('My Side Business')

  const submitBtn = page.locator('button', { hasText: /^add$/i }).last()
  await submitBtn.click()
  await page.waitForTimeout(500)

  await page.waitForSelector('text=My Side Business', { timeout: 3000 })
  pass('Add category: saves and appears in list')
} catch (e) {
  fail('Add category: saves and appears in list', e.message)
}

// Verify default categories have no Remove button
try {
  const cashRow = page.locator('div').filter({ hasText: /^Cash$/ }).first()
  const removeInCash = cashRow.locator('button', { hasText: /remove/i })
  const count = await removeInCash.count()
  if (count === 0) {
    pass('Default categories: no Remove button')
  } else {
    fail('Default categories: no Remove button', 'Remove button present on default category')
  }
} catch (e) {
  fail('Default categories: no Remove button', e.message)
}

// Delete new category
try {
  const removeBtn = page.locator('button', { hasText: /remove/i }).last()
  await removeBtn.waitFor({ timeout: 2000 })
  await removeBtn.click()
  await page.waitForTimeout(300)
  const stillThere = await page.locator('text=My Side Business').count()
  if (stillThere === 0) {
    pass('Delete custom category: removed from list')
  } else {
    fail('Delete custom category: removed from list', 'Still visible after deletion')
  }
} catch (e) {
  fail('Delete custom category: removed from list', e.message)
}

// ─── SETTINGS - IMPORT/EXPORT ────────────────────────────────────────────────
section('Settings - Import/Export')

try {
  await page.waitForSelector('text=Import & Export', { timeout: 3000 })
  pass('Import & Export section visible')
} catch {
  fail('Import & Export section visible', 'Section not found')
}

// Export JSON (check download triggers)
try {
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 5000 }),
    page.locator('button', { hasText: /export json/i }).first().click(),
  ])
  const filename = download.suggestedFilename()
  if (filename.includes('.json')) {
    pass(`Export JSON: triggers download (${filename})`)
  } else {
    fail('Export JSON: triggers download', `Unexpected filename: ${filename}`)
  }
} catch (e) {
  fail('Export JSON: triggers download', e.message)
}

// Export CSV
try {
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 5000 }),
    page.locator('button', { hasText: /export csv/i }).first().click(),
  ])
  const filename = download.suggestedFilename()
  if (filename.includes('.csv')) {
    pass(`Export CSV: triggers download (${filename})`)
  } else {
    fail('Export CSV: triggers download', `Unexpected filename: ${filename}`)
  }
} catch (e) {
  fail('Export CSV: triggers download', e.message)
}

// ─── THEME TOGGLE ────────────────────────────────────────────────────────────
section('Theme Toggle')

try {
  const themeBtn = page.locator('button[aria-label*="theme"], button[aria-label*="Theme"], button[title*="theme"]').first()
  const fallbackThemeBtn = page.locator('header button').last()
  const btn = await themeBtn.count() > 0 ? themeBtn : fallbackThemeBtn

  // Check initial class on html
  const initialDark = await page.evaluate(() => document.documentElement.classList.contains('dark'))
  await btn.click()
  await page.waitForTimeout(300)
  const afterDark = await page.evaluate(() => document.documentElement.classList.contains('dark'))

  if (initialDark !== afterDark) {
    pass('Theme toggle switches dark/light class on <html>')
  } else {
    fail('Theme toggle switches dark/light class on <html>', `dark class: before=${initialDark}, after=${afterDark}`)
  }
} catch (e) {
  fail('Theme toggle works', e.message)
}

// ─── NAVIGATION ──────────────────────────────────────────────────────────────
section('Navigation')

const navItems = ['Dashboard', 'Assets', 'Liabilities', 'History', 'Settings']
for (const item of navItems) {
  try {
    await page.click(`nav >> text=${item}`)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(200)
    pass(`Navigate to ${item}`)
  } catch (e) {
    fail(`Navigate to ${item}`, e.message)
  }
}

// Mobile hamburger menu
section('Mobile - Hamburger Menu')
await page.setViewportSize({ width: 375, height: 812 })
await page.goto(BASE)
await page.waitForLoadState('networkidle')

try {
  const hamburger = page.locator('button[aria-label="Open menu"]').first()
  await hamburger.waitFor({ timeout: 3000 })
  pass('Hamburger button has aria-label')
  await hamburger.click()
  await page.waitForTimeout(300)
  const sidebar = page.locator('nav').first()
  const isVisible = await sidebar.isVisible()
  if (isVisible) {
    pass('Hamburger: sidebar opens on mobile')
  } else {
    fail('Hamburger: sidebar opens on mobile', 'Sidebar not visible after click')
  }
} catch (e) {
  fail('Hamburger button / mobile nav', e.message)
}

// Reset viewport
await page.setViewportSize({ width: 1280, height: 900 })

// ─── CONSOLE ERRORS ──────────────────────────────────────────────────────────
section('Console Errors')
if (consoleErrors.length === 0) {
  pass('No console errors during test run')
} else {
  // Filter out known non-critical browser warnings
  const serious = consoleErrors.filter(e =>
    !e.includes('favicon') && !e.includes('404') && !e.includes('net::ERR_ABORTED')
  )
  if (serious.length === 0) {
    pass('No serious console errors (only minor network/favicon errors)')
  } else {
    serious.forEach(e => fail(`Console error: ${e.slice(0, 120)}`, e))
  }
}

// ─── SUMMARY ─────────────────────────────────────────────────────────────────
await browser.close()

console.log('\n════════════════════════════════════════')
const passed = results.filter(r => r.status === 'PASS').length
const failed = results.filter(r => r.status === 'FAIL')
console.log(`Results: ${passed} passed, ${failed.length} failed out of ${results.length} tests`)
if (failed.length > 0) {
  console.log('\nFailed tests:')
  failed.forEach((r, i) => console.log(`  ${i + 1}. [FAIL] ${r.name}\n       ${r.detail}`))
}
