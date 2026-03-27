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
import { writeFileSync, unlinkSync } from 'fs'
import { join } from 'path'

async function run() {
  const { browser, page } = await launchBrowser()
  const { test, summary } = createTestRunner(page)

  try {
    // Setup: intercept requests before any navigation
    await setupRequestInterception(page, {})

    // Navigate, clear IDB, seed data, reload
    await page.goto(BASE_URL, { waitUntil: 'networkidle0' })
    await clearIndexedDB(page)
    await seedState(page, fullSeedState())
    await page.reload({ waitUntil: 'networkidle0' })
    await waitForApp(page)

    // Test 1: Export JSON button works without error
    await test('Export JSON button works without error', async () => {
      await navigateTo(page, '/settings')
      await waitForText(page, 'Import & Export')

      // Click Export JSON and ensure no error is thrown
      const result = await page.evaluate(() => {
        try {
          const buttons = [...document.querySelectorAll('button')]
          const btn = buttons.find(b => b.textContent.trim() === 'Export JSON')
          if (!btn) throw new Error('Export JSON button not found')
          btn.click()
          return { success: true }
        } catch (err) {
          return { success: false, error: err.message }
        }
      })
      assert(result.success, `Export JSON threw an error: ${result.error || 'unknown'}`)
    })

    // Test 2: Export CSV button works without error
    await test('Export CSV button works without error', async () => {
      await navigateTo(page, '/settings')
      await waitForText(page, 'Import & Export')

      // Click Export CSV and ensure no error is thrown
      const result = await page.evaluate(() => {
        try {
          const buttons = [...document.querySelectorAll('button')]
          const btn = buttons.find(b => b.textContent.trim() === 'Export CSV')
          if (!btn) throw new Error('Export CSV button not found')
          btn.click()
          return { success: true }
        } catch (err) {
          return { success: false, error: err.message }
        }
      })
      assert(result.success, `Export CSV threw an error: ${result.error || 'unknown'}`)
    })

    // Test 3: Import JSON shows confirmation
    await test('Import JSON shows confirmation', async () => {
      await navigateTo(page, '/settings')
      await waitForText(page, 'Import & Export')

      // Create a temporary JSON fixture file
      const tmpJson = join(process.cwd(), 'tests', 'tmp-import.json')
      writeFileSync(tmpJson, JSON.stringify({ items: [], categories: [], snapshots: [] }))

      try {
        // Find the hidden file input for JSON
        const input = await page.$('input[type="file"][accept=".json"]')
        assert(input !== null, 'Could not find hidden JSON file input')

        // Upload the file
        await input.uploadFile(tmpJson)

        // Verify confirmation modal appears
        await waitForText(page, 'This will replace all your current data')
        const hasConfirmText = await pageContainsText(page, 'This will replace all your current data')
        assert(hasConfirmText, 'Expected import confirmation text to appear')

        // Close the modal to clean up state
        await clickButtonByText(page, 'Cancel')
        await page.waitForFunction(
          () => !document.querySelector('div[class*="z-50"]'),
          { timeout: 5000 }
        )
      } finally {
        try { unlinkSync(tmpJson) } catch {}
      }
    })

    // Test 4: Import CSV shows confirmation
    await test('Import CSV shows confirmation', async () => {
      await navigateTo(page, '/settings')
      await waitForText(page, 'Import & Export')

      // Create a temporary CSV fixture file
      const tmpCsv = join(process.cwd(), 'tests', 'tmp-import.csv')
      writeFileSync(tmpCsv, '"Name","Type","Category","Value","Currency"\n"Test Item","asset","Cash & Checking","1000","USD"')

      try {
        // Find the hidden file input for CSV
        const input = await page.$('input[type="file"][accept=".csv"]')
        assert(input !== null, 'Could not find hidden CSV file input')

        // Upload the file
        await input.uploadFile(tmpCsv)

        // Verify confirmation modal appears with CSV-specific text
        await waitForText(page, 'This will add the items')
        const hasConfirmText = await pageContainsText(page, 'This will add the items')
        assert(hasConfirmText, 'Expected CSV import confirmation text to appear')

        // Close the modal to clean up state
        await clickButtonByText(page, 'Cancel')
        await page.waitForFunction(
          () => !document.querySelector('div[class*="z-50"]'),
          { timeout: 5000 }
        )
      } finally {
        try { unlinkSync(tmpCsv) } catch {}
      }
    })

    // Test 5: Invalid JSON shows error alert
    await test('Invalid JSON shows error alert', async () => {
      await navigateTo(page, '/settings')
      await waitForText(page, 'Import & Export')

      // Create a temporary file with invalid JSON content
      const tmpInvalid = join(process.cwd(), 'tests', 'tmp-invalid.json')
      writeFileSync(tmpInvalid, 'this is not valid json {{{')

      try {
        // Set up dialog listener before triggering the action
        let dialogMessage = null
        const dialogHandler = async (dialog) => {
          dialogMessage = dialog.message()
          await dialog.accept()
        }
        page.on('dialog', dialogHandler)

        // Find the hidden file input for JSON and upload the invalid file
        const input = await page.$('input[type="file"][accept=".json"]')
        assert(input !== null, 'Could not find hidden JSON file input')
        await input.uploadFile(tmpInvalid)

        // Wait for the confirmation modal to appear
        await waitForText(page, 'This will replace all your current data')

        // Click "Replace Data" to trigger the import (which will fail with invalid JSON)
        await clickButtonByText(page, 'Replace Data')

        // Wait for the dialog to appear
        await new Promise(r => setTimeout(r, 1000))

        assert(dialogMessage !== null, 'Expected an alert dialog to appear')
        assert(
          dialogMessage.includes('Invalid JSON file'),
          `Expected dialog message to contain "Invalid JSON file", got "${dialogMessage}"`
        )

        // Remove the dialog listener
        page.off('dialog', dialogHandler)
      } finally {
        try { unlinkSync(tmpInvalid) } catch {}
      }
    })
  } finally {
    await browser.close()
  }

  const { failed } = summary()
  process.exit(failed > 0 ? 1 : 0)
}

run()
