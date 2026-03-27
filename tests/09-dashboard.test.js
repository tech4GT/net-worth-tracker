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
    await setupRequestInterception(page, {
      frankfurter: { base: 'USD', date: '2025-03-01', rates: { EUR: 0.92, GBP: 0.79, JPY: 150.25 } },
    })
    await page.goto(BASE_URL, { waitUntil: 'networkidle0' })
    await clearIndexedDB(page)
    await seedState(page, fullSeedState())
    await page.reload({ waitUntil: 'networkidle0' })
    await waitForApp(page)

    await test('NetWorthCard shows total', async () => {
      await navigateTo(page, '/')

      // Note: "Total Net Worth" has CSS uppercase class, so innerText shows "TOTAL NET WORTH"
      const hasTotalLabel = await page.evaluate(() =>
        document.body.innerText.toLowerCase().includes('total net worth')
      )
      assert(hasTotalLabel, 'Expected "Total Net Worth" text on the dashboard')

      // Verify a currency value (containing "$") appears in the gradient card
      const gradientCard = await page.$('div[class*="gradient"]')
      assert(gradientCard !== null, 'Expected a gradient card for NetWorthCard')

      const cardText = await gradientCard.evaluate((el) => el.textContent)
      assert(cardText.includes('$'), 'Expected a dollar value in the NetWorthCard')
    })

    await test('SummaryCards show totals', async () => {
      // Verify "Total Assets" and "Total Liabilities" text exists
      const hasAssets = await pageContainsText(page, 'Total Assets')
      assert(hasAssets, 'Expected "Total Assets" text on the dashboard')

      const hasLiabilities = await pageContainsText(page, 'Total Liabilities')
      assert(hasLiabilities, 'Expected "Total Liabilities" text on the dashboard')

      // Verify item counts appear (e.g. "4 items" and "2 items")
      const hasAssetCount = await pageContainsText(page, '4 items')
      assert(hasAssetCount, 'Expected "4 items" count for assets')

      const hasLiabilityCount = await pageContainsText(page, '2 items')
      assert(hasLiabilityCount, 'Expected "2 items" count for liabilities')
    })

    await test('AllocationChart shows categories', async () => {
      // Verify "Asset Allocation" text exists
      const hasAllocation = await pageContainsText(page, 'Asset Allocation')
      assert(hasAllocation, 'Expected "Asset Allocation" heading on the dashboard')

      // Verify "No assets yet" does NOT appear
      const hasNoAssets = await pageContainsText(page, 'No assets yet')
      assert(!hasNoAssets, 'Expected "No assets yet" to NOT appear since items are seeded')

      // Check for a category name in the allocation section
      // The seeded assets include Cash & Checking, Stocks, Real Estate, Savings
      const hasCategoryName = await page.evaluate(() => {
        const knownCategories = ['Cash & Checking', 'Stocks', 'Real Estate', 'Savings']
        const bodyText = document.body.innerText
        return knownCategories.some((cat) => bodyText.includes(cat))
      })
      assert(hasCategoryName, 'Expected at least one category name (Cash & Checking, Stocks, etc.) in the allocation section')
    })

    await test('RecentActivity shows items', async () => {
      // Verify "Recent Activity" heading
      const hasRecent = await pageContainsText(page, 'Recent Activity')
      assert(hasRecent, 'Expected "Recent Activity" heading on the dashboard')

      // Verify at least one item name appears under Recent Activity
      // The most recently updated items from seed data include "London Savings", "Visa Credit Card", etc.
      const hasItemName = await page.evaluate(() => {
        const itemNames = ['London Savings', 'Visa Credit Card', 'Chase Checking', 'Vanguard S&P 500', 'Home Mortgage', 'Downtown Apartment']
        const bodyText = document.body.innerText
        return itemNames.some((name) => bodyText.includes(name))
      })
      assert(hasItemName, 'Expected at least one item name to appear in Recent Activity')
    })

    await test('NetWorthChart has data', async () => {
      // Verify "Net Worth Trend" heading exists
      const hasTrend = await pageContainsText(page, 'Net Worth Trend')
      assert(hasTrend, 'Expected "Net Worth Trend" heading on the dashboard')

      // Verify "Take at least 2 snapshots" does NOT appear (we seeded 3 snapshots)
      const hasNoSnapshots = await pageContainsText(page, 'Take at least 2 snapshots')
      assert(
        !hasNoSnapshots,
        'Expected "Take at least 2 snapshots" to NOT appear since 3 snapshots are seeded'
      )
    })
  } finally {
    await browser.close()
  }

  const { failed } = summary()
  process.exit(failed > 0 ? 1 : 0)
}

run()
