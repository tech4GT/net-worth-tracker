import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
} from 'recharts'
import useStore from '../../store/store'
import { formatCurrency, formatCompactCurrency } from '../../lib/currency'

export default function NetWorthChart() {
  const snapshots = useStore((s) => s.snapshots)
  const baseCurrency = useStore((s) => s.baseCurrency)

  if (snapshots.length < 2) {
    return (
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
        <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-4">
          Net Worth Trend
        </h3>
        <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-12">
          Take at least 2 snapshots to see your trend
        </p>
      </div>
    )
  }

  const data = [...snapshots]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((s) => ({
      date: new Date(s.date).toLocaleDateString(undefined, {
        month: 'short',
        year: '2-digit',
      }),
      netWorth: s.netWorth,
      assets: s.totalAssets,
      liabilities: s.totalLiabilities,
    }))

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
      <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-4">
        Net Worth Trend
      </h3>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <defs>
              <linearGradient id="nwGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#6366f1" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="#e5e7eb"
              className="dark:opacity-20"
            />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 12, fill: '#9ca3af' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 12, fill: '#9ca3af' }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => formatCompactCurrency(v, baseCurrency)}
            />
            <Tooltip
              formatter={(value, name) => [
                formatCurrency(value, baseCurrency),
                name === 'netWorth'
                  ? 'Net Worth'
                  : name === 'assets'
                  ? 'Assets'
                  : 'Liabilities',
              ]}
              contentStyle={{
                backgroundColor: '#1f2937',
                border: 'none',
                borderRadius: '8px',
                color: '#fff',
                fontSize: '12px',
              }}
            />
            <Area
              type="monotone"
              dataKey="netWorth"
              stroke="#6366f1"
              strokeWidth={2}
              fill="url(#nwGradient)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
