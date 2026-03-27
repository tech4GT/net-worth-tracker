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
    // Setup: intercept requests before any navigation
    await setupRequestInterception(page, {})

    // Navigate, clear IDB, seed with 1 asset item, reload
    await page.goto(BASE_URL, { waitUntil: 'networkidle0' })
    await clearIndexedDB(page)
    await seedState(page, {
      items: [sampleAssets()[0]],
    })
    await page.reload({ waitUntil: 'networkidle0' })
    await waitForApp(page)

    // Test 1: Modal opens with correct title
    await test('Modal opens with correct title', async () => {
      await navigateTo(page, '/assets')
      await waitForText(page, 'Chase Checking')

      // Click the toolbar "Add Asset" button (not the empty state one, since we have 1 item)
      await clickButtonByText(page, 'Add Asset')

      // Verify the modal overlay with z-50 exists
      const modal = await page.waitForSelector('div[class*="z-50"]', { timeout: 5000 })
      assert(modal !== null, 'Expected modal overlay with z-50 class to exist')

      // Verify h2 contains "Add Asset"
      const h2Text = await page.$eval('div[class*="z-50"] h2', el => el.textContent.trim())
      assert(h2Text === 'Add Asset', `Expected modal title "Add Asset", got "${h2Text}"`)
    })

    // Test 2: Close via X button
    await test('Close via X button', async () => {
      // Modal is still open from previous test
      // Find the close button (button in the modal header next to the h2, contains the X SVG)
      await page.evaluate(() => {
        const modal = document.querySelector('div[class*="z-50"]')
        if (!modal) throw new Error('Modal not found')
        // The header has h2 and a close button with an SVG
        const headerDiv = modal.querySelector('.flex.items-center.justify-between')
        if (!headerDiv) throw new Error('Modal header not found')
        const closeBtn = headerDiv.querySelector('button')
        if (!closeBtn) throw new Error('Close button not found in modal header')
        closeBtn.click()
      })

      // Verify modal is gone
      await page.waitForFunction(
        () => !document.querySelector('div[class*="z-50"]'),
        { timeout: 5000 }
      )
      const modal = await page.$('div[class*="z-50"]')
      assert(modal === null, 'Expected modal to be closed after clicking X button')
    })

    // Test 3: Close via Escape key
    await test('Close via Escape key', async () => {
      // Re-open the modal
      await clickButtonByText(page, 'Add Asset')
      await page.waitForSelector('div[class*="z-50"]', { timeout: 5000 })

      // Press Escape
      await page.keyboard.press('Escape')

      // Verify modal is gone
      await page.waitForFunction(
        () => !document.querySelector('div[class*="z-50"]'),
        { timeout: 5000 }
      )
      const modal = await page.$('div[class*="z-50"]')
      assert(modal === null, 'Expected modal to be closed after pressing Escape')
    })

    // Test 4: Close via backdrop click
    await test('Close via backdrop click', async () => {
      // Re-open the modal
      await clickButtonByText(page, 'Add Asset')
      await page.waitForSelector('div[class*="z-50"]', { timeout: 5000 })

      // Click on the backdrop overlay (at the very edge of the viewport)
      await page.mouse.click(10, 10)

      // Verify modal is gone
      await page.waitForFunction(
        () => !document.querySelector('div[class*="z-50"]'),
        { timeout: 5000 }
      )
      const modal = await page.$('div[class*="z-50"]')
      assert(modal === null, 'Expected modal to be closed after clicking backdrop')
    })

    // Test 5: Body scroll locked when modal open
    await test('Body scroll locked when modal open', async () => {
      // Open modal
      await clickButtonByText(page, 'Add Asset')
      await page.waitForSelector('div[class*="z-50"]', { timeout: 5000 })

      // Check body overflow is hidden
      const overflowWhenOpen = await page.evaluate(() => document.body.style.overflow)
      assert(overflowWhenOpen === 'hidden', `Expected body overflow "hidden" when modal open, got "${overflowWhenOpen}"`)

      // Close modal via Escape
      await page.keyboard.press('Escape')
      await page.waitForFunction(
        () => !document.querySelector('div[class*="z-50"]'),
        { timeout: 5000 }
      )

      // Check body overflow is empty string
      const overflowWhenClosed = await page.evaluate(() => document.body.style.overflow)
      assert(overflowWhenClosed === '', `Expected body overflow "" when modal closed, got "${overflowWhenClosed}"`)
    })

    // Test 6: Delete confirmation modal works
    await test('Delete confirmation modal works', async () => {
      // Click the delete button on the seeded item (Chase Checking)
      await page.evaluate(() => {
        const cards = [...document.querySelectorAll('div.space-y-2 > div')]
        const card = cards.find(c => c.textContent.includes('Chase Checking'))
        if (!card) throw new Error('Could not find Chase Checking card')
        const deleteBtn = card.querySelector('button[title="Delete"]')
        if (!deleteBtn) throw new Error('Could not find Delete button on Chase Checking card')
        deleteBtn.click()
      })

      // Verify modal with "Are you sure" text appears
      await waitForText(page, 'Are you sure')
      const hasConfirmText = await pageContainsText(page, 'Are you sure you want to delete this asset?')
      assert(hasConfirmText, 'Expected delete confirmation text "Are you sure you want to delete this asset?"')

      // Verify the modal title is "Delete Asset" (different from "Add Asset")
      const h2Text = await page.$eval('div[class*="z-50"] h2', el => el.textContent.trim())
      assert(h2Text === 'Delete Asset', `Expected delete modal title "Delete Asset", got "${h2Text}"`)

      // Close the modal to clean up
      await clickButtonByText(page, 'Cancel')
      await page.waitForFunction(
        () => !document.querySelector('div[class*="z-50"]'),
        { timeout: 5000 }
      )
    })
  } finally {
    await browser.close()
  }

  const { failed } = summary()
  process.exit(failed > 0 ? 1 : 0)
}

run()
