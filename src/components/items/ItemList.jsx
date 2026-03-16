import { useState, useMemo } from 'react'
import useStore from '../../store/store'
import { convertToBase, formatCurrency } from '../../lib/currency'
import Button from '../ui/Button'
import Modal from '../ui/Modal'
import EmptyState from '../ui/EmptyState'
import ItemForm from './ItemForm'

export default function ItemList({ type }) {
  const items = useStore((s) => s.items)
  const categories = useStore((s) => s.categories)
  const baseCurrency = useStore((s) => s.baseCurrency)
  const exchangeRates = useStore((s) => s.exchangeRates)
  const deleteItem = useStore((s) => s.deleteItem)
  const refreshStockPrices = useStore((s) => s.refreshStockPrices)
  const stocksRefreshing = useStore((s) => s.stocksRefreshing)
  const stocksLastRefreshed = useStore((s) => s.stocksLastRefreshed)
  const stockRefreshErrors = useStore((s) => s.stockRefreshErrors)

  const [showForm, setShowForm] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [deleteId, setDeleteId] = useState(null)
  const [search, setSearch] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [sortBy, setSortBy] = useState('name')
  const [refreshError, setRefreshError] = useState('')

  const hasStocks = items.some((i) => i.type === type && i.isStock)

  const handleRefresh = async () => {
    setRefreshError('')
    try {
      await refreshStockPrices()
    } catch (err) {
      setRefreshError(err.message)
    }
  }

  const filtered = useMemo(() => {
    let result = items.filter((i) => i.type === type)

    if (search) {
      const q = search.toLowerCase()
      result = result.filter(
        (i) =>
          i.name.toLowerCase().includes(q) ||
          (i.ticker && i.ticker.toLowerCase().includes(q)) ||
          (i.tags || []).some((t) => t.toLowerCase().includes(q))
      )
    }

    if (filterCategory) {
      result = result.filter((i) => i.categoryId === filterCategory)
    }

    result.sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name)
      if (sortBy === 'value') {
        const aVal = convertToBase(a.value, a.currency, baseCurrency, exchangeRates)
        const bVal = convertToBase(b.value, b.currency, baseCurrency, exchangeRates)
        return bVal - aVal
      }
      if (sortBy === 'updated') return b.updatedAt.localeCompare(a.updatedAt)
      return 0
    })

    return result
  }, [items, type, search, filterCategory, sortBy, baseCurrency, exchangeRates])

  const total = filtered.reduce(
    (sum, i) => sum + convertToBase(i.value, i.currency, baseCurrency, exchangeRates),
    0
  )

  const typeCats = categories.filter(
    (c) => c.type === type || c.type === 'both'
  )

  const typeLabel = type === 'asset' ? 'Asset' : 'Liability'

  if (items.filter((i) => i.type === type).length === 0) {
    return (
      <>
        <EmptyState
          icon={
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
          }
          title={`No ${type === 'asset' ? 'assets' : 'liabilities'} yet`}
          description={`Add your first ${type} to start tracking your net worth.`}
          action={`Add ${typeLabel}`}
          onAction={() => setShowForm(true)}
        />
        <Modal
          open={showForm}
          onClose={() => setShowForm(false)}
          title={`Add ${typeLabel}`}
        >
          <ItemForm type={type} onClose={() => setShowForm(false)} />
        </Modal>
      </>
    )
  }

  return (
    <div>
      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="flex-1">
          <input
            type="text"
            placeholder="Search by name, ticker, or tag..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 dark:text-gray-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 dark:text-gray-100 px-3 py-2 text-sm cursor-pointer"
        >
          <option value="">All Categories</option>
          {typeCats.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 dark:text-gray-100 px-3 py-2 text-sm cursor-pointer"
        >
          <option value="name">Sort by Name</option>
          <option value="value">Sort by Value</option>
          <option value="updated">Sort by Updated</option>
        </select>
        {hasStocks && (
          <Button
            variant="secondary"
            onClick={handleRefresh}
            disabled={stocksRefreshing}
          >
            {stocksRefreshing ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Refreshing...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Refresh Prices
              </>
            )}
          </Button>
        )}
        <Button onClick={() => { setEditItem(null); setShowForm(true) }}>
          Add {typeLabel}
        </Button>
      </div>

      {/* Refresh status */}
      {refreshError && (
        <div className="mb-4 p-3 bg-danger-50 dark:bg-danger-900/20 border border-danger-200 dark:border-danger-800 rounded-lg text-sm text-danger-600 dark:text-danger-400">
          {refreshError}
        </div>
      )}
      {Object.keys(stockRefreshErrors).length > 0 && !refreshError && (
        <div className="mb-4 p-3 bg-warning-50 dark:bg-warning-900/20 border border-warning-200 dark:border-warning-800 rounded-lg text-sm text-warning-600 dark:text-warning-400">
          Failed to fetch: {Object.entries(stockRefreshErrors).map(([t, e]) => `${t} (${e})`).join(', ')}
        </div>
      )}

      {/* Total */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 mb-4">
        <div className="flex justify-between items-center">
          <div>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              Total ({filtered.length} items)
            </span>
            {stocksLastRefreshed && hasStocks && (
              <span className="text-xs text-gray-400 dark:text-gray-500 ml-3">
                Prices updated {new Date(stocksLastRefreshed).toLocaleString()}
              </span>
            )}
          </div>
          <span className={`text-lg font-bold ${type === 'asset' ? 'text-success-600 dark:text-success-400' : 'text-danger-500'}`}>
            {formatCurrency(total, baseCurrency)}
          </span>
        </div>
      </div>

      {/* List */}
      <div className="space-y-2">
        {filtered.map((item) => {
          const cat = categories.find((c) => c.id === item.categoryId)
          const convertedValue = convertToBase(
            item.value,
            item.currency,
            baseCurrency,
            exchangeRates
          )
          return (
            <div
              key={item.id}
              className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 hover:border-primary-300 dark:hover:border-primary-700 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: cat?.color || '#64748b' }}
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                        {item.name}
                      </p>
                      {item.isStock && item.ticker && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-mono font-semibold bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300">
                          {item.ticker}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 dark:text-gray-500">
                      {cat?.name || 'Uncategorized'}
                      {item.isStock && item.shares && (
                        <span className="ml-2">
                          {item.shares} shares @ {formatCurrency(item.pricePerShare || 0, item.currency)}
                        </span>
                      )}
                      {item.tags?.length > 0 && (
                        <span className="ml-2">
                          {item.tags.map((t) => (
                            <span
                              key={t}
                              className="inline-block bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 rounded px-1.5 py-0.5 text-xs mr-1"
                            >
                              {t}
                            </span>
                          ))}
                        </span>
                      )}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <div className="text-right">
                    <p className={`text-sm font-semibold ${type === 'asset' ? 'text-success-600 dark:text-success-400' : 'text-danger-500'}`}>
                      {formatCurrency(item.value, item.currency)}
                    </p>
                    {item.currency !== baseCurrency && (
                      <p className="text-xs text-gray-400">
                        {formatCurrency(convertedValue, baseCurrency)}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => { setEditItem(item); setShowForm(true) }}
                      className="p-1.5 text-gray-400 hover:text-primary-500 transition-colors cursor-pointer"
                      title="Edit"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => setDeleteId(item.id)}
                      className="p-1.5 text-gray-400 hover:text-danger-500 transition-colors cursor-pointer"
                      title="Delete"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Add/Edit Modal */}
      <Modal
        open={showForm}
        onClose={() => { setShowForm(false); setEditItem(null) }}
        title={editItem ? `Edit ${typeLabel}` : `Add ${typeLabel}`}
      >
        <ItemForm
          item={editItem}
          type={type}
          onClose={() => { setShowForm(false); setEditItem(null) }}
        />
      </Modal>

      {/* Delete Confirmation */}
      <Modal
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        title={`Delete ${typeLabel}`}
        size="sm"
      >
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          Are you sure you want to delete this {type}? This action cannot be undone.
        </p>
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setDeleteId(null)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={() => { deleteItem(deleteId); setDeleteId(null) }}
          >
            Delete
          </Button>
        </div>
      </Modal>
    </div>
  )
}
