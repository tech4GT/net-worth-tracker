import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'
import useStore from '../../store/store'
import { convertToBase, formatCurrency } from '../../lib/currency'

export default function AllocationChart({ type = 'asset' }) {
  const items = useStore((s) => s.items)
  const categories = useStore((s) => s.categories)
  const baseCurrency = useStore((s) => s.baseCurrency)
  const exchangeRates = useStore((s) => s.exchangeRates)

  const filtered = items.filter((i) => i.type === type)

  // Group by category
  const grouped = {}
  filtered.forEach((item) => {
    const val = convertToBase(item.value, item.currency, baseCurrency, exchangeRates)
    if (grouped[item.categoryId]) {
      grouped[item.categoryId].value += val
    } else {
      const cat = categories.find((c) => c.id === item.categoryId)
      grouped[item.categoryId] = {
        name: cat?.name || 'Other',
        value: val,
        color: cat?.color || '#64748b',
      }
    }
  })

  const sorted = Object.values(grouped).sort((a, b) => b.value - a.value)
  const total = sorted.reduce((sum, d) => sum + d.value, 0)
  const data = sorted.map((d) => ({ ...d, percent: total > 0 ? (d.value / total) * 100 : 0 }))

  if (data.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
        <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-4">
          {type === 'asset' ? 'Asset' : 'Liability'} Allocation
        </h3>
        <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">
          No {type === 'asset' ? 'assets' : 'liabilities'} yet
        </p>
      </div>
    )
  }

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
      <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-4">
        {type === 'asset' ? 'Asset' : 'Liability'} Allocation
      </h3>
      <div className="flex items-center gap-4">
        <div className="w-40 h-40 flex-shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={35}
                outerRadius={65}
                paddingAngle={2}
                dataKey="value"
              >
                {data.map((entry, index) => (
                  <Cell key={index} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value, name, props) => {
                  const pct = props.payload.percent
                  return `${formatCurrency(value, baseCurrency)} (${pct.toFixed(1)}%)`
                }}
                contentStyle={{
                  backgroundColor: '#1f2937',
                  border: 'none',
                  borderRadius: '8px',
                  color: '#fff',
                  fontSize: '12px',
                }}
                itemStyle={{ color: '#fff' }}
                labelStyle={{ color: '#9ca3af' }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="flex-1 space-y-2 min-w-0">
          {data.map((entry) => (
            <div key={entry.name} className="flex items-center gap-2 text-sm">
              <span
                className="w-3 h-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: entry.color }}
              />
              <span className="text-gray-600 dark:text-gray-400 truncate flex-1">
                {entry.name}
              </span>
              <span className="text-gray-400 dark:text-gray-500 text-xs flex-shrink-0">
                {entry.percent.toFixed(1)}%
              </span>
              <span className="text-gray-900 dark:text-gray-200 font-medium flex-shrink-0">
                {formatCurrency(entry.value, baseCurrency)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
