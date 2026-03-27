import useStore from '../../store/store'
import { formatCurrency } from '../../lib/currency'
import Button from '../ui/Button'

export default function BudgetCategoryList({ onEdit }) {
  const budgetCategories = useStore((s) => s.budgetCategories)
  const budgetConfig = useStore((s) => s.budgetConfig)
  const deleteBudgetCategory = useStore((s) => s.deleteBudgetCategory)
  const currency = budgetConfig?.currency || 'USD'
  const yearlyIncome = budgetConfig?.yearlyIncome || 0

  const totalAllocation = budgetCategories.reduce(
    (sum, cat) => sum + (cat.percentOfIncome || 0),
    0
  )

  const isBalanced = Math.abs(totalAllocation - 100) < 0.01

  return (
    <div className="space-y-4">
      {/* Allocation bar */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">
            Total Allocation
          </h3>
          <span
            className={`text-sm font-medium ${
              isBalanced
                ? 'text-success-600 dark:text-success-400'
                : 'text-warning-600 dark:text-warning-400'
            }`}
          >
            {totalAllocation.toFixed(1)}%
          </span>
        </div>

        {/* Progress bar */}
        <div className="h-3 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden flex">
          {budgetCategories.map((cat) => (
            <div
              key={cat.id}
              style={{
                width: `${cat.percentOfIncome || 0}%`,
                backgroundColor: cat.color,
              }}
              title={`${cat.name}: ${cat.percentOfIncome}%`}
            />
          ))}
        </div>

        {!isBalanced && (
          <p className="text-xs text-warning-600 dark:text-warning-400 mt-2">
            {totalAllocation < 100
              ? `${(100 - totalAllocation).toFixed(1)}% unallocated`
              : `${(totalAllocation - 100).toFixed(1)}% over-allocated`}
          </p>
        )}
      </div>

      {/* Category list */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 divide-y divide-gray-100 dark:divide-gray-800">
        {budgetCategories.map((cat) => {
          const monthlyAmount = (yearlyIncome * (cat.percentOfIncome || 0)) / 100 / 12

          return (
            <div
              key={cat.id}
              className="px-5 py-4 flex items-center justify-between"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span
                  className="w-3.5 h-3.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: cat.color }}
                />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                    {cat.name}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {cat.percentOfIncome}% &middot; {formatCurrency(monthlyAmount, currency)}/mo
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onEdit(cat)}
                >
                  Edit
                </Button>
                {!cat.isDefault && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => deleteBudgetCategory(cat.id)}
                  >
                    <svg className="w-4 h-4 text-gray-400 hover:text-danger-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </Button>
                )}
              </div>
            </div>
          )
        })}

        {budgetCategories.length === 0 && (
          <div className="px-5 py-8 text-center">
            <p className="text-sm text-gray-400 dark:text-gray-500">
              No budget categories yet. Add one to get started.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
