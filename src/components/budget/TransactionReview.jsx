import { useState } from 'react'
import useStore from '../../store/store'
import { formatCurrency } from '../../lib/currency'
import Button from '../ui/Button'

export default function TransactionReview({ month }) {
  const parsedTransactions = useStore((s) => s.parsedTransactions)
  const budgetCategories = useStore((s) => s.budgetCategories)
  const budgetConfig = useStore((s) => s.budgetConfig)
  const confirmTransactions = useStore((s) => s.confirmTransactions)
  const clearParsedTransactions = useStore((s) => s.clearParsedTransactions)
  const currency = budgetConfig?.currency || 'USD'

  const [transactions, setTransactions] = useState(
    () => parsedTransactions?.transactions || []
  )
  const [confirming, setConfirming] = useState(false)

  const summary = parsedTransactions?.summary

  const updateCategory = (tempId, budgetCategoryId) => {
    setTransactions((prev) =>
      prev.map((t) =>
        t.tempId === tempId ? { ...t, budgetCategoryId } : t
      )
    )
  }

  const handleConfirm = async () => {
    setConfirming(true)
    try {
      const incomeVal = summary?.detectedIncome || 0
      await confirmTransactions({
        month,
        actualIncome: incomeVal,
        transactions,
      })
    } catch {
      // Error handled by store
    } finally {
      setConfirming(false)
    }
  }

  if (!parsedTransactions || transactions.length === 0) {
    return null
  }

  const lowConfidenceCount = transactions.filter(
    (t) => t.confidence < 0.7
  ).length

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">
            Review Transactions
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            {transactions.length} transactions
            {summary?.totalAmount != null && (
              <> totaling {formatCurrency(summary.totalAmount, currency)}</>
            )}
            {lowConfidenceCount > 0 && (
              <span className="text-warning-600 dark:text-warning-400">
                {' '} ({lowConfidenceCount} need review)
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={clearParsedTransactions}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleConfirm}
            disabled={confirming}
          >
            {confirming ? 'Confirming...' : 'Confirm All'}
          </Button>
        </div>
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
              <th className="text-center text-xs font-medium text-gray-500 dark:text-gray-400 px-4 py-3">
                Confidence
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {transactions.map((txn) => (
              <tr
                key={txn.tempId}
                className={
                  txn.confidence < 0.7
                    ? 'bg-warning-50/50 dark:bg-warning-900/10'
                    : ''
                }
              >
                <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">
                  {txn.date}
                </td>
                <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-200 max-w-[200px] truncate">
                  {txn.description}
                </td>
                <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-200 text-right font-medium whitespace-nowrap">
                  {formatCurrency(txn.amount, currency)}
                </td>
                <td className="px-4 py-3">
                  <select
                    value={txn.budgetCategoryId || ''}
                    onChange={(e) => updateCategory(txn.tempId, e.target.value)}
                    className="text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 dark:text-gray-100 px-2 py-1 focus:outline-none focus:ring-2 focus:ring-primary-500 cursor-pointer"
                  >
                    <option value="">Uncategorized</option>
                    {budgetCategories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-3 text-center">
                  {txn.confidence < 0.7 ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-warning-100 dark:bg-warning-900/30 text-warning-700 dark:text-warning-400">
                      Review
                    </span>
                  ) : (
                    <span className="text-xs text-gray-400 dark:text-gray-500">
                      {Math.round(txn.confidence * 100)}%
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
