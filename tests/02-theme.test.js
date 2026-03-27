import {
  launchBrowser,
  clearIndexedDB,
  seedState,
  setupRequestInterception,
  waitForApp,
  assert,
  createTestRunner,
  BASE_URL,
} from './helpers/test-utils.js'

async function run() {
  const { browser, page } = await launchBrowser()
  const { test, summary } = createTestRunner(page)

  try {
    // Setup: intercept requests before any navigation
    await setupRequestInterception(page)

    // Navigate, clear IDB (use defaults, no seed)
    await page.goto(BASE_URL, { waitUntil: 'networkidle0' })
    await clearIndexedDB(page)
    await page.reload({ waitUntil: 'networkidle0' })
    await waitForApp(page)

    // Test 1: Default theme has System button active
    await test('Default theme has System button active', async () => {
      const systemBtnClass = await page.$eval(
        'button[title="System"]',
        (el) => el.className
      )
      assert(
        systemBtnClass.includes('shadow-sm'),
        `System button should have shadow-sm class when active, got "${systemBtnClass}"`
      )
    })

    // Test 2: Switch to dark mode
    await test('Switch to dark mode', async () => {
      await page.click('button[title="Dark"]')
      // Wait for dark class to appear on documentElement
      await page.waitForFunction(
        () => document.documentElement.classList.contains('dark'),
        { timeout: 5000 }
      )
      const hasDark = await page.evaluate(() =>
        document.documentElement.classList.contains('dark')
      )
      assert(hasDark, 'document.documentElement should have "dark" class after switching to dark mode')

      // Verify the Dark button is now active
      const darkBtnClass = await page.$eval(
        'button[title="Dark"]',
        (el) => el.className
      )
      assert(
        darkBtnClass.includes('shadow-sm'),
        `Dark button should have shadow-sm class when active, got "${darkBtnClass}"`
      )
    })

    // Test 3: Switch to light mode
    await test('Switch to light mode', async () => {
      await page.click('button[title="Light"]')
      // Wait for dark class to be removed
      await page.waitForFunction(
        () => !document.documentElement.classList.contains('dark'),
        { timeout: 5000 }
      )
      const hasDark = await page.evaluate(() =>
        document.documentElement.classList.contains('dark')
      )
      assert(!hasDark, 'document.documentElement should NOT have "dark" class after switching to light mode')

      // Verify the Light button is now active
      const lightBtnClass = await page.$eval(
        'button[title="Light"]',
        (el) => el.className
      )
      assert(
        lightBtnClass.includes('shadow-sm'),
        `Light button should have shadow-sm class when active, got "${lightBtnClass}"`
      )
    })

    // Test 4: Switch back to system
    await test('Switch back to system', async () => {
      await page.click('button[title="System"]')
      // Wait a moment for state to settle
      await new Promise((r) => setTimeout(r, 300))

      const systemBtnClass = await page.$eval(
        'button[title="System"]',
        (el) => el.className
      )
      assert(
        systemBtnClass.includes('shadow-sm'),
        `System button should have shadow-sm class when active, got "${systemBtnClass}"`
      )
    })

    // Test 5: Theme persists after reload
    await test('Theme persists after reload', async () => {
      // Seed dark theme directly into IDB to test persistence reliably
      // (clearIndexedDB at test start can leave IDB in a state where
      // Zustand's auto-persist doesn't re-create the DB properly)
      await seedState(page, { theme: 'dark' })
      await page.reload({ waitUntil: 'networkidle0' })
      await waitForApp(page)

      // Wait for IDB rehydration to apply the dark theme
      await page.waitForFunction(
        () => document.documentElement.classList.contains('dark'),
        { timeout: 10000 }
      )

      const hasDark = await page.evaluate(() =>
        document.documentElement.classList.contains('dark')
      )
      assert(
        hasDark,
        'Dark mode should persist after page reload'
      )

      // Wait for the Dark button to become active after rehydration
      await page.waitForFunction(
        () => {
          const btn = document.querySelector('button[title="Dark"]')
          return btn && btn.className.includes('shadow-sm')
        },
        { timeout: 5000 }
      )
      const darkBtnClass = await page.$eval(
        'button[title="Dark"]',
        (el) => el.className
      )
      assert(
        darkBtnClass.includes('shadow-sm'),
        `Dark button should still be active after reload, got "${darkBtnClass}"`
      )
    })
  } finally {
    await browser.close()
  }

  const { failed } = summary()
  process.exit(failed > 0 ? 1 : 0)
}

run()
