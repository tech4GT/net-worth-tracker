import useStore from '../../store/store'
import { formatCurrency } from '../../lib/currency'
import Button from '../ui/Button'

export default function MonthSummaryCard({ month }) {
  const budgetMonths = useStore((s) => s.budgetMonths)
  const budgetConfig = useStore((s) => s.budgetConfig)
  const deleteMonth = useStore((s) => s.deleteMonth)
  const currency = budgetConfig?.currency || 'USD'

  const monthData = (budgetMonths || []).find((m) => m.month === month)

  if (!monthData) {
    return (
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
        <p className="text-sm text-gray-400 dark:text-gray-500 text-center">
          No data for this month. Upload a statement to get started.
        </p>
      </div>
    )
  }

  const income = monthData.actualIncome || 0
  const spending = monthData.totalSpent || 0
  const net = income - spending

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">
          Month Summary
        </h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => deleteMonth(month)}
        >
          <svg className="w-4 h-4 text-gray-400 hover:text-danger-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </Button>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div>
          <p className="text-xs text-gray-500 dark:text-gray-400">Income</p>
          <p className="text-lg font-semibold text-success-600 dark:text-success-400">
            {formatCurrency(income, currency)}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-500 dark:text-gray-400">Spending</p>
          <p className="text-lg font-semibold text-danger-500">
            {formatCurrency(spending, currency)}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-500 dark:text-gray-400">Net</p>
          <p
            className={`text-lg font-semibold ${
              net >= 0
                ? 'text-success-600 dark:text-success-400'
                : 'text-danger-500'
            }`}
          >
            {formatCurrency(net, currency)}
          </p>
        </div>
      </div>

      {/* Category breakdown */}
      {monthData.categoryTotals && Object.keys(monthData.categoryTotals).length > 0 && (
        <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800 space-y-2">
          <CategoryBreakdown
            categoryTotals={monthData.categoryTotals}
            currency={currency}
          />
        </div>
      )}
    </div>
  )
}

function CategoryBreakdown({ categoryTotals, currency }) {
  const budgetCategories = useStore((s) => s.budgetCategories)

  const entries = Object.entries(categoryTotals)
    .map(([catId, amount]) => {
      const cat = (budgetCategories || []).find((c) => c.id === catId)
      return {
        name: cat?.name || 'Unknown',
        color: cat?.color || '#64748b',
        amount,
      }
    })
    .sort((a, b) => b.amount - a.amount)

  return entries.map((entry) => (
    <div key={entry.name} className="flex items-center justify-between text-sm">
      <div className="flex items-center gap-2">
        <span
          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
          style={{ backgroundColor: entry.color }}
        />
        <span className="text-gray-600 dark:text-gray-400">{entry.name}</span>
      </div>
      <span className="text-gray-900 dark:text-gray-200 font-medium">
        {formatCurrency(entry.amount, currency)}
      </span>
    </div>
  ))
}
