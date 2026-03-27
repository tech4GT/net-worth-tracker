import {
  launchBrowser,
  clearIndexedDB,
  setupRequestInterception,
  waitForApp,
  navigateTo,
  assert,
  pageContainsText,
  waitForText,
  clickButtonByText,
  getTextContent,
  createTestRunner,
  BASE_URL,
} from './helpers/test-utils.js'

async function run() {
  const { browser, page } = await launchBrowser()
  const { test, summary } = createTestRunner(page)

  try {
    // MUST setup API mocking BEFORE navigating
    await setupRequestInterception(page, {
      yahooSearch: {
        quotes: [
          { symbol: 'AAPL', longname: 'Apple Inc.', exchDisp: 'NASDAQ', quoteType: 'EQUITY' },
          { symbol: 'APLE', longname: 'Apple Hospitality REIT', exchDisp: 'NYSE', quoteType: 'EQUITY' },
        ],
      },
      yahooChart: {
        chart: {
          result: [
            {
              meta: {
                regularMarketPrice: 178.5,
                chartPreviousClose: 175.0,
                currency: 'USD',
              },
            },
          ],
        },
      },
    })

    await page.goto(BASE_URL, { waitUntil: 'networkidle0' })
    await clearIndexedDB(page)
    await page.goto(BASE_URL, { waitUntil: 'networkidle0' })
    await waitForApp(page)

    await test('Toggle stock mode shows search', async () => {
      await navigateTo(page, '/assets')
      // Open add modal from empty state
      await waitForText(page, 'Add Asset')
      await clickButtonByText(page, 'Add Asset')
      await page.waitForSelector('div[class*="fixed"] h2', { timeout: 5000 })

      // Find the stock toggle: label with text "This is a stock / ETF / fund" and click the toggle div
      await page.evaluate(() => {
        const labels = [...document.querySelectorAll('label')]
        const stockLabel = labels.find((l) =>
          l.textContent.includes('This is a stock / ETF / fund')
        )
        if (!stockLabel) throw new Error('Stock toggle label not found')
        // The toggle div is the first div child inside the label
        const toggleDiv = stockLabel.querySelector('div[class*="rounded-full"]')
        if (!toggleDiv) throw new Error('Toggle div not found')
        toggleDiv.click()
      })

      // Verify search input appears with placeholder "Type to search..."
      const searchInput = await page.waitForSelector(
        'input[placeholder*="Type to search"]',
        { timeout: 5000 }
      )
      assert(searchInput !== null, 'Expected stock search input to appear after toggling stock mode')
    })

    await test('Stock search shows results', async () => {
      // Type "Apple" in search input
      const searchInput = await page.waitForSelector(
        'input[placeholder*="Type to search"]',
        { timeout: 5000 }
      )
      await searchInput.type('Apple')

      // Wait for debounce (300ms in code) + network
      await new Promise((r) => setTimeout(r, 500))

      // Wait for dropdown results to appear
      await page.waitForSelector('div[class*="z-50"] button', { timeout: 5000 })

      // Verify "AAPL" and "Apple Inc." text appears in dropdown
      const hasAAPL = await pageContainsText(page, 'AAPL')
      assert(hasAAPL, 'Expected "AAPL" to appear in search results dropdown')
      const hasAppleInc = await pageContainsText(page, 'Apple Inc.')
      assert(hasAppleInc, 'Expected "Apple Inc." to appear in search results dropdown')
    })

    await test('Select stock fetches price', async () => {
      // Click the AAPL result row in the dropdown
      await page.evaluate(() => {
        // Find the dropdown results container
        const dropdown = document.querySelector('div.absolute.z-50')
        if (!dropdown) throw new Error('Dropdown not found')
        const buttons = [...dropdown.querySelectorAll('button')]
        const aaplBtn = buttons.find((b) => b.textContent.includes('AAPL'))
        if (!aaplBtn) throw new Error('AAPL result button not found in dropdown')
        aaplBtn.click()
      })

      // Wait for price to load (mocked, should be fast)
      await waitForText(page, '178.50')
      const hasPrice = await pageContainsText(page, '178.50')
      assert(hasPrice, 'Expected "178.50" price to appear on page after selecting AAPL')
    })

    await test('Enter shares calculates value', async () => {
      // Type "10" in the Number of Units input
      const unitsInput = await page.waitForSelector(
        'input[placeholder="e.g. 10"]',
        { timeout: 5000 }
      )
      await unitsInput.type('10')

      // Wait for value calculation to update
      await new Promise((r) => setTimeout(r, 300))

      // Verify "1,785" appears (total value: 10 * 178.50 = 1785.00)
      await waitForText(page, '1,785')
      const hasTotal = await pageContainsText(page, '1,785')
      assert(hasTotal, 'Expected total value "1,785" to appear after entering 10 shares')
    })

    await test('Manual fund entry mode', async () => {
      // Click "Can't find your fund? Enter manually" link
      await page.evaluate(() => {
        const buttons = [...document.querySelectorAll('button')]
        const manualBtn = buttons.find((b) =>
          b.textContent.includes("Can't find your fund? Enter manually")
        )
        if (!manualBtn) throw new Error('"Can\'t find your fund? Enter manually" link not found')
        manualBtn.click()
      })

      // Verify "Manual fund entry" text appears
      await waitForText(page, 'Manual fund entry')
      const hasManual = await pageContainsText(page, 'Manual fund entry')
      assert(hasManual, 'Expected "Manual fund entry" text to appear in manual mode')
    })

    await test('Back to search from manual', async () => {
      // Click "Back to search"
      await page.evaluate(() => {
        const buttons = [...document.querySelectorAll('button')]
        const backBtn = buttons.find((b) => b.textContent.includes('Back to search'))
        if (!backBtn) throw new Error('"Back to search" button not found')
        backBtn.click()
      })

      // Verify search input reappears
      const searchInput = await page.waitForSelector(
        'input[placeholder*="Type to search"]',
        { timeout: 5000 }
      )
      assert(searchInput !== null, 'Expected stock search input to reappear after clicking "Back to search"')
    })
  } finally {
    await browser.close()
  }

  const { failed } = summary()
  process.exit(failed > 0 ? 1 : 0)
}

run()
