import useStore from '../../store/store'
import { formatCurrency } from '../../lib/currency'

export default function YTDSummaryCards() {
  const budgetYtdSummary = useStore((s) => s.budgetYtdSummary)
  const budgetConfig = useStore((s) => s.budgetConfig)
  const currency = budgetConfig?.currency || 'USD'

  if (!budgetYtdSummary) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5"
          >
            <div className="h-16 flex items-center justify-center">
              <p className="text-sm text-gray-400 dark:text-gray-500">No data yet</p>
            </div>
          </div>
        ))}
      </div>
    )
  }

  // API returns: ytdActualIncome, ytdExpectedIncome, ytdTotalSpent, ytdSavings, inDebt
  const ytdActualIncome = budgetYtdSummary.ytdActualIncome ?? 0
  const ytdExpectedIncome = budgetYtdSummary.ytdExpectedIncome ?? 0
  const ytdActualSpending = budgetYtdSummary.ytdTotalSpent ?? 0
  // Compute expected spending from category breakdown if available
  const ytdExpectedSpending = Array.isArray(budgetYtdSummary.categoryBreakdown)
    ? budgetYtdSummary.categoryBreakdown.reduce((sum, c) => sum + (c.expectedYtd || 0), 0)
    : 0
  const isInDebt = budgetYtdSummary.inDebt ?? false
  const debtAmount = isInDebt ? (ytdActualSpending - (ytdActualIncome || ytdExpectedIncome)) : 0

  const netSavings = ytdActualIncome - ytdActualSpending

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* YTD Income */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
        <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">
          YTD Income
        </p>
        <p className="text-xl font-bold text-gray-900 dark:text-gray-100 mt-1">
          {formatCurrency(ytdActualIncome, currency)}
        </p>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
          of {formatCurrency(ytdExpectedIncome, currency)} expected
        </p>
      </div>

      {/* YTD Spending */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
        <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">
          YTD Spending
        </p>
        <p className="text-xl font-bold text-gray-900 dark:text-gray-100 mt-1">
          {formatCurrency(ytdActualSpending, currency)}
        </p>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
          of {formatCurrency(ytdExpectedSpending, currency)} budgeted
        </p>
      </div>

      {/* Net Savings */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
        <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">
          Net Savings
        </p>
        <p
          className={`text-xl font-bold mt-1 ${
            netSavings >= 0
              ? 'text-success-600 dark:text-success-400'
              : 'text-danger-500'
          }`}
        >
          {formatCurrency(netSavings, currency)}
        </p>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
          income minus spending
        </p>
      </div>

      {/* Debt Alert */}
      <div
        className={`rounded-xl border p-5 ${
          isInDebt
            ? 'bg-danger-50 dark:bg-danger-900/20 border-danger-200 dark:border-danger-800'
            : 'bg-success-50 dark:bg-success-900/20 border-success-200 dark:border-success-800'
        }`}
      >
        <p
          className={`text-xs uppercase tracking-wider ${
            isInDebt
              ? 'text-danger-600 dark:text-danger-400'
              : 'text-success-600 dark:text-success-400'
          }`}
        >
          {isInDebt ? 'Over Budget' : 'On Track'}
        </p>
        <p
          className={`text-xl font-bold mt-1 ${
            isInDebt
              ? 'text-danger-600 dark:text-danger-400'
              : 'text-success-600 dark:text-success-400'
          }`}
        >
          {isInDebt
            ? formatCurrency(debtAmount, currency)
            : formatCurrency(ytdExpectedSpending - ytdActualSpending, currency)}
        </p>
        <p
          className={`text-xs mt-1 ${
            isInDebt
              ? 'text-danger-500 dark:text-danger-400'
              : 'text-success-500 dark:text-success-400'
          }`}
        >
          {isInDebt ? 'spending exceeds income' : 'under budget'}
        </p>
      </div>
    </div>
  )
}
