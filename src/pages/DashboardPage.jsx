import { useState, useEffect } from 'react'
import useStore from '../store/store'
import { getMissingRates } from '../lib/currency'
import NetWorthCard from '../components/dashboard/NetWorthCard'
import SummaryCards from '../components/dashboard/SummaryCards'
import NetWorthChart from '../components/dashboard/NetWorthChart'
import AllocationChart from '../components/dashboard/AllocationChart'
import RecentActivity from '../components/dashboard/RecentActivity'

export default function DashboardPage() {
  const items = useStore((s) => s.items)
  const baseCurrency = useStore((s) => s.baseCurrency)
  const exchangeRates = useStore((s) => s.exchangeRates)
  const lastSnapshotDate = useStore((s) => s.lastSnapshotDate)
  const snapshotReminder = useStore((s) => s.snapshotReminder)
  const takeSnapshot = useStore((s) => s.takeSnapshot)
  const refreshExchangeRates = useStore((s) => s.refreshExchangeRates)

  const [fetchingRates, setFetchingRates] = useState(false)
  const [ratesFetchError, setRatesFetchError] = useState(false)

  // Show reminder if no snapshot in 30+ days
  const showReminder = !!(snapshotReminder && items.length > 0 && (() => {
    if (!lastSnapshotDate) return true
    const diff = Date.now() - new Date(lastSnapshotDate).getTime()
    return diff > 30 * 24 * 60 * 60 * 1000
  })())

  // Warn about missing exchange rates
  const missingRates = getMissingRates(items, baseCurrency, exchangeRates)

  // Auto-fetch exchange rates when missing rates are detected
  useEffect(() => {
    if (missingRates.length > 0 && !fetchingRates) {
      setFetchingRates(true)
      setRatesFetchError(false)
      refreshExchangeRates()
        .catch(() => setRatesFetchError(true))
        .finally(() => setFetchingRates(false))
    }
  }, [missingRates.length]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-6 max-w-6xl">
      {missingRates.length > 0 && (
        <div className="bg-warning-50 dark:bg-warning-900/20 border border-warning-200 dark:border-warning-800 rounded-xl p-4 flex items-center justify-between gap-4">
          <p className="text-sm text-warning-700 dark:text-warning-300">
            {fetchingRates
              ? 'Fetching exchange rates...'
              : ratesFetchError
                ? <>Could not fetch exchange rates. Items in <strong>{missingRates.join(', ')}</strong> are excluded from totals.</>
                : <>Missing exchange rates for: <strong>{missingRates.join(', ')}</strong>. Items in these currencies are excluded from totals.</>
            }
          </p>
          {!fetchingRates && (
            <button
              onClick={() => {
                setFetchingRates(true)
                setRatesFetchError(false)
                refreshExchangeRates()
                  .catch(() => setRatesFetchError(true))
                  .finally(() => setFetchingRates(false))
              }}
              className="text-sm font-medium text-warning-600 dark:text-warning-400 hover:text-warning-800 dark:hover:text-warning-200 whitespace-nowrap cursor-pointer"
            >
              Retry
            </button>
          )}
        </div>
      )}

      {showReminder && (
        <div className="bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800 rounded-xl p-4 flex items-center justify-between gap-4">
          <p className="text-sm text-primary-700 dark:text-primary-300">
            It's been a while since your last snapshot. Take one to track your progress!
          </p>
          <button
            onClick={takeSnapshot}
            className="text-sm font-medium text-primary-600 dark:text-primary-400 hover:text-primary-800 dark:hover:text-primary-200 whitespace-nowrap cursor-pointer"
          >
            Take Snapshot
          </button>
        </div>
      )}

      <NetWorthCard />
      <SummaryCards />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <AllocationChart type="asset" />
        <AllocationChart type="liability" />
      </div>

      <NetWorthChart />
      <RecentActivity />
    </div>
  )
}
