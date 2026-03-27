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
    await page.goto(BASE_URL, { waitUntil: 'networkidle0' })
    await clearIndexedDB(page)
    await setupRequestInterception(page, {})
    await page.goto(BASE_URL, { waitUntil: 'networkidle0' })
    await waitForApp(page)

    await test('Open add asset modal from empty state', async () => {
      await navigateTo(page, '/assets')
      // Empty state shows "Add Asset" button
      await waitForText(page, 'Add Asset')
      await clickButtonByText(page, 'Add Asset')
      // Wait for modal with h2 title
      const h2 = await page.waitForSelector('div[class*="fixed"] h2', { timeout: 5000 })
      const title = await h2.evaluate((el) => el.textContent.trim())
      assert(title === 'Add Asset', `Expected modal title "Add Asset", got "${title}"`)
    })

    await test('Fill form and submit asset', async () => {
      // Type name into input with placeholder containing "Chase Checking"
      const nameInput = await page.waitForSelector('input[placeholder*="Chase Checking"]', { timeout: 5000 })
      await nameInput.type('Chase Checking')

      // Select a category (the select inside the form already has a default)
      // Type value "5000" into the value number input
      const valueInput = await page.waitForSelector('input[placeholder="0.00"]', { timeout: 5000 })
      await valueInput.type('5000')

      // Click the submit button inside the form (not the toolbar button)
      // The form submit button says "Add Asset" and is type="submit"
      await page.evaluate(() => {
        const form = document.querySelector('form')
        const buttons = [...form.querySelectorAll('button[type="submit"]')]
        const submitBtn = buttons.find((b) => b.textContent.trim().includes('Add Asset'))
        if (submitBtn) submitBtn.click()
        else throw new Error('Submit button not found in form')
      })

      // Verify modal closes - wait for z-50 overlay to disappear
      await page.waitForFunction(
        () => !document.querySelector('div[class*="z-50"]'),
        { timeout: 5000 }
      )

      // Verify "Chase Checking" text appears on page
      await waitForText(page, 'Chase Checking')
      const found = await pageContainsText(page, 'Chase Checking')
      assert(found, 'Expected "Chase Checking" to appear on the page after submission')
    })

    await test('Open modal from toolbar after item exists', async () => {
      // Now the toolbar exists with an "Add Asset" button
      // Click the toolbar "Add Asset" button
      await clickButtonByText(page, 'Add Asset')

      // Verify modal opens
      const h2 = await page.waitForSelector('div[class*="fixed"] h2', { timeout: 5000 })
      const title = await h2.evaluate((el) => el.textContent.trim())
      assert(title === 'Add Asset', `Expected modal title "Add Asset", got "${title}"`)
    })

    await test('Validation shows errors on empty submit', async () => {
      // Modal is already open from previous test. Click submit immediately.
      await page.evaluate(() => {
        const form = document.querySelector('form')
        const buttons = [...form.querySelectorAll('button[type="submit"]')]
        const submitBtn = buttons.find((b) => b.textContent.trim().includes('Add Asset'))
        if (submitBtn) submitBtn.click()
        else throw new Error('Submit button not found in form')
      })

      // Verify "Name is required" text appears
      await waitForText(page, 'Name is required')
      const hasError = await pageContainsText(page, 'Name is required')
      assert(hasError, 'Expected validation error "Name is required" to appear')
    })

    await test('Cancel closes modal', async () => {
      // Click "Cancel" button
      await clickButtonByText(page, 'Cancel')

      // Verify modal overlay is gone
      await page.waitForFunction(
        () => !document.querySelector('div[class*="z-50"]'),
        { timeout: 5000 }
      )
      const modal = await page.$('div[class*="z-50"]')
      assert(modal === null, 'Expected modal to be closed after clicking Cancel')
    })
  } finally {
    await browser.close()
  }

  const { failed } = summary()
  process.exit(failed > 0 ? 1 : 0)
}

run()
