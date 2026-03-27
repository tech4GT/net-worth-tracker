import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import useStore from '../../store/store'
import { formatCurrency, formatCompactCurrency } from '../../lib/currency'

export default function MonthlyTrendChart() {
  const budgetMonths = useStore((s) => s.budgetMonths)
  const budgetConfig = useStore((s) => s.budgetConfig)
  const currency = budgetConfig?.currency || 'USD'

  if (budgetMonths.length < 2) {
    return (
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
        <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-4">
          Monthly Trend
        </h3>
        <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-12">
          Upload at least 2 months of data to see trends
        </p>
      </div>
    )
  }

  const sorted = [...budgetMonths].sort((a, b) => a.month.localeCompare(b.month))

  const data = sorted.map((m) => {
    const [year, month] = m.month.split('-')
    const date = new Date(Number(year), Number(month) - 1)
    return {
      month: date.toLocaleDateString(undefined, {
        month: 'short',
        year: '2-digit',
      }),
      spending: m.totalSpending || 0,
      income: m.actualIncome || 0,
    }
  })

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
      <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-4">
        Monthly Trend
      </h3>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="#e5e7eb"
              className="dark:opacity-20"
            />
            <XAxis
              dataKey="month"
              tick={{ fontSize: 12, fill: '#9ca3af' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 12, fill: '#9ca3af' }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => formatCompactCurrency(v, currency)}
            />
            <Tooltip
              formatter={(value, name) => [
                formatCurrency(value, currency),
                name === 'spending' ? 'Total Spending' : 'Income',
              ]}
              contentStyle={{
                backgroundColor: '#1f2937',
                border: 'none',
                borderRadius: '8px',
                color: '#fff',
                fontSize: '12px',
              }}
            />
            <Legend />
            <Line
              type="monotone"
              dataKey="income"
              stroke="#22c55e"
              strokeWidth={2}
              dot={{ r: 4 }}
              name="Income"
            />
            <Line
              type="monotone"
              dataKey="spending"
              stroke="#ef4444"
              strokeWidth={2}
              dot={{ r: 4 }}
              name="Total Spending"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
