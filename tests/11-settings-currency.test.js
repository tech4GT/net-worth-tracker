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
    // Setup: intercept requests before navigation, mock Frankfurter API
    await setupRequestInterception(page, {
      frankfurter: { base: 'USD', date: '2025-03-01', rates: { EUR: 0.92, GBP: 0.79, JPY: 150.25 } },
    })

    // Navigate, clear IDB, no seed (use defaults)
    await page.goto(BASE_URL, { waitUntil: 'networkidle0' })
    await clearIndexedDB(page)
    await page.reload({ waitUntil: 'networkidle0' })
    await waitForApp(page)

    // Test 1: Change base currency
    await test('Change base currency', async () => {
      await navigateTo(page, '/settings')

      // Find the Base Currency select and change to EUR
      const selectValue = await page.evaluate(() => {
        const selects = [...document.querySelectorAll('select')]
        // The Base Currency select is the first select on the page
        const currencySelect = selects.find((s) =>
          [...s.options].some((o) => o.value === 'USD' && o.textContent.includes('US Dollar'))
        )
        if (!currencySelect) throw new Error('Base Currency select not found')
        return currencySelect.value
      })
      assert(selectValue === 'USD', `Expected initial currency to be USD, got "${selectValue}"`)

      // Change to EUR
      await page.evaluate(() => {
        const selects = [...document.querySelectorAll('select')]
        const currencySelect = selects.find((s) =>
          [...s.options].some((o) => o.value === 'USD' && o.textContent.includes('US Dollar'))
        )
        if (!currencySelect) throw new Error('Base Currency select not found')
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set
        nativeInputValueSetter.call(currencySelect, 'EUR')
        currencySelect.dispatchEvent(new Event('change', { bubbles: true }))
      })

      // Wait for state to update
      await new Promise((r) => setTimeout(r, 500))

      // Verify select value is EUR
      const newValue = await page.evaluate(() => {
        const selects = [...document.querySelectorAll('select')]
        const currencySelect = selects.find((s) =>
          [...s.options].some((o) => o.value === 'EUR' && o.textContent.includes('Euro'))
        )
        return currencySelect ? currencySelect.value : null
      })
      assert(newValue === 'EUR', `Expected select value to be EUR, got "${newValue}"`)
    })

    // Test 2: Add manual exchange rate
    await test('Add manual exchange rate', async () => {
      // Find the Currency Code input (placeholder "EUR") and type "BTC"
      const codeInput = await page.waitForSelector('input[placeholder="EUR"]', { timeout: 5000 })
      await codeInput.click({ clickCount: 3 })
      await codeInput.type('BTC')

      // Find the Rate input (placeholder "0.92") and type "65000"
      const rateInput = await page.waitForSelector('input[placeholder="0.92"]', { timeout: 5000 })
      await rateInput.click({ clickCount: 3 })
      await rateInput.type('65000')

      // Click "Add" button
      await clickButtonByText(page, 'Add')

      // Wait for BTC to appear in the rates list
      await waitForText(page, 'BTC')
      const hasBTC = await pageContainsText(page, 'BTC')
      assert(hasBTC, 'Expected "BTC" to appear in the exchange rates list')
    })

    // Test 3: Edit exchange rate inline
    await test('Edit exchange rate inline', async () => {
      // Find the number input next to "BTC"
      const btcInput = await page.evaluate(() => {
        const rows = [...document.querySelectorAll('div.flex.items-center.gap-3')]
        for (const row of rows) {
          const label = row.querySelector('span')
          if (label && label.textContent.trim() === 'BTC') {
            const input = row.querySelector('input[type="number"]')
            return input ? true : false
          }
        }
        return false
      })
      assert(btcInput, 'Expected to find a number input next to BTC')

      // Triple-click to select all, then type new value
      await page.evaluate(() => {
        const rows = [...document.querySelectorAll('div.flex.items-center.gap-3')]
        for (const row of rows) {
          const label = row.querySelector('span')
          if (label && label.textContent.trim() === 'BTC') {
            const input = row.querySelector('input[type="number"]')
            if (input) {
              input.focus()
              input.select()
            }
            break
          }
        }
      })

      // Type 70000 to replace the selected text
      await page.keyboard.type('70000')

      // Wait briefly for state update
      await new Promise((r) => setTimeout(r, 300))

      // Verify input value changed
      const newVal = await page.evaluate(() => {
        const rows = [...document.querySelectorAll('div.flex.items-center.gap-3')]
        for (const row of rows) {
          const label = row.querySelector('span')
          if (label && label.textContent.trim() === 'BTC') {
            const input = row.querySelector('input[type="number"]')
            return input ? input.value : null
          }
        }
        return null
      })
      assert(
        newVal === '70000' || newVal === '70,000',
        `Expected BTC rate input value to be "70000", got "${newVal}"`
      )
    })

    // Test 4: Remove exchange rate
    await test('Remove exchange rate', async () => {
      // Find and click the delete (X) button in the BTC row
      await page.evaluate(() => {
        const rows = [...document.querySelectorAll('div.flex.items-center.gap-3')]
        for (const row of rows) {
          const label = row.querySelector('span')
          if (label && label.textContent.trim() === 'BTC') {
            // The X button is the last button in the row
            const deleteBtn = row.querySelector('button')
            if (deleteBtn) {
              deleteBtn.click()
              return
            }
          }
        }
        throw new Error('Delete button for BTC not found')
      })

      // Wait for BTC to disappear
      await page.waitForFunction(
        () => {
          const rows = [...document.querySelectorAll('div.flex.items-center.gap-3')]
          return !rows.some((row) => {
            const label = row.querySelector('span')
            return label && label.textContent.trim() === 'BTC'
          })
        },
        { timeout: 5000 }
      )

      // Verify BTC no longer appears as a rate row label
      const hasBTCRow = await page.evaluate(() => {
        const rows = [...document.querySelectorAll('div.flex.items-center.gap-3')]
        return rows.some((row) => {
          const label = row.querySelector('span')
          return label && label.textContent.trim() === 'BTC'
        })
      })
      assert(!hasBTCRow, 'Expected "BTC" to no longer appear in the exchange rates list')
    })

    // Test 5: Fetch live rates
    await test('Fetch live rates', async () => {
      // First change base currency back to USD so the fetched rates include EUR/GBP
      await page.evaluate(() => {
        const selects = [...document.querySelectorAll('select')]
        const currencySelect = selects.find((s) =>
          [...s.options].some((o) => o.value === 'USD' && o.textContent.includes('US Dollar'))
        )
        if (currencySelect) {
          const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set
          nativeInputValueSetter.call(currencySelect, 'USD')
          currencySelect.dispatchEvent(new Event('change', { bubbles: true }))
        }
      })
      await new Promise((r) => setTimeout(r, 500))

      // Click "Fetch Live Rates" button
      await page.evaluate(() => {
        const buttons = [...document.querySelectorAll('button')]
        const btn = buttons.find(b => b.textContent.trim() === 'Fetch Live Rates')
        if (btn) btn.click()
      })

      // Wait for the button to change to "Fetching..." and then back, or for rates to appear
      await new Promise((r) => setTimeout(r, 1000))

      // Wait for the mock response to populate rates
      await page.waitForFunction(
        () => {
          const body = document.body.innerText
          return body.includes('EUR') && body.includes('GBP')
        },
        { timeout: 10000 }
      )

      const hasEUR = await pageContainsText(page, 'EUR')
      const hasGBP = await pageContainsText(page, 'GBP')
      assert(hasEUR, 'Expected "EUR" to appear after fetching rates')
      assert(hasGBP, 'Expected "GBP" to appear after fetching rates')
    })
  } finally {
    await browser.close()
  }

  const { failed } = summary()
  process.exit(failed > 0 ? 1 : 0)
}

run()
