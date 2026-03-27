import { useState, useEffect } from 'react'
import useStore from '../../store/store'
import { formatCurrency } from '../../lib/currency'

export default function TransactionList({ month }) {
  const loadMonthTransactions = useStore((s) => s.loadMonthTransactions)
  const budgetCategories = useStore((s) => s.budgetCategories)
  const budgetConfig = useStore((s) => s.budgetConfig)
  const currency = budgetConfig?.currency || 'USD'

  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    loadMonthTransactions(month)
      .then((data) => {
        if (!cancelled) {
          setTransactions(data?.transactions || [])
          setLoading(false)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setTransactions([])
          setLoading(false)
        }
      })
    return () => { cancelled = true }
  }, [month, loadMonthTransactions])

  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
        <div className="flex items-center justify-center py-8">
          <svg
            className="w-6 h-6 text-primary-600 animate-spin"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
        </div>
      </div>
    )
  }

  if (transactions.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
        <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-4">
          No transactions recorded for this month.
        </p>
      </div>
    )
  }

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-800">
        <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">
          Transactions ({transactions.length})
        </h3>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-800/50">
              <th className="text-left text-xs font-medium text-gray-500 dark:text-gray-400 px-4 py-3">
                Date
              </th>
              <th className="text-left text-xs font-medium text-gray-500 dark:text-gray-400 px-4 py-3">
                Description
              </th>
              <th className="text-right text-xs font-medium text-gray-500 dark:text-gray-400 px-4 py-3">
                Amount
              </th>
              <th className="text-left text-xs font-medium text-gray-500 dark:text-gray-400 px-4 py-3">
                Category
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {transactions.map((txn, i) => {
              const cat = budgetCategories.find(
                (c) => c.id === txn.categoryId
              )
              return (
                <tr key={txn.id || i}>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">
                    {txn.date}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-200 max-w-[200px] truncate">
                    {txn.description}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-200 text-right font-medium whitespace-nowrap">
                    {formatCurrency(txn.amount, currency)}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <div className="flex items-center gap-2">
                      {cat && (
                        <span
                          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: cat.color }}
                        />
                      )}
                      <span className="text-gray-600 dark:text-gray-400">
                        {cat?.name || 'Uncategorized'}
                      </span>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
