import {
  launchBrowser,
  clearIndexedDB,
  seedState,
  setupRequestInterception,
  waitForApp,
  navigateTo,
  assert,
  pageContainsText,
  waitForText,
  clickButtonByText,
  getTextContent,
  getAllTextContents,
  createTestRunner,
  BASE_URL,
} from './helpers/test-utils.js'
import { fullSeedState, sampleAssets, sampleLiabilities, sampleExchangeRates, DEFAULT_CATEGORIES } from './helpers/seed-data.js'

async function run() {
  const { browser, page } = await launchBrowser()
  const { test, summary } = createTestRunner(page)

  try {
    // Setup: block frankfurter API (returns 500 so missing rate banner stays)
    await setupRequestInterception(page, {
      // frankfurter not provided, so it will be blocked by the catch-all in setupRequestInterception
    })

    await page.goto(BASE_URL, { waitUntil: 'networkidle0' })
    await clearIndexedDB(page)

    // Seed with multi-currency items + exchange rates (no JPY rate!)
    await seedState(page, {
      items: [
        {
          id: 'mc-1', type: 'asset', name: 'US Savings', categoryId: 'cat-cash',
          value: 5000, currency: 'USD', tags: [], notes: '', isStock: false,
          ticker: null, shares: null, pricePerShare: null, lastPriceUpdate: null,
          createdAt: '2025-01-01T00:00:00Z', updatedAt: '2025-01-01T00:00:00Z',
        },
        {
          id: 'mc-2', type: 'asset', name: 'UK Account', categoryId: 'cat-savings',
          value: 10000, currency: 'GBP', tags: [], notes: '', isStock: false,
          ticker: null, shares: null, pricePerShare: null, lastPriceUpdate: null,
          createdAt: '2025-01-01T00:00:00Z', updatedAt: '2025-01-01T00:00:00Z',
        },
        {
          id: 'mc-3', type: 'liability', name: 'Euro Debt', categoryId: 'cat-personal-loan',
          value: 2000, currency: 'EUR', tags: [], notes: '', isStock: false,
          ticker: null, shares: null, pricePerShare: null, lastPriceUpdate: null,
          createdAt: '2025-01-01T00:00:00Z', updatedAt: '2025-01-01T00:00:00Z',
        },
        {
          id: 'mc-4', type: 'asset', name: 'Japan Fund', categoryId: 'cat-investments',
          value: 500000, currency: 'JPY', tags: [], notes: '', isStock: false,
          ticker: null, shares: null, pricePerShare: null, lastPriceUpdate: null,
          createdAt: '2025-01-01T00:00:00Z', updatedAt: '2025-01-01T00:00:00Z',
        },
      ],
      exchangeRates: { GBP: 0.79, EUR: 0.92 }, // No JPY rate!
      baseCurrency: 'USD',
    })

    await page.reload({ waitUntil: 'networkidle0' })
    await waitForApp(page)

    // Test 1: GBP item shows original currency
    await test('GBP item shows original currency', async () => {
      await navigateTo(page, '/assets')
      await waitForText(page, 'UK Account')

      // Find the UK Account item and verify it shows a GBP-formatted value (contains pound sign or GBP)
      const hasGbpFormat = await page.evaluate(() => {
        const cards = [...document.querySelectorAll('div.space-y-2 > div')]
        const card = cards.find(c => c.textContent.includes('UK Account'))
        if (!card) return false
        const text = card.textContent
        // GBP formatted by Intl.NumberFormat uses pound sign
        return text.includes('\u00A3') || text.includes('GBP')
      })
      assert(hasGbpFormat, 'Expected UK Account item to show GBP-formatted value (pound sign or GBP)')
    })

    // Test 2: Multi-currency item shows converted value
    await test('Multi-currency item shows converted value', async () => {
      // For the GBP item, there should be a secondary smaller text showing USD equivalent
      // since baseCurrency is USD and the item currency is GBP
      // The converted value appears in a div.text-right > p.text-xs (second p in that div)
      const hasConvertedValue = await page.evaluate(() => {
        const cards = [...document.querySelectorAll('div[class*="rounded-xl"][class*="border"]')]
        const card = cards.find(c => c.textContent.includes('UK Account'))
        if (!card) return false
        // Look for a $ sign in the text-right div which shows the converted value
        const textRight = card.querySelector('div.text-right')
        if (!textRight) return false
        const allPs = textRight.querySelectorAll('p')
        // Second p is the converted value
        if (allPs.length < 2) return false
        return allPs[1].textContent.includes('$')
      })
      assert(hasConvertedValue, 'Expected UK Account to show a USD-converted value as secondary text')
    })

    // Test 3: Dashboard totals in base currency
    await test('Dashboard totals in base currency', async () => {
      await navigateTo(page, '/')
      // "Total Net Worth" has CSS uppercase, so check case-insensitively
      await page.waitForFunction(
        () => document.body.innerText.toLowerCase().includes('total net worth'),
        { timeout: 10000 }
      )

      // Verify the net worth card shows a $ value (USD is base currency)
      const netWorthText = await page.evaluate(() => {
        // The large value is in p.text-4xl.font-bold inside the gradient card
        const card = document.querySelector('div[class*="gradient"]')
        if (!card) return ''
        const bigNum = card.querySelector('p.text-4xl')
        return bigNum ? bigNum.textContent.trim() : card.textContent
      })
      assert(netWorthText.includes('$'), `Expected net worth to show $ symbol for USD, got "${netWorthText}"`)
    })

    // Test 4: Missing exchange rate warning
    await test('Missing exchange rate warning', async () => {
      // On dashboard, wait for the missing rates warning to appear
      // The auto-fetch will be attempted but fail (frankfurter is blocked),
      // so eventually it should show the missing rates text
      await page.waitForFunction(
        () => document.body.innerText.includes('Missing exchange rates') || document.body.innerText.includes('Fetching exchange rates'),
        { timeout: 10000 }
      )

      // Wait for fetching to complete (it will fail since API is blocked)
      await page.waitForFunction(
        () => document.body.innerText.includes('Missing exchange rates'),
        { timeout: 10000 }
      )

      const hasMissingRatesWarning = await pageContainsText(page, 'Missing exchange rates')
      assert(hasMissingRatesWarning, 'Expected "Missing exchange rates" warning to appear on dashboard')

      const hasJPY = await pageContainsText(page, 'JPY')
      assert(hasJPY, 'Expected "JPY" to be mentioned in the missing rates warning')
    })
  } finally {
    await browser.close()
  }

  const { failed } = summary()
  process.exit(failed > 0 ? 1 : 0)
}

run()
