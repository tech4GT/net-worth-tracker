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

  if (!budgetYtdSummary || budgetCategories.length === 0) {
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

  const monthsCompleted = budgetYtdSummary.monthsCompleted || 1
  const yearlyIncome = budgetYtdSummary.yearlyIncome || budgetConfig?.yearlyIncome || 0

  const data = budgetCategories.map((cat) => {
    const expectedMonthly = (yearlyIncome * (cat.percentOfIncome || 0)) / 100 / 12
    const expected = expectedMonthly * monthsCompleted
    const actual = budgetYtdSummary.ytdTotalActual != null
      ? (budgetYtdSummary[`cat_${cat.id}`] || 0)
      : 0

    // Try to pull category totals from ytdSummary if available
    let categoryActual = 0
    if (budgetYtdSummary.categoryTotals) {
      categoryActual = budgetYtdSummary.categoryTotals[cat.id] || 0
    }

    return {
      name: cat.name,
      color: cat.color,
      expected: Math.round(expected * 100) / 100,
      actual: Math.round(categoryActual * 100) / 100,
      isOver: categoryActual > expected,
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
