import { useState, useMemo } from 'react'
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
  const totalExpenses = includedTxns.filter((t) => t.type === 'expense').reduce((sum, t) => sum + (t.amount || 0), 0)
  const totalRefunds = includedTxns.filter((t) => t.type === 'refund').reduce((sum, t) => sum + (t.amount || 0), 0)
  const totalIncome = includedTxns.filter((t) => t.type === 'income').reduce((sum, t) => sum + (t.amount || 0), 0)

  const lowConfidenceCount = transactions.filter((t) => t.included && t.confidence < 0.7).length
  const uncategorizedCount = transactions.filter((t) => t.included && t.type !== 'income' && !t.categoryId).length

  // Sort: low confidence first, then uncategorized, then rest
  const sortedTransactions = useMemo(() => {
    return [...transactions].sort((a, b) => {
      const aScore = (!a.included ? 100 : 0) + (a.confidence < 0.7 ? 0 : a.categoryId ? 20 : 10)
      const bScore = (!b.included ? 100 : 0) + (b.confidence < 0.7 ? 0 : b.categoryId ? 20 : 10)
      return aScore - bScore
    })
  }, [transactions])

  const catLookup = useMemo(() => {
    const map = {}
    for (const c of (budgetCategories || [])) {
      map[c.id] = c
    }
    return map
  }, [budgetCategories])

  const updateCategory = (tempId, categoryId) => {
    setTransactions((prev) => prev.map((t) => (t.tempId === tempId ? { ...t, categoryId } : t)))
  }
  const updateType = (tempId, type) => {
    setTransactions((prev) => prev.map((t) => (t.tempId === tempId ? { ...t, type } : t)))
  }
  const toggleIncluded = (tempId) => {
    setTransactions((prev) => prev.map((t) => (t.tempId === tempId ? { ...t, included: !t.included } : t)))
  }
  const toggleAll = () => {
    const allIncluded = transactions.every((t) => t.included)
    setTransactions((prev) => prev.map((t) => ({ ...t, included: !allIncluded })))
  }

  const handleConfirm = async () => {
    setConfirming(true)
    try {
      await confirmTransactions({ month, actualIncome: totalIncome || detectedIncome, transactions: includedTxns })
    } catch { /* store handles */ } finally { setConfirming(false) }
  }

  if (!parsedTransactions || transactions.length === 0) return null

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-800">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
            Review Transactions
          </h3>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={clearParsedTransactions}>Cancel</Button>
            <Button size="sm" onClick={handleConfirm} disabled={confirming || includedTxns.length === 0}>
              {confirming ? 'Saving...' : `Confirm ${includedTxns.length} Transactions`}
            </Button>
          </div>
        </div>

        {/* Summary chips */}
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300">
            {includedTxns.length} of {transactions.length} selected
          </span>
          {totalExpenses > 0 && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400">
              Spending: {formatCurrency(totalExpenses - totalRefunds, currency)}
            </span>
          )}
          {totalIncome > 0 && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400">
              Income: {formatCurrency(totalIncome, currency)}
            </span>
          )}
          {totalRefunds > 0 && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400">
              Refunds: {formatCurrency(totalRefunds, currency)}
            </span>
          )}
        </div>

        {/* Action needed banner */}
        {(lowConfidenceCount > 0 || uncategorizedCount > 0) && (
          <div className="mt-3 flex items-start gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
            <svg className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            <div className="text-sm text-amber-800 dark:text-amber-300">
              {lowConfidenceCount > 0 && (
                <span><strong>{lowConfidenceCount} transaction{lowConfidenceCount > 1 ? 's' : ''}</strong> need your review — the AI wasn't sure about the category. </span>
              )}
              {uncategorizedCount > 0 && (
                <span><strong>{uncategorizedCount}</strong> uncategorized. </span>
              )}
              <span className="text-amber-600 dark:text-amber-400">Items needing attention are shown first.</span>
            </div>
          </div>
        )}
      </div>

      {/* Transaction list */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-800/50 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              <th className="px-4 py-3 w-10">
                <input type="checkbox" checked={transactions.every((t) => t.included)} onChange={toggleAll} className="rounded border-gray-300 dark:border-gray-600 cursor-pointer" />
              </th>
              <th className="text-left px-4 py-3">Transaction</th>
              <th className="text-left px-4 py-3">Type</th>
              <th className="text-right px-4 py-3">Amount</th>
              <th className="text-left px-4 py-3">Category</th>
              <th className="text-center px-4 py-3 w-24">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {sortedTransactions.map((txn) => {
              const isLowConf = txn.included && txn.confidence < 0.7
              const isUncategorized = txn.included && txn.type !== 'income' && !txn.categoryId
              const cat = catLookup[txn.categoryId]

              return (
                <tr
                  key={txn.tempId}
                  className={`transition-colors ${
                    !txn.included
                      ? 'opacity-30 bg-gray-50 dark:bg-gray-900'
                      : isLowConf
                      ? 'bg-amber-50 dark:bg-amber-950/30'
                      : isUncategorized
                      ? 'bg-orange-50 dark:bg-orange-950/20'
                      : txn.type === 'income'
                      ? 'bg-blue-50/40 dark:bg-blue-950/20'
                      : txn.type === 'refund'
                      ? 'bg-green-50/40 dark:bg-green-950/20'
                      : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
                  }`}
                >
                  {/* Checkbox */}
                  <td className="px-4 py-3">
                    <input type="checkbox" checked={txn.included} onChange={() => toggleIncluded(txn.tempId)} className="rounded border-gray-300 dark:border-gray-600 cursor-pointer" />
                  </td>

                  {/* Transaction: date + description */}
                  <td className="px-4 py-3">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate max-w-[240px]">
                      {txn.description}
                    </p>
                    <p className="text-xs text-gray-400 dark:text-gray-500">{txn.date}</p>
                  </td>

                  {/* Type */}
                  <td className="px-4 py-3">
                    <select
                      value={txn.type || 'expense'}
                      onChange={(e) => updateType(txn.tempId, e.target.value)}
                      className={`text-xs font-medium rounded-full px-2.5 py-1 border-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary-500 ${
                        txn.type === 'income'
                          ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'
                          : txn.type === 'refund'
                          ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
                      }`}
                    >
                      <option value="expense">Expense</option>
                      <option value="refund">Refund</option>
                      <option value="income">Income</option>
                    </select>
                  </td>

                  {/* Amount */}
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <span className={`text-sm font-semibold ${
                      txn.type === 'refund' ? 'text-green-600 dark:text-green-400'
                      : txn.type === 'income' ? 'text-blue-600 dark:text-blue-400'
                      : 'text-gray-900 dark:text-gray-100'
                    }`}>
                      {txn.type === 'refund' ? '+' : txn.type === 'income' ? '+' : '-'}{formatCurrency(txn.amount, currency)}
                    </span>
                  </td>

                  {/* Category with color dot */}
                  <td className="px-4 py-3">
                    {txn.type !== 'income' ? (
                      <div className="flex items-center gap-2">
                        {cat && (
                          <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
                        )}
                        <select
                          value={txn.categoryId || ''}
                          onChange={(e) => updateCategory(txn.tempId, e.target.value)}
                          className={`text-sm rounded-lg border px-2 py-1 focus:outline-none focus:ring-2 focus:ring-primary-500 cursor-pointer ${
                            isUncategorized
                              ? 'border-orange-300 dark:border-orange-600 bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300'
                              : isLowConf
                              ? 'border-amber-300 dark:border-amber-600 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300'
                              : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100'
                          }`}
                        >
                          <option value="">— Select category —</option>
                          {(budgetCategories || []).map((c) => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400 italic">Income — not categorized</span>
                    )}
                  </td>

                  {/* Status */}
                  <td className="px-4 py-3 text-center">
                    {isLowConf ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300">
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                        Review
                      </span>
                    ) : isUncategorized ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300">
                        Assign
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                        OK
                      </span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Bottom confirm bar */}
      <div className="px-5 py-4 border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 flex items-center justify-between">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {lowConfidenceCount === 0 && uncategorizedCount === 0
            ? 'All transactions look good!'
            : `${lowConfidenceCount + uncategorizedCount} item${lowConfidenceCount + uncategorizedCount > 1 ? 's' : ''} need attention above`
          }
        </p>
        <Button onClick={handleConfirm} disabled={confirming || includedTxns.length === 0}>
          {confirming ? 'Saving...' : `Confirm ${includedTxns.length} Transactions`}
        </Button>
      </div>
    </div>
  )
}
