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
    await seedState(page, { items: [...sampleAssets(), ...sampleLiabilities()] })
    await page.reload({ waitUntil: 'networkidle0' })
    await waitForApp(page)

    await test('Click edit populates form', async () => {
      await navigateTo(page, '/assets')
      await waitForText(page, 'Chase Checking')

      // Find the edit button for the item card containing "Chase Checking"
      await page.evaluate(() => {
        const cards = [...document.querySelectorAll('div.space-y-2 > div')]
        const card = cards.find((c) => c.textContent.includes('Chase Checking'))
        if (!card) throw new Error('Could not find Chase Checking card')
        const editBtn = card.querySelector('button[title="Edit"]')
        if (!editBtn) throw new Error('Could not find Edit button on Chase Checking card')
        editBtn.click()
      })

      // Wait for modal with title "Edit Asset"
      const h2 = await page.waitForSelector('div[class*="fixed"] h2', { timeout: 5000 })
      const title = await h2.evaluate((el) => el.textContent.trim())
      assert(title === 'Edit Asset', `Expected modal title "Edit Asset", got "${title}"`)

      // Verify form is pre-populated with "Chase Checking" in an input
      const hasName = await page.evaluate(() => {
        const inputs = [...document.querySelectorAll('form input')]
        return inputs.some((input) => input.value === 'Chase Checking')
      })
      assert(hasName, 'Expected an input with value "Chase Checking" in the edit form')
    })

    await test('Save edited value', async () => {
      // Find and clear the value input (type="number" with current value "5000")
      const valueInput = await page.evaluate(() => {
        const inputs = [...document.querySelectorAll('form input[type="number"]')]
        const valInput = inputs.find((i) => i.value === '5000')
        if (!valInput) throw new Error('Could not find value input with value 5000')
        valInput.focus()
        valInput.value = ''
        valInput.dispatchEvent(new Event('input', { bubbles: true }))
        valInput.dispatchEvent(new Event('change', { bubbles: true }))
        return true
      })

      // Use triple-click to select all, then type new value
      const numInput = await page.$('form input[type="number"][step="0.01"]')
      if (!numInput) throw new Error('Could not find value number input')
      await numInput.click({ clickCount: 3 })
      await numInput.type('6000')

      // Click "Update Asset" button
      await page.evaluate(() => {
        const form = document.querySelector('form')
        const buttons = [...form.querySelectorAll('button[type="submit"]')]
        const submitBtn = buttons.find((b) => b.textContent.trim().includes('Update Asset'))
        if (submitBtn) submitBtn.click()
        else throw new Error('Update Asset button not found')
      })

      // Wait for modal to close
      await page.waitForFunction(
        () => !document.querySelector('div[class*="z-50"]'),
        { timeout: 5000 }
      )

      // Verify the updated value is shown (formatted as $6,000)
      await waitForText(page, '$6,000')
      const hasUpdated = await pageContainsText(page, '$6,000')
      assert(hasUpdated, 'Expected "$6,000" to appear on the page after editing')
    })

    await test('Delete shows confirmation', async () => {
      // Click delete button on an item (Chase Checking)
      await page.evaluate(() => {
        const cards = [...document.querySelectorAll('div.space-y-2 > div')]
        const card = cards.find((c) => c.textContent.includes('Chase Checking'))
        if (!card) throw new Error('Could not find Chase Checking card')
        const deleteBtn = card.querySelector('button[title="Delete"]')
        if (!deleteBtn) throw new Error('Could not find Delete button on Chase Checking card')
        deleteBtn.click()
      })

      // Verify "Are you sure" text appears
      await waitForText(page, 'Are you sure you want to delete this asset?')
      const hasConfirm = await pageContainsText(page, 'Are you sure you want to delete this asset?')
      assert(hasConfirm, 'Expected delete confirmation dialog to appear')
    })

    await test('Cancel delete keeps item', async () => {
      // Click "Cancel" button in the confirmation modal
      await clickButtonByText(page, 'Cancel')

      // Wait for modal to close
      await page.waitForFunction(
        () => !document.querySelector('div[class*="z-50"]'),
        { timeout: 5000 }
      )

      // Verify the item still exists
      const stillExists = await pageContainsText(page, 'Chase Checking')
      assert(stillExists, 'Expected "Chase Checking" to still be on the page after canceling delete')
    })

    await test('Confirm delete removes item', async () => {
      // Click delete button again on Chase Checking
      await page.evaluate(() => {
        const cards = [...document.querySelectorAll('div.space-y-2 > div')]
        const card = cards.find((c) => c.textContent.includes('Chase Checking'))
        if (!card) throw new Error('Could not find Chase Checking card')
        const deleteBtn = card.querySelector('button[title="Delete"]')
        if (!deleteBtn) throw new Error('Could not find Delete button')
        deleteBtn.click()
      })

      // Wait for confirm dialog
      await waitForText(page, 'Are you sure you want to delete this asset?')

      // Click the "Delete" button (the danger variant in the modal)
      // There are two buttons in the modal: "Cancel" and "Delete"
      // We need to click the Delete button inside the modal (not the toolbar)
      await page.evaluate(() => {
        const modal = document.querySelector('div[class*="z-50"]')
        if (!modal) throw new Error('Modal not found')
        const buttons = [...modal.querySelectorAll('button')]
        const deleteBtn = buttons.find((b) => b.textContent.trim() === 'Delete')
        if (!deleteBtn) throw new Error('Delete confirm button not found in modal')
        deleteBtn.click()
      })

      // Wait for modal to close
      await page.waitForFunction(
        () => !document.querySelector('div[class*="z-50"]'),
        { timeout: 5000 }
      )

      // Small delay for state update
      await new Promise((r) => setTimeout(r, 500))

      // Verify the item is gone
      const isGone = !(await pageContainsText(page, 'Chase Checking'))
      assert(isGone, 'Expected "Chase Checking" to be removed from the page after confirming delete')
    })
  } finally {
    await browser.close()
  }

  const { failed } = summary()
  process.exit(failed > 0 ? 1 : 0)
}

run()
