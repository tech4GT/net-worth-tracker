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
  getAllTextContents,
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

    await test('Open add liability modal', async () => {
      await navigateTo(page, '/liabilities')
      // Empty state shows "Add Liability" button
      await waitForText(page, 'Add Liability')
      await clickButtonByText(page, 'Add Liability')

      // Wait for modal with h2 title
      const h2 = await page.waitForSelector('div[class*="fixed"] h2', { timeout: 5000 })
      const title = await h2.evaluate((el) => el.textContent.trim())
      assert(title === 'Add Liability', `Expected modal title "Add Liability", got "${title}"`)
    })

    await test('Fill form and submit liability', async () => {
      // Type name into input with placeholder containing "Student Loan"
      const nameInput = await page.waitForSelector('input[placeholder*="Student Loan"]', { timeout: 5000 })
      await nameInput.type('Visa Credit Card')

      // Type value "3200" into the value number input
      const valueInput = await page.waitForSelector('input[placeholder="0.00"]', { timeout: 5000 })
      await valueInput.type('3200')

      // Click the submit button inside the form
      await page.evaluate(() => {
        const form = document.querySelector('form')
        const buttons = [...form.querySelectorAll('button[type="submit"]')]
        const submitBtn = buttons.find((b) => b.textContent.trim().includes('Add Liability'))
        if (submitBtn) submitBtn.click()
        else throw new Error('Submit button not found in form')
      })

      // Verify modal closes
      await page.waitForFunction(
        () => !document.querySelector('div[class*="z-50"]'),
        { timeout: 5000 }
      )

      // Verify "Visa Credit Card" appears in list
      await waitForText(page, 'Visa Credit Card')
      const found = await pageContainsText(page, 'Visa Credit Card')
      assert(found, 'Expected "Visa Credit Card" to appear on the page after submission')
    })

    await test('Category dropdown has liability categories', async () => {
      // Open modal again from toolbar
      await clickButtonByText(page, 'Add Liability')
      await page.waitForSelector('div[class*="fixed"] h2', { timeout: 5000 })

      // Get all option text from the category select inside the form
      const options = await page.evaluate(() => {
        const form = document.querySelector('form')
        const selects = [...form.querySelectorAll('select')]
        // The category select is the first select in the form
        const categorySelect = selects[0]
        if (!categorySelect) throw new Error('Category select not found')
        return [...categorySelect.options].map((o) => o.textContent.trim())
      })

      const expected = ['Credit Cards', 'Student Loans', 'Mortgage', 'Auto Loan', 'Personal Loan', 'Other Liabilities']
      for (const cat of expected) {
        assert(options.includes(cat), `Expected category "${cat}" in dropdown, got: [${options.join(', ')}]`)
      }
    })

    await test('Validation errors on empty submit', async () => {
      // Modal is already open from previous test. Submit immediately without filling.
      await page.evaluate(() => {
        const form = document.querySelector('form')
        const buttons = [...form.querySelectorAll('button[type="submit"]')]
        const submitBtn = buttons.find((b) => b.textContent.trim().includes('Add Liability'))
        if (submitBtn) submitBtn.click()
        else throw new Error('Submit button not found in form')
      })

      // Verify "Name is required" text appears
      await waitForText(page, 'Name is required')
      const hasError = await pageContainsText(page, 'Name is required')
      assert(hasError, 'Expected validation error "Name is required" to appear')

      // Close modal for cleanup
      await clickButtonByText(page, 'Cancel')
    })
  } finally {
    await browser.close()
  }

  const { failed } = summary()
  process.exit(failed > 0 ? 1 : 0)
}

run()
