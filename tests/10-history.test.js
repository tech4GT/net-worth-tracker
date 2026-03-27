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
    // Setup: intercept requests before any navigation (block external APIs)
    await setupRequestInterception(page)

    // Navigate, clear IDB, seed with items only (no snapshots)
    await page.goto(BASE_URL, { waitUntil: 'networkidle0' })
    await clearIndexedDB(page)
    await seedState(page, {
      items: [...sampleAssets(), ...sampleLiabilities()],
    })
    await page.reload({ waitUntil: 'networkidle0' })
    await waitForApp(page)

    // Test 1: Take snapshot from empty history
    await test('Take snapshot from empty history', async () => {
      await navigateTo(page, '/history')

      // Verify empty state
      const hasEmptyText = await pageContainsText(page, 'No snapshots yet')
      assert(hasEmptyText, 'Expected "No snapshots yet" text on empty history page')

      // Click "Take Snapshot" button
      await clickButtonByText(page, 'Take Snapshot')

      // Wait for re-render: the empty state should disappear and a snapshot card should appear
      await page.waitForFunction(
        () => !document.body.innerText.includes('No snapshots yet'),
        { timeout: 5000 }
      )

      // Verify a month name or date text appears (snapshot card rendered)
      const hasMonth = await page.evaluate(() => {
        const months = ['January', 'February', 'March', 'April', 'May', 'June',
          'July', 'August', 'September', 'October', 'November', 'December']
        return months.some((m) => document.body.innerText.includes(m))
      })
      assert(hasMonth, 'Expected a month name to appear in the snapshot card')
    })

    // Test 2: Snapshot shows item count
    await test('Snapshot shows item count', async () => {
      const hasItems = await pageContainsText(page, 'items')
      assert(hasItems, 'Expected text containing "items" in the snapshot card')
    })

    // Test 3: Expand snapshot shows breakdown
    await test('Expand snapshot shows breakdown', async () => {
      // Click the snapshot card row to expand it
      const cardRow = await page.waitForSelector(
        'div.cursor-pointer',
        { timeout: 5000 }
      )
      await cardRow.click()

      // Wait briefly for the expanded section to render
      await new Promise((r) => setTimeout(r, 500))

      // Verify breakdown labels appear
      const hasAssets = await pageContainsText(page, 'Assets')
      const hasLiabilities = await pageContainsText(page, 'Liabilities')
      const hasNetWorth = await pageContainsText(page, 'Net Worth')

      assert(hasAssets, 'Expected "Assets" label in expanded snapshot')
      assert(hasLiabilities, 'Expected "Liabilities" label in expanded snapshot')
      assert(hasNetWorth, 'Expected "Net Worth" label in expanded snapshot')
    })

    // Test 4: Delete snapshot with cancel
    await test('Delete snapshot with cancel', async () => {
      // Click the trash/delete button (the svg button inside the snapshot card row)
      await page.evaluate(() => {
        // Find the delete button (button with the trash SVG path)
        const buttons = [...document.querySelectorAll('div.cursor-pointer button')]
        const trashBtn = buttons.find((b) => b.querySelector('svg path[d*="M19 7l"]'))
        if (trashBtn) trashBtn.click()
        else throw new Error('Trash/delete button not found')
      })

      // Wait for confirmation modal
      await waitForText(page, 'Are you sure')

      const hasConfirm = await pageContainsText(page, 'This snapshot data will be permanently lost')
      assert(hasConfirm, 'Expected confirmation text about permanent deletion')

      // Click Cancel
      await clickButtonByText(page, 'Cancel')

      // Wait for modal to close
      await page.waitForFunction(
        () => !document.querySelector('div.fixed.z-50'),
        { timeout: 5000 }
      )

      // Verify the snapshot still exists (page should NOT show "No snapshots yet")
      const noEmpty = !(await pageContainsText(page, 'No snapshots yet'))
      assert(noEmpty, 'Snapshot should still exist after cancelling delete')
    })

    // Test 5: Delete snapshot confirmed
    await test('Delete snapshot confirmed', async () => {
      // Click the trash/delete button again
      await page.evaluate(() => {
        const buttons = [...document.querySelectorAll('div.cursor-pointer button')]
        const trashBtn = buttons.find((b) => b.querySelector('svg path[d*="M19 7l"]'))
        if (trashBtn) trashBtn.click()
        else throw new Error('Trash/delete button not found')
      })

      // Wait for confirmation modal
      await waitForText(page, 'Are you sure')

      // Click "Delete" button (the danger button in the modal)
      await page.evaluate(() => {
        // Find the Delete button inside the modal (not the Cancel button)
        const modal = document.querySelector('div.fixed.z-50')
        if (!modal) throw new Error('Delete confirmation modal not found')
        const buttons = [...modal.querySelectorAll('button')]
        const deleteBtn = buttons.find((b) => b.textContent.trim() === 'Delete')
        if (deleteBtn) deleteBtn.click()
        else throw new Error('Delete button not found in modal')
      })

      // Verify empty state returns
      await waitForText(page, 'No snapshots yet')
      const hasEmpty = await pageContainsText(page, 'No snapshots yet')
      assert(hasEmpty, 'Expected "No snapshots yet" after deleting the snapshot')
    })
  } finally {
    await browser.close()
  }

  const { failed } = summary()
  process.exit(failed > 0 ? 1 : 0)
}

run()
