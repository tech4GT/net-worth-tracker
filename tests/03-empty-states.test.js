import {
  launchBrowser,
  clearIndexedDB,
  setupRequestInterception,
  waitForApp,
  navigateTo,
  assert,
  pageContainsText,
  waitForText,
  createTestRunner,
  BASE_URL,
} from './helpers/test-utils.js'

async function run() {
  const { browser, page } = await launchBrowser()
  const { test, summary } = createTestRunner(page)

  try {
    // Setup: intercept requests before any navigation
    await setupRequestInterception(page)

    // Navigate, clear IDB (empty state, no seed)
    await page.goto(BASE_URL, { waitUntil: 'networkidle0' })
    await clearIndexedDB(page)
    await page.reload({ waitUntil: 'networkidle0' })
    await waitForApp(page)

    // Test 1: Dashboard shows empty asset allocation
    await test('Dashboard shows empty asset allocation', async () => {
      await navigateTo(page, '/')
      await waitForText(page, 'No assets yet', 5000)
      const found = await pageContainsText(page, 'No assets yet')
      assert(found, 'Dashboard should show "No assets yet" when there are no assets')
    })

    // Test 2: Dashboard shows empty liability allocation
    await test('Dashboard shows empty liability allocation', async () => {
      const found = await pageContainsText(page, 'No liabilities yet')
      assert(found, 'Dashboard should show "No liabilities yet" when there are no liabilities')
    })

    // Test 3: Dashboard shows empty trend message
    await test('Dashboard shows empty trend message', async () => {
      const found = await pageContainsText(page, 'Take at least 2 snapshots to see your trend')
      assert(
        found,
        'Dashboard should show "Take at least 2 snapshots to see your trend" with no snapshots'
      )
    })

    // Test 4: Dashboard shows empty recent activity
    await test('Dashboard shows empty recent activity', async () => {
      const found = await pageContainsText(page, 'No items yet')
      assert(found, 'Dashboard should show "No items yet" when there are no items')
    })

    // Test 5: Assets page shows empty state
    await test('Assets page shows empty state', async () => {
      await navigateTo(page, '/assets')
      await waitForText(page, 'No assets yet', 5000)

      const found = await pageContainsText(page, 'No assets yet')
      assert(found, 'Assets page should show "No assets yet" when there are no assets')

      // Check that the "Add Asset" button exists
      const addBtnExists = await page.evaluate(() => {
        const buttons = [...document.querySelectorAll('button')]
        return buttons.some((b) => b.textContent.trim().includes('Add Asset'))
      })
      assert(addBtnExists, 'Assets page should have an "Add Asset" button in the empty state')
    })

    // Test 6: Liabilities page shows empty state
    await test('Liabilities page shows empty state', async () => {
      await navigateTo(page, '/liabilities')
      await waitForText(page, 'No liabilities yet', 5000)

      const found = await pageContainsText(page, 'No liabilities yet')
      assert(found, 'Liabilities page should show "No liabilities yet" when there are no liabilities')

      // Check that the "Add Liability" button exists
      const addBtnExists = await page.evaluate(() => {
        const buttons = [...document.querySelectorAll('button')]
        return buttons.some((b) => b.textContent.trim().includes('Add Liability'))
      })
      assert(
        addBtnExists,
        'Liabilities page should have an "Add Liability" button in the empty state'
      )
    })

    // Test 7: History page shows empty state
    await test('History page shows empty state', async () => {
      await navigateTo(page, '/history')
      await waitForText(page, 'No snapshots yet', 5000)

      const found = await pageContainsText(page, 'No snapshots yet')
      assert(found, 'History page should show "No snapshots yet" when there are no snapshots')
    })
  } finally {
    await browser.close()
  }

  const { failed } = summary()
  process.exit(failed > 0 ? 1 : 0)
}

run()
