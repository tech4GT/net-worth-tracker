import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'
import useStore from '../../store/store'
import { formatCurrency, formatCompactCurrency } from '../../lib/currency'

export default function YTDByCategoryChart() {
  const budgetYtdSummary = useStore((s) => s.budgetYtdSummary)
  const budgetCategories = useStore((s) => s.budgetCategories)
  const budgetConfig = useStore((s) => s.budgetConfig)
  const currency = budgetConfig?.currency || 'USD'

  // API returns categories as object keyed by id: { [id]: { name, color, expectedYtd, actualYtd, ... } }
  const categoriesObj = budgetYtdSummary?.categories || {}
  const categoryEntries = Object.values(categoriesObj)

  if (!budgetYtdSummary || categoryEntries.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
        <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-4">
          Spending by Category
        </h3>
        <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-12">
          No budget data yet. Upload a statement to get started.
        </p>
      </div>
    )
  }

  const data = categoryEntries.map((cb) => {
    const cat = (budgetCategories || []).find((c) => c.id === cb.categoryId)
    const expected = cb.expectedYtd || 0
    const actual = cb.actualYtd || 0
    return {
      name: cb.name || cat?.name || 'Unknown',
      color: cb.color || cat?.color || '#64748b',
      expected: Math.round(expected * 100) / 100,
      actual: Math.round(actual * 100) / 100,
      isOver: actual > expected,
    }
  }).filter((d) => d.expected > 0 || d.actual > 0)

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
      <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-4">
        Spending by Category (YTD)
      </h3>
      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 5, right: 30, left: 80, bottom: 5 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="#e5e7eb"
              className="dark:opacity-20"
              horizontal={false}
            />
            <XAxis
              type="number"
              tick={{ fontSize: 12, fill: '#9ca3af' }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => formatCompactCurrency(v, currency)}
            />
            <YAxis
              type="category"
              dataKey="name"
              tick={{ fontSize: 12, fill: '#9ca3af' }}
              axisLine={false}
              tickLine={false}
              width={75}
            />
            <Tooltip
              formatter={(value, name) => [
                formatCurrency(value, currency),
                name === 'expected' ? 'Expected' : 'Actual',
              ]}
              contentStyle={{
                backgroundColor: '#1f2937',
                border: 'none',
                borderRadius: '8px',
                color: '#fff',
                fontSize: '12px',
              }}
            />
            <Bar
              dataKey="expected"
              fill="#d1d5db"
              radius={[0, 4, 4, 0]}
              barSize={12}
              name="Expected"
            />
            <Bar
              dataKey="actual"
              radius={[0, 4, 4, 0]}
              barSize={12}
              name="Actual"
            >
              {data.map((entry, index) => (
                <Cell
                  key={index}
                  fill={entry.isOver ? '#ef4444' : entry.color}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
