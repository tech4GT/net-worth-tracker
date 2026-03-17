import { useMemo } from 'react'
import useStore from '../../store/store'
import { convertToBase, formatCurrency } from '../../lib/currency'

export default function NetWorthCard() {
  const items = useStore((s) => s.items)
  const baseCurrency = useStore((s) => s.baseCurrency)
  const exchangeRates = useStore((s) => s.exchangeRates)
  const snapshots = useStore((s) => s.snapshots)

  const netWorth = useMemo(() => {
    let assets = 0
    let liabilities = 0
    for (const i of items) {
      const val = convertToBase(i.value, i.currency, baseCurrency, exchangeRates)
      if (i.type === 'asset') assets += val
      else liabilities += val
    }
    return assets - liabilities
  }, [items, baseCurrency, exchangeRates])

  // Calculate change from last snapshot
  const lastSnapshot = snapshots.length > 0 ? snapshots[snapshots.length - 1] : null
  const change = lastSnapshot ? netWorth - lastSnapshot.netWorth : null
  const changePercent = lastSnapshot && lastSnapshot.netWorth !== 0
    ? ((netWorth - lastSnapshot.netWorth) / Math.abs(lastSnapshot.netWorth)) * 100
    : null

  return (
    <div className="bg-gradient-to-br from-primary-600 to-primary-800 rounded-2xl p-6 text-white shadow-lg">
      <p className="text-primary-200 text-sm font-medium uppercase tracking-wider">
        Total Net Worth
      </p>
      <p className="text-4xl font-bold mt-2">
        {formatCurrency(netWorth, baseCurrency)}
      </p>
      {change !== null && (
        <div className="flex items-center gap-2 mt-3">
          <span
            className={`inline-flex items-center gap-1 text-sm font-medium px-2 py-0.5 rounded-full ${
              change >= 0
                ? 'bg-white/20 text-green-200'
                : 'bg-white/20 text-red-200'
            }`}
          >
            {change >= 0 ? '\u2191' : '\u2193'}
            {formatCurrency(Math.abs(change), baseCurrency)}
            {changePercent !== null && (
              <span>({Math.abs(changePercent).toFixed(1)}%)</span>
            )}
          </span>
          <span className="text-primary-200 text-xs">vs last snapshot</span>
        </div>
      )}
    </div>
  )
}
