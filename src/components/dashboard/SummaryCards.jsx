import useStore from '../../store/store'
import { convertToBase, formatCurrency } from '../../lib/currency'

export default function SummaryCards() {
  const items = useStore((s) => s.items)
  const baseCurrency = useStore((s) => s.baseCurrency)
  const exchangeRates = useStore((s) => s.exchangeRates)

  const totalAssets = items
    .filter((i) => i.type === 'asset')
    .reduce((sum, i) => sum + convertToBase(i.value, i.currency, baseCurrency, exchangeRates), 0)
  const totalLiabilities = items
    .filter((i) => i.type === 'liability')
    .reduce((sum, i) => sum + convertToBase(i.value, i.currency, baseCurrency, exchangeRates), 0)

  const assetCount = items.filter((i) => i.type === 'asset').length
  const liabilityCount = items.filter((i) => i.type === 'liability').length

  const cards = [
    {
      label: 'Total Assets',
      value: totalAssets,
      count: assetCount,
      color: 'text-success-600 dark:text-success-400',
      bg: 'bg-success-50 dark:bg-success-900/20',
      iconBg: 'bg-success-100 dark:bg-success-900/40',
    },
    {
      label: 'Total Liabilities',
      value: totalLiabilities,
      count: liabilityCount,
      color: 'text-danger-500',
      bg: 'bg-danger-50 dark:bg-danger-900/20',
      iconBg: 'bg-danger-100 dark:bg-danger-900/40',
    },
  ]

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {cards.map((card) => (
        <div
          key={card.label}
          className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5"
        >
          <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">
            {card.label}
          </p>
          <p className={`text-2xl font-bold mt-1 ${card.color}`}>
            {formatCurrency(card.value, baseCurrency)}
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
            {card.count} {card.count === 1 ? 'item' : 'items'}
          </p>
        </div>
      ))}
    </div>
  )
}
