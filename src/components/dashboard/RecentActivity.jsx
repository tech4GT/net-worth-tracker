import useStore from '../../store/store'
import { formatCurrency } from '../../lib/currency'

export default function RecentActivity() {
  const items = useStore((s) => s.items)
  const categories = useStore((s) => s.categories)

  const recent = [...items]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 5)

  if (recent.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
        <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-4">
          Recent Activity
        </h3>
        <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-4">
          No items yet
        </p>
      </div>
    )
  }

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
      <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-4">
        Recent Activity
      </h3>
      <div className="space-y-3">
        {recent.map((item) => {
          const cat = categories.find((c) => c.id === item.categoryId)
          return (
            <div key={item.id} className="flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0">
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: cat?.color || '#64748b' }}
                />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                    {item.name}
                  </p>
                  <p className="text-xs text-gray-400 dark:text-gray-500">
                    {cat?.name || 'Uncategorized'}
                  </p>
                </div>
              </div>
              <span
                className={`text-sm font-medium flex-shrink-0 ${
                  item.type === 'asset'
                    ? 'text-success-600 dark:text-success-400'
                    : 'text-danger-500'
                }`}
              >
                {item.type === 'liability' ? '-' : ''}
                {formatCurrency(item.value, item.currency)}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
