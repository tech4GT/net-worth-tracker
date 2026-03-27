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
import {
  fullSeedState,
  sampleAssets,
  sampleLiabilities,
  sampleSnapshots,
  sampleExchangeRates,
  DEFAULT_CATEGORIES,
} from './helpers/seed-data.js'

async function run() {
  const { browser, page } = await launchBrowser()
  const { test, summary } = createTestRunner(page)

  try {
    // Setup: intercept requests before navigation (block external APIs)
    await setupRequestInterception(page)

    // Navigate, clear IDB, no seed (uses default categories)
    await page.goto(BASE_URL, { waitUntil: 'networkidle0' })
    await clearIndexedDB(page)
    await page.reload({ waitUntil: 'networkidle0' })
    await waitForApp(page)

    // Navigate to settings
    await navigateTo(page, '/settings')

    // Test 1: Default asset categories display
    await test('Default asset categories display', async () => {
      const assetCategories = [
        'Cash & Checking',
        'Savings',
        'Investments',
        'Retirement',
        'Real Estate',
        'Crypto',
        'Stocks',
        'Vehicles',
        'Other Assets',
      ]

      for (const catName of assetCategories) {
        const found = await pageContainsText(page, catName)
        assert(found, `Expected asset category "${catName}" to be displayed`)
      }
    })

    // Test 2: Default liability categories display
    await test('Default liability categories display', async () => {
      const liabilityCategories = [
        'Credit Cards',
        'Student Loans',
        'Mortgage',
        'Auto Loan',
        'Personal Loan',
        'Other Liabilities',
      ]

      for (const catName of liabilityCategories) {
        const found = await pageContainsText(page, catName)
        assert(found, `Expected liability category "${catName}" to be displayed`)
      }
    })

    // Test 3: Add custom category
    await test('Add custom category', async () => {
      // Click "Add Category" button
      await clickButtonByText(page, 'Add Category')

      // Wait for the modal to appear
      await page.waitForSelector('div.fixed.z-50', { timeout: 5000 })

      // Verify modal title
      const modalTitle = await page.evaluate(() => {
        const modal = document.querySelector('div.fixed.z-50')
        if (!modal) return null
        const h2 = modal.querySelector('h2')
        return h2 ? h2.textContent.trim() : null
      })
      assert(modalTitle === 'Add Category', `Expected modal title "Add Category", got "${modalTitle}"`)

      // Type "Side Business" in the Name input (placeholder "e.g. Side Business")
      const nameInput = await page.waitForSelector('input[placeholder="e.g. Side Business"]', { timeout: 5000 })
      await nameInput.type('Side Business')

      // Leave type as "Asset" (default)

      // Click a color swatch (the circular buttons inside the modal)
      await page.evaluate(() => {
        const modal = document.querySelector('div.fixed.z-50')
        if (!modal) throw new Error('Modal not found')
        // Find color swatch buttons (round buttons with backgroundColor style)
        const swatches = [...modal.querySelectorAll('button.rounded-full')]
        if (swatches.length > 0) {
          // Click the second swatch for a different color
          swatches[1].click()
        } else {
          throw new Error('No color swatches found')
        }
      })

      // Click "Add" button inside the modal
      await page.evaluate(() => {
        const modal = document.querySelector('div.fixed.z-50')
        if (!modal) throw new Error('Modal not found')
        const buttons = [...modal.querySelectorAll('button')]
        const addBtn = buttons.find((b) => b.textContent.trim() === 'Add')
        if (addBtn) addBtn.click()
        else throw new Error('Add button not found in modal')
      })

      // Wait for modal to close
      await page.waitForFunction(
        () => !document.querySelector('div.fixed.z-50'),
        { timeout: 5000 }
      )

      // Verify "Side Business" appears in the asset categories list
      await waitForText(page, 'Side Business')
      const found = await pageContainsText(page, 'Side Business')
      assert(found, 'Expected "Side Business" to appear in asset categories list')
    })

    // Test 4: Custom category has Remove button
    await test('Custom category has Remove button', async () => {
      // Find "Side Business" row and verify it has a "Remove" button
      const hasRemove = await page.evaluate(() => {
        // Find all category rows (flex items with justify-between)
        const rows = [...document.querySelectorAll('div.flex.items-center.justify-between')]
        for (const row of rows) {
          const nameSpan = row.querySelector('span.text-sm')
          if (nameSpan && nameSpan.textContent.trim() === 'Side Business') {
            const removeBtn = row.querySelector('button')
            return removeBtn && removeBtn.textContent.trim() === 'Remove'
          }
        }
        return false
      })
      assert(hasRemove, 'Expected "Remove" button near "Side Business" custom category')
    })

    // Test 5: Default categories lack Remove
    await test('Default categories lack Remove', async () => {
      const hasRemoveForDefault = await page.evaluate(() => {
        const rows = [...document.querySelectorAll('div.flex.items-center.justify-between')]
        for (const row of rows) {
          const nameSpan = row.querySelector('span.text-sm')
          if (nameSpan && nameSpan.textContent.trim() === 'Cash & Checking') {
            // Check if there is a Remove button
            const removeBtn = row.querySelector('button')
            return removeBtn !== null
          }
        }
        return false
      })
      assert(!hasRemoveForDefault, 'Expected "Cash & Checking" (default) to NOT have a "Remove" button')
    })

    // Test 6: Remove custom category
    await test('Remove custom category', async () => {
      // Click "Remove" near "Side Business"
      await page.evaluate(() => {
        const rows = [...document.querySelectorAll('div.flex.items-center.justify-between')]
        for (const row of rows) {
          const nameSpan = row.querySelector('span.text-sm')
          if (nameSpan && nameSpan.textContent.trim() === 'Side Business') {
            const removeBtn = row.querySelector('button')
            if (removeBtn) {
              removeBtn.click()
              return
            }
          }
        }
        throw new Error('Remove button for "Side Business" not found')
      })

      // Wait for "Side Business" to disappear
      await page.waitForFunction(
        () => !document.body.innerText.includes('Side Business'),
        { timeout: 5000 }
      )

      const gone = !(await pageContainsText(page, 'Side Business'))
      assert(gone, 'Expected "Side Business" to disappear after clicking Remove')
    })
  } finally {
    await browser.close()
  }

  const { failed } = summary()
  process.exit(failed > 0 ? 1 : 0)
}

run()
