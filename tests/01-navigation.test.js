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
import { fullSeedState } from './helpers/seed-data.js'

async function run() {
  const { browser, page } = await launchBrowser()
  const { test, summary } = createTestRunner(page)

  try {
    // Setup: intercept requests before any navigation
    await setupRequestInterception(page)

    // Navigate, clear IDB, seed data, reload
    await page.goto(BASE_URL, { waitUntil: 'networkidle0' })
    await clearIndexedDB(page)
    await seedState(page, fullSeedState())
    await page.reload({ waitUntil: 'networkidle0' })
    await waitForApp(page)

    // Test 1: Sidebar renders all 5 nav links
    await test('Sidebar renders all 5 nav links', async () => {
      const linkTexts = await page.$$eval('aside nav a', (els) =>
        els.map((el) => el.textContent.trim())
      )
      const expected = ['Dashboard', 'Assets', 'Liabilities', 'History', 'Settings']
      assert(
        linkTexts.length === expected.length,
        `Expected ${expected.length} nav links but found ${linkTexts.length}`
      )
      for (let i = 0; i < expected.length; i++) {
        assert(
          linkTexts[i] === expected[i],
          `Expected link[${i}] to be "${expected[i]}" but got "${linkTexts[i]}"`
        )
      }
    })

    // Test 2: Clicking Assets link changes route and header title
    await test('Clicking Assets link changes route and header title', async () => {
      await page.click('a[href="#/assets"]')
      await page.waitForFunction(
        () => {
          const h1 = document.querySelector('header h1')
          return h1 && h1.textContent.trim().includes('Assets')
        },
        { timeout: 5000 }
      )
      const title = await getTextContent(page, 'header h1')
      assert(title.includes('Assets'), `Header title should contain "Assets" but got "${title}"`)
    })

    // Test 3: Clicking Liabilities link changes route
    await test('Clicking Liabilities link changes route', async () => {
      await page.click('a[href="#/liabilities"]')
      await page.waitForFunction(
        () => {
          const h1 = document.querySelector('header h1')
          return h1 && h1.textContent.trim().includes('Liabilities')
        },
        { timeout: 5000 }
      )
      const title = await getTextContent(page, 'header h1')
      assert(
        title.includes('Liabilities'),
        `Header title should contain "Liabilities" but got "${title}"`
      )
    })

    // Test 4: Clicking History link changes route
    await test('Clicking History link changes route', async () => {
      await page.click('a[href="#/history"]')
      await page.waitForFunction(
        () => {
          const h1 = document.querySelector('header h1')
          return h1 && h1.textContent.trim().includes('History')
        },
        { timeout: 5000 }
      )
      const title = await getTextContent(page, 'header h1')
      assert(
        title.includes('History'),
        `Header title should contain "History" but got "${title}"`
      )
    })

    // Test 5: Clicking Settings link changes route
    await test('Clicking Settings link changes route', async () => {
      await page.click('a[href="#/settings"]')
      await page.waitForFunction(
        () => {
          const h1 = document.querySelector('header h1')
          return h1 && h1.textContent.trim().includes('Settings')
        },
        { timeout: 5000 }
      )
      const title = await getTextContent(page, 'header h1')
      assert(
        title.includes('Settings'),
        `Header title should contain "Settings" but got "${title}"`
      )
    })

    // Test 6: Active link has highlighted styling
    await test('Active link has highlighted styling', async () => {
      await navigateTo(page, '/assets')
      const assetsLinkClass = await page.$eval('a[href="#/assets"]', (el) => el.className)
      assert(
        assetsLinkClass.includes('bg-primary-50'),
        `Assets link should have "bg-primary-50" class when active but got "${assetsLinkClass}"`
      )
    })

    // Test 7: Mobile hamburger toggles sidebar
    await test('Mobile hamburger toggles sidebar', async () => {
      // Set mobile viewport
      await page.setViewport({ width: 375, height: 667 })
      await navigateTo(page, '/')

      // Check sidebar is hidden via class (Tailwind v4 may not apply computed transforms directly)
      const hiddenClass = await page.$eval('aside', (el) => el.className)
      assert(
        hiddenClass.includes('-translate-x-full'),
        `Sidebar should have -translate-x-full class when hidden on mobile, got "${hiddenClass}"`
      )

      // Click hamburger button in header
      await page.click('header button')
      // Wait for sidebar to become visible (translate-x-0 applied, no -translate-x-full)
      await page.waitForFunction(
        () => {
          const aside = document.querySelector('aside')
          return aside && !aside.className.includes('-translate-x-full')
        },
        { timeout: 5000 }
      )

      const visibleClass = await page.$eval('aside', (el) => el.className)
      assert(
        !visibleClass.includes('-translate-x-full'),
        `Sidebar should not have -translate-x-full when open`
      )

      // Click overlay to close
      const overlay = await page.$('div.fixed.inset-0')
      if (overlay) {
        await overlay.click()
        await page.waitForFunction(
          () => {
            const aside = document.querySelector('aside')
            return aside && aside.className.includes('-translate-x-full')
          },
          { timeout: 5000 }
        )
        const closedClass = await page.$eval('aside', (el) => el.className)
        assert(
          closedClass.includes('-translate-x-full'),
          `Sidebar should be hidden again after clicking overlay`
        )
      }

      // Restore desktop viewport
      await page.setViewport({ width: 1280, height: 800 })
    })

    // Test 8: Sidebar shows net worth value
    await test('Sidebar shows net worth value', async () => {
      await navigateTo(page, '/')
      const netWorthText = await page.$eval(
        'aside .text-2xl.font-bold',
        (el) => el.textContent.trim()
      )
      assert(
        netWorthText.length > 0,
        `Net worth value should not be empty, got "${netWorthText}"`
      )
      // With seed data there should be a dollar amount displayed
      assert(
        netWorthText.includes('$') || /[\d,.]+/.test(netWorthText),
        `Net worth should contain a currency symbol or numeric value, got "${netWorthText}"`
      )
    })
  } finally {
    await browser.close()
  }

  const { failed } = summary()
  process.exit(failed > 0 ? 1 : 0)
}

run()
