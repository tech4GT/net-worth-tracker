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
    await setupRequestInterception(page, {})
    await page.goto(BASE_URL, { waitUntil: 'networkidle0' })
    await clearIndexedDB(page)
    await seedState(page, { items: sampleAssets() })
    await page.reload({ waitUntil: 'networkidle0' })
    await waitForApp(page)

    await test('Search by name', async () => {
      await navigateTo(page, '/assets')
      await waitForText(page, 'Chase Checking')

      // Type "Chase" in the search input
      const searchInput = await page.waitForSelector(
        'input[placeholder="Search by name, ticker, or tag..."]',
        { timeout: 5000 }
      )
      await searchInput.type('Chase')

      // Small delay for filtering
      await new Promise((r) => setTimeout(r, 300))

      // Count visible item cards
      const visibleNames = await page.$$eval(
        'div.space-y-2 > div p.text-sm.font-medium',
        (els) => els.map((el) => el.textContent.trim())
      )
      assert(visibleNames.length === 1, `Expected 1 visible item, got ${visibleNames.length}`)
      assert(
        visibleNames[0] === 'Chase Checking',
        `Expected "Chase Checking", got "${visibleNames[0]}"`
      )
    })

    await test('Search by tag', async () => {
      // Clear search and type "property"
      const searchInput = await page.$('input[placeholder="Search by name, ticker, or tag..."]')
      await searchInput.click({ clickCount: 3 })
      await searchInput.press('Backspace')
      await searchInput.type('property')

      // Small delay for filtering
      await new Promise((r) => setTimeout(r, 300))

      const visibleNames = await page.$$eval(
        'div.space-y-2 > div p.text-sm.font-medium',
        (els) => els.map((el) => el.textContent.trim())
      )
      assert(visibleNames.length === 1, `Expected 1 visible item, got ${visibleNames.length}`)
      assert(
        visibleNames[0] === 'Downtown Apartment',
        `Expected "Downtown Apartment", got "${visibleNames[0]}"`
      )
    })

    await test('Filter by category', async () => {
      // Clear search first
      const searchInput = await page.$('input[placeholder="Search by name, ticker, or tag..."]')
      await searchInput.click({ clickCount: 3 })
      await searchInput.press('Backspace')

      await new Promise((r) => setTimeout(r, 300))

      // Select "Cash & Checking" from category filter
      // The category select has value="" for "All Categories" and value="cat-cash" for "Cash & Checking"
      const categorySelect = await page.$$('select')
      // First select is category filter, second is sort
      await categorySelect[0].select('cat-cash')

      await new Promise((r) => setTimeout(r, 300))

      const visibleNames = await page.$$eval(
        'div.space-y-2 > div p.text-sm.font-medium',
        (els) => els.map((el) => el.textContent.trim())
      )
      assert(visibleNames.length === 1, `Expected 1 visible item, got ${visibleNames.length}`)
      assert(
        visibleNames[0] === 'Chase Checking',
        `Expected "Chase Checking", got "${visibleNames[0]}"`
      )
    })

    await test('Sort by name', async () => {
      // Reset filter to "All Categories"
      const selects = await page.$$('select')
      await selects[0].select('')

      await new Promise((r) => setTimeout(r, 300))

      // Set sort to "Sort by Name"
      await selects[1].select('name')

      await new Promise((r) => setTimeout(r, 300))

      const visibleNames = await page.$$eval(
        'div.space-y-2 > div p.text-sm.font-medium',
        (els) => els.map((el) => el.textContent.trim())
      )

      // Verify alphabetical order
      const sorted = [...visibleNames].sort((a, b) => a.localeCompare(b))
      assert(
        JSON.stringify(visibleNames) === JSON.stringify(sorted),
        `Expected alphabetical order: ${sorted.join(', ')}, got: ${visibleNames.join(', ')}`
      )
    })

    await test('Sort by value descending', async () => {
      // Set sort to "Sort by Value"
      const selects = await page.$$('select')
      await selects[1].select('value')

      await new Promise((r) => setTimeout(r, 300))

      const visibleNames = await page.$$eval(
        'div.space-y-2 > div p.text-sm.font-medium',
        (els) => els.map((el) => el.textContent.trim())
      )

      assert(
        visibleNames[0] === 'Downtown Apartment',
        `Expected first item to be "Downtown Apartment" (highest value $350K), got "${visibleNames[0]}"`
      )
    })

    await test('Clear search shows all', async () => {
      // Type something in search
      const searchInput = await page.$('input[placeholder="Search by name, ticker, or tag..."]')
      await searchInput.type('xyz')

      await new Promise((r) => setTimeout(r, 300))

      // Now clear it
      await searchInput.click({ clickCount: 3 })
      await searchInput.press('Backspace')

      await new Promise((r) => setTimeout(r, 300))

      const visibleNames = await page.$$eval(
        'div.space-y-2 > div p.text-sm.font-medium',
        (els) => els.map((el) => el.textContent.trim())
      )

      assert(visibleNames.length === 4, `Expected 4 items after clearing search, got ${visibleNames.length}`)
    })
  } finally {
    await browser.close()
  }

  const { failed } = summary()
  process.exit(failed > 0 ? 1 : 0)
}

run()
