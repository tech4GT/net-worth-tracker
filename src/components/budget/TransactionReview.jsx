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
    () => (parsedTransactions?.transactions || []).map((t) => ({ ...t, included: true, categoryId: t.categoryId || t.budgetCategoryId || '' }))
  )
  const [confirming, setConfirming] = useState(false)

  const detectedIncome = parsedTransactions?.detectedIncome ?? 0
  const includedTxns = transactions.filter((t) => t.included)
  const totalExpenses = includedTxns
    .filter((t) => t.type === 'expense')
    .reduce((sum, t) => sum + (t.amount || 0), 0)
  const totalRefunds = includedTxns
    .filter((t) => t.type === 'refund')
    .reduce((sum, t) => sum + (t.amount || 0), 0)
  const totalIncome = includedTxns
    .filter((t) => t.type === 'income')
    .reduce((sum, t) => sum + (t.amount || 0), 0)

  const updateCategory = (tempId, categoryId) => {
    setTransactions((prev) =>
      prev.map((t) => (t.tempId === tempId ? { ...t, categoryId } : t))
    )
  }

  const updateType = (tempId, type) => {
    setTransactions((prev) =>
      prev.map((t) => (t.tempId === tempId ? { ...t, type } : t))
    )
  }

  const toggleIncluded = (tempId) => {
    setTransactions((prev) =>
      prev.map((t) => (t.tempId === tempId ? { ...t, included: !t.included } : t))
    )
  }

  const toggleAll = () => {
    const allIncluded = transactions.every((t) => t.included)
    setTransactions((prev) => prev.map((t) => ({ ...t, included: !allIncluded })))
  }

  const handleConfirm = async () => {
    setConfirming(true)
    try {
      await confirmTransactions({
        month,
        actualIncome: totalIncome || detectedIncome,
        transactions: includedTxns,
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

  const lowConfidenceCount = transactions.filter((t) => t.included && t.confidence < 0.7).length

  const typeBadge = (type) => {
    if (type === 'refund')
      return (
        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
          Refund
        </span>
      )
    if (type === 'income')
      return (
        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400">
          Income
        </span>
      )
    return null
  }

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">
            Review Transactions
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            {includedTxns.length} of {transactions.length} selected
            {totalExpenses > 0 && (
              <> &middot; Spending: {formatCurrency(totalExpenses - totalRefunds, currency)}</>
            )}
            {totalIncome > 0 && (
              <> &middot; Income: {formatCurrency(totalIncome, currency)}</>
            )}
            {lowConfidenceCount > 0 && (
              <span className="text-warning-600 dark:text-warning-400">
                {' '}({lowConfidenceCount} need review)
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={clearParsedTransactions}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleConfirm} disabled={confirming || includedTxns.length === 0}>
            {confirming ? 'Confirming...' : `Confirm ${includedTxns.length} Transactions`}
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-800/50">
              <th className="px-4 py-3 w-10">
                <input
                  type="checkbox"
                  checked={transactions.every((t) => t.included)}
                  onChange={toggleAll}
                  className="rounded border-gray-300 dark:border-gray-600 cursor-pointer"
                />
              </th>
              <th className="text-left text-xs font-medium text-gray-500 dark:text-gray-400 px-4 py-3">
                Date
              </th>
              <th className="text-left text-xs font-medium text-gray-500 dark:text-gray-400 px-4 py-3">
                Description
              </th>
              <th className="text-left text-xs font-medium text-gray-500 dark:text-gray-400 px-4 py-3">
                Type
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
                className={`${
                  !txn.included
                    ? 'opacity-40'
                    : txn.confidence < 0.7
                    ? 'bg-warning-50/50 dark:bg-warning-900/10'
                    : ''
                }`}
              >
                <td className="px-4 py-3">
                  <input
                    type="checkbox"
                    checked={txn.included}
                    onChange={() => toggleIncluded(txn.tempId)}
                    className="rounded border-gray-300 dark:border-gray-600 cursor-pointer"
                  />
                </td>
                <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">
                  {txn.date}
                </td>
                <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-200 max-w-[200px] truncate">
                  {txn.description}
                </td>
                <td className="px-4 py-3">
                  <select
                    value={txn.type || 'expense'}
                    onChange={(e) => updateType(txn.tempId, e.target.value)}
                    className="text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 dark:text-gray-100 px-1.5 py-0.5 focus:outline-none focus:ring-2 focus:ring-primary-500 cursor-pointer"
                  >
                    <option value="expense">Expense</option>
                    <option value="refund">Refund</option>
                    <option value="income">Income</option>
                  </select>
                  {typeBadge(txn.type)}
                </td>
                <td className="px-4 py-3 text-sm text-right font-medium whitespace-nowrap">
                  <span className={
                    txn.type === 'refund'
                      ? 'text-green-600 dark:text-green-400'
                      : txn.type === 'income'
                      ? 'text-blue-600 dark:text-blue-400'
                      : 'text-gray-900 dark:text-gray-200'
                  }>
                    {txn.type === 'refund' ? '-' : ''}{formatCurrency(txn.amount, currency)}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {txn.type !== 'income' ? (
                    <select
                      value={txn.categoryId || ''}
                      onChange={(e) => updateCategory(txn.tempId, e.target.value)}
                      className="text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 dark:text-gray-100 px-2 py-1 focus:outline-none focus:ring-2 focus:ring-primary-500 cursor-pointer"
                    >
                      <option value="">Uncategorized</option>
                      {(budgetCategories || []).map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          {cat.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="text-xs text-gray-400 dark:text-gray-500 italic">N/A</span>
                  )}
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
